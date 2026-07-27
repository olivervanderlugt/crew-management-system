import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { authorizeCron } from "@/lib/automation/cron";

// Auto "checked-in" after shift end: confirmed crew on an event whose end time
// has passed are flipped to checked_in, so time-tracking/uren has a baseline
// without a planner ticking every row. Bounded to a recent lookback window
// (default 48h) so it never back-fills ancient no-shows. Idempotent: only
// 'confirmed' rows are touched.
//
// Trigger: GET/POST /api/cron/auto-checkin  (Bearer CRON_SECRET, or admin session).
// Config:  AUTO_CHECKIN_LOOKBACK_HOURS (default "48"). Set AUTO_CHECKIN=false to disable.

type Row = {
  id: string;
  event_id: string;
  events: { end_datetime: string; status: string } | null;
};

async function handle(request: Request) {
  const auth = await authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (process.env.AUTO_CHECKIN === "false") {
    return NextResponse.json({ skipped: true, reason: "AUTO_CHECKIN uitgeschakeld" });
  }

  const lookbackHours = Math.max(
    1,
    parseInt(process.env.AUTO_CHECKIN_LOOKBACK_HOURS ?? "48", 10) || 48
  );
  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackHours * 3_600_000);

  const supabase = await createServiceClient();

  // Confirmed assignments whose event ended within the lookback window.
  const { data, error } = await supabase
    .from("assignments")
    .select("id, event_id, events!inner(end_datetime, status)")
    .eq("status", "confirmed")
    .lt("events.end_datetime", now.toISOString())
    .gte("events.end_datetime", cutoff.toISOString());

  if (error) {
    console.error("auto-checkin: query failed", error);
    return NextResponse.json({ error: "Kon toewijzingen niet ophalen" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  const ids = rows
    .filter((r) => r.events && r.events.status !== "cancelled")
    .map((r) => r.id);

  if (ids.length === 0) {
    return NextResponse.json({ checked_in: 0 });
  }

  // Only flip the status — keep the original responded_at (when the crew
  // actually confirmed) intact for the audit trail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supabase.from("assignments") as any)
    .update({ status: "checked_in" })
    .in("id", ids)
    .eq("status", "confirmed"); // guard against races

  if (updErr) {
    console.error("auto-checkin: update failed", updErr);
    return NextResponse.json({ error: "Kon niet inchecken" }, { status: 500 });
  }

  await writeAudit({
    action: "UPDATE",
    table_name: "assignments",
    new_data: { kind: "auto_checkin", count: ids.length, assignment_ids: ids },
  });

  return NextResponse.json({ checked_in: ids.length });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
