import { NextResponse } from "next/server";
import { buildPayrollCsv, type PayrollLine } from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { writeAudit, clientIp } from "@/lib/audit";

// Payroll export: GET /api/payroll/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// Streams a semicolon-delimited CSV of APPROVED worked hours per crew per shift,
// ready for the payroll provider. Admin-only (handles IBAN + wage data). Requires
// the time-tracking columns (migration 0013); the hourly cost column (0015) is
// included only when NEXT_PUBLIC_COSTING is on, so the export degrades gracefully.

const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";
const COSTING = process.env.NEXT_PUBLIC_COSTING === "true";

type CrewLite = {
  crew_code: string;
  first_name: string;
  last_name: string;
  iban: string | null;
  hourly_cost?: number | null;
};
type EventRow = {
  name: string;
  start_datetime: string;
  assignments: {
    status: string;
    hours_worked: number | null;
    hours_approved: boolean | null;
    crew: CrewLite | null;
  }[];
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!TIME_TRACKING) {
    return NextResponse.json(
      { error: "Urenregistratie staat uit (NEXT_PUBLIC_TIME_TRACKING)." },
      { status: 400 }
    );
  }
  if (!(await hasPerm("crew"))) {
    return NextResponse.json({ error: "Geen rechten voor de payroll-export." }, { status: 403 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = url.searchParams.get("from") || isoDay(firstOfMonth);
  const to = url.searchParams.get("to") || isoDay(now);

  // Inclusive upper bound: shift "to" to the end of that day.
  const toEnd = new Date(`${to}T23:59:59.999`);
  const fromStart = new Date(`${from}T00:00:00`);
  if (Number.isNaN(fromStart.getTime()) || Number.isNaN(toEnd.getTime())) {
    return NextResponse.json({ error: "Ongeldige datums." }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const crewCols = `crew_code, first_name, last_name, iban${COSTING ? ", hourly_cost" : ""}`;
  const { data, error } = await supabase
    .from("events")
    .select(`name, start_datetime, assignments(status, hours_worked, hours_approved, crew(${crewCols}))`)
    .gte("start_datetime", fromStart.toISOString())
    .lte("start_datetime", toEnd.toISOString())
    .order("start_datetime", { ascending: true });

  if (error) {
    console.error("payroll export: query failed", error);
    return NextResponse.json({ error: "Kon uren niet ophalen" }, { status: 500 });
  }

  const events = (data ?? []) as unknown as EventRow[];
  const lines: PayrollLine[] = [];
  for (const ev of events) {
    const date = ev.start_datetime.slice(0, 10);
    for (const a of ev.assignments ?? []) {
      // Only approved hours for crew who actually worked the shift.
      if (a.status !== "confirmed" && a.status !== "checked_in") continue;
      if (!a.hours_approved || a.hours_worked == null || a.hours_worked <= 0) continue;
      if (!a.crew) continue;
      lines.push({
        crew_code: a.crew.crew_code,
        crew_name: `${a.crew.first_name} ${a.crew.last_name}`,
        iban: a.crew.iban,
        event_name: ev.name,
        date,
        hours: a.hours_worked,
        hourly_cost: COSTING ? a.crew.hourly_cost ?? null : null,
      });
    }
  }

  // Sort by crew then date for a readable, payroll-friendly file.
  lines.sort((x, y) => x.crew_code.localeCompare(y.crew_code) || x.date.localeCompare(y.date));

  // UTF-8 BOM so Excel detects the encoding and renders accents correctly.
  const csv = "﻿" + buildPayrollCsv(lines);

  await writeAudit({
    action: "EXPORT",
    table_name: "assignments",
    new_data: { kind: "payroll_export", from, to, rows: lines.length },
    ip: clientIp(request),
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uren-${from}_tot_${to}.csv"`,
    },
  });
}
