import { NextResponse } from "next/server";
import {
  eventReminderMessage,
  parseLeadDays,
  daysBetween,
  REMINDER_SUBJECT,
} from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  authorizeCron,
  getAppBaseUrl,
  portalEnabled,
  contactFor,
  notificationsTableExists,
  formatDateNl,
  formatTimeNl,
} from "@/lib/automation/cron";

// Enqueue "X dagen vóór event" reminders into the notifications outbox. Runs
// idempotently: a crew member already holding a queued/sent reminder for an
// event is skipped (deduped on event_id + crew_id + the reminder subject), so a
// daily cron won't double-send. Dispatch itself is a separate concern (the
// outbox is drained by the messaging adapter when configured).
//
// Trigger: GET/POST /api/cron/reminders  (Bearer CRON_SECRET, or admin session).
// Config:  REMINDER_LEAD_DAYS="7,3,1" (default "3").

type EventRow = {
  id: string;
  name: string;
  venue: string | null;
  start_datetime: string;
  status: string;
  assignments: {
    id: string;
    crew_id: string;
    status: string;
    crew: { first_name: string; phone: string | null; email: string | null } | null;
  }[];
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

  const leadDays = parseLeadDays(process.env.REMINDER_LEAD_DAYS);
  const maxLead = leadDays[leadDays.length - 1]!;
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + maxLead + 1);

  // Upcoming events within the furthest lead window that still need crew there.
  const { data: evData, error: evErr } = await supabase
    .from("events")
    .select(
      "id, name, venue, start_datetime, status, assignments(id, crew_id, status, crew(first_name, phone, email))"
    )
    .gte("start_datetime", now.toISOString())
    .lte("start_datetime", horizon.toISOString())
    .in("status", ["planned", "confirmed"]);

  if (evErr) {
    console.error("reminders: event query failed", evErr);
    return NextResponse.json({ error: "Kon events niet ophalen" }, { status: 500 });
  }

  const events = (evData ?? []) as unknown as EventRow[];
  // Only events landing exactly on one of the lead-day marks today.
  const due = events.filter((e) =>
    leadDays.includes(daysBetween(now, new Date(e.start_datetime)))
  );
  if (due.length === 0) {
    return NextResponse.json({ queued: 0, events_considered: events.length });
  }

  // Dedupe: existing reminder notifications for these events.
  const eventIds = due.map((e) => e.id);
  const { data: existing } = await supabase
    .from("notifications")
    .select("event_id, crew_id")
    .eq("subject", REMINDER_SUBJECT)
    .in("status", ["queued", "sent"])
    .in("event_id", eventIds);
  const alreadySent = new Set(
    ((existing ?? []) as { event_id: string | null; crew_id: string | null }[]).map(
      (r) => `${r.event_id}:${r.crew_id}`
    )
  );

  const base = getAppBaseUrl();
  const canDeepLink = base && portalEnabled();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (const e of due) {
    for (const a of e.assignments ?? []) {
      // Remind crew who are expected to show (invited or already confirmed).
      if (a.status !== "invited" && a.status !== "confirmed") continue;
      if (!a.crew) continue;
      if (alreadySent.has(`${e.id}:${a.crew_id}`)) continue;
      const { channel, to } = contactFor(a.crew);
      if (!to) continue;

      const body = eventReminderMessage({
        crew_first_name: a.crew.first_name,
        event_name: e.name,
        event_date: formatDateNl(e.start_datetime),
        event_time: formatTimeNl(e.start_datetime),
        venue: e.venue,
        confirm_url: canDeepLink ? `${base}/portaal/bevestig/${a.id}` : null,
      });

      rows.push({
        crew_id: a.crew_id,
        event_id: e.id,
        channel,
        to_address: to,
        subject: REMINDER_SUBJECT,
        body,
        status: "queued",
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ queued: 0, events_considered: events.length, due: due.length });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("notifications") as any).insert(rows).select("id");
  if (error) {
    console.error("reminders: insert failed", error);
    return NextResponse.json({ error: "Kon herinneringen niet in de wachtrij zetten" }, { status: 500 });
  }

  await writeAudit({
    action: "INSERT",
    table_name: "notifications",
    new_data: { kind: "event_reminder", queued: rows.length, lead_days: leadDays },
  });

  return NextResponse.json({ queued: (data ?? []).length, events: due.length });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
