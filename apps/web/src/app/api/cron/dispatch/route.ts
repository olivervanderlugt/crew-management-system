import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { authorizeCron, notificationsTableExists } from "@/lib/automation/cron";
import { getDispatcher } from "@/lib/automation/dispatch";

// Drains the notifications outbox: sends every queued message via the configured
// provider (WhatsApp), then marks it sent/failed. Fail-closed — if the flag is
// off or credentials are missing, getDispatcher() returns ok:false and this
// route sends NOTHING. Idempotent by design: only status="queued" rows are
// picked up, and each is flipped to sent/failed as it is processed.
//
// Trigger: GET/POST /api/cron/dispatch  (Bearer CRON_SECRET, or admin session).
// Config:  NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true + WHATSAPP_ACCESS_TOKEN +
//          WHATSAPP_PHONE_NUMBER_ID (+ optional WHATSAPP_TEMPLATE_NAME).

const BATCH = 50;

type QueuedRow = {
  id: string;
  channel: string;
  to_address: string | null;
  body: string;
};

async function handle(request: Request) {
  const auth = await authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createServiceClient();
  if (!(await notificationsTableExists(supabase))) {
    return NextResponse.json(
      { skipped: true, reason: "notifications-tabel ontbreekt — pas migratie 0011 toe" },
      { status: 200 }
    );
  }

  const dispatcher = getDispatcher();
  if (!dispatcher.ok) {
    return NextResponse.json({ skipped: true, reason: dispatcher.reason }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("id, channel, to_address, body")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("dispatch: query failed", error);
    return NextResponse.json({ error: "Kon de wachtrij niet ophalen" }, { status: 500 });
  }

  const rows = (data ?? []) as QueuedRow[];
  if (rows.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, queued: 0 });
  }

  let sent = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    if (!row.to_address) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("notifications") as any)
        .update({ status: "failed", error: "Geen ontvangeradres" })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const result = await dispatcher.send(row.channel, row.to_address, row.body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("notifications") as any)
      .update(
        result.ok
          ? { status: "sent", sent_at: nowIso, error: null }
          : { status: "failed", error: result.error }
      )
      .eq("id", row.id);
    if (result.ok) sent++;
    else failed++;
  }

  await writeAudit({
    action: "UPDATE",
    table_name: "notifications",
    new_data: { kind: "dispatch", provider: dispatcher.provider, sent, failed },
  });

  return NextResponse.json({ sent, failed, processed: rows.length });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
