import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { writeAudit, clientIp } from "@/lib/audit";

type Recipient = { crew_id: string; to_address: string | null; name: string };
type Body = {
  event_id?: string | null;
  event_name?: string | null;
  event_date?: string | null;
  channel?: string;
  subject?: string | null;
  body?: string;
  recipients?: Recipient[];
};

// Render the simple {{placeholders}} in a message template.
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// Enqueue notifications into the outbox. Actual dispatch (WhatsApp/email) is
// wired separately behind feature flags + adapters; rows start as 'queued'.
export async function POST(request: Request) {
  try {
    if (!(await hasPerm("assignments"))) {
      return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
    }
    const body = (await request.json()) as Body;
    const recipients = body.recipients ?? [];
    if (!body.body || recipients.length === 0) {
      return NextResponse.json({ error: "Bericht en ontvangers zijn vereist" }, { status: 400 });
    }

    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    const supabase = await createServiceClient();

    const rows = recipients.map((r) => ({
      crew_id: r.crew_id,
      event_id: body.event_id ?? null,
      channel: body.channel ?? "whatsapp",
      to_address: r.to_address,
      subject: body.subject ?? null,
      body: render(body.body!, {
        naam: r.name,
        event: body.event_name ?? "",
        datum: body.event_date ?? "",
      }),
      status: "queued",
      created_by: user?.id ?? null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("notifications") as any).insert(rows).select("id");
    if (error) {
      // Most likely cause: migration 0011 not applied yet.
      console.error("notifications insert error:", error);
      return NextResponse.json(
        { error: "Kon niet in de wachtrij zetten (is migratie 0011 toegepast?)" },
        { status: 500 }
      );
    }

    await writeAudit({
      action: "INSERT",
      table_name: "notifications",
      record_id: body.event_id ?? null,
      new_data: { count: rows.length, channel: body.channel, event_id: body.event_id },
      ip: clientIp(request),
    });

    return NextResponse.json({ queued: (data ?? []).length }, { status: 201 });
  } catch (err) {
    console.error("notifications POST error:", err);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
