import { NextResponse } from "next/server";
import {
  availabilityReminderMessage,
  availabilitySubject,
  monthLabelNl,
} from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  authorizeCron,
  getAppBaseUrl,
  portalEnabled,
  contactFor,
  notificationsTableExists,
} from "@/lib/automation/cron";

// Monthly "vul je beschikbaarheid in" request to all active crew. Meant to run
// near month-end (see vercel.json) and asks for the UPCOMING month. The subject
// embeds that month, so re-running within the month is a no-op per crew member
// (deduped on crew_id + subject) — safe to schedule daily as a safety net.
//
// Trigger: GET/POST /api/cron/availability-reminder  (Bearer CRON_SECRET, or admin session).

type CrewRow = { id: string; first_name: string; phone: string | null; email: string | null };

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

  // Target the next calendar month.
  const now = new Date();
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const subject = availabilitySubject(targetMonth);
  const monthLabel = monthLabelNl(targetMonth);

  const { data: crewData, error: crewErr } = await supabase
    .from("crew")
    .select("id, first_name, phone, email")
    .eq("status", "active");
  if (crewErr) {
    console.error("availability-reminder: crew query failed", crewErr);
    return NextResponse.json({ error: "Kon crew niet ophalen" }, { status: 500 });
  }
  const crew = (crewData ?? []) as CrewRow[];

  // Dedupe against crew already asked for this month.
  const { data: existing } = await supabase
    .from("notifications")
    .select("crew_id")
    .eq("subject", subject)
    .in("status", ["queued", "sent"]);
  const alreadyAsked = new Set(
    ((existing ?? []) as { crew_id: string | null }[]).map((r) => r.crew_id)
  );

  const base = getAppBaseUrl();
  const availabilityUrl = base && portalEnabled() ? `${base}/portaal/beschikbaarheid` : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (const c of crew) {
    if (alreadyAsked.has(c.id)) continue;
    const { channel, to } = contactFor(c);
    if (!to) continue;
    rows.push({
      crew_id: c.id,
      event_id: null,
      channel,
      to_address: to,
      subject,
      body: availabilityReminderMessage({
        crew_first_name: c.first_name,
        month_label: monthLabel,
        availability_url: availabilityUrl,
      }),
      status: "queued",
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ queued: 0, month: monthLabel, crew_active: crew.length });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("notifications") as any).insert(rows).select("id");
  if (error) {
    console.error("availability-reminder: insert failed", error);
    return NextResponse.json({ error: "Kon verzoeken niet in de wachtrij zetten" }, { status: 500 });
  }

  await writeAudit({
    action: "INSERT",
    table_name: "notifications",
    new_data: { kind: "availability_reminder", month: monthLabel, queued: rows.length },
  });

  return NextResponse.json({ queued: (data ?? []).length, month: monthLabel });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
