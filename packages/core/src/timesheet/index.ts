// Time-tracking logic. Pure, no I/O — worked hours are derived from an
// assignment's clock-in/out and break, and live ON the assignment (the app keeps
// the whole lifecycle plan → match → confirm → work on one record, rather than
// a separate parallel time-tracking module).

export interface WorkedHoursInput {
  clock_in: string | null | undefined; // ISO timestamp
  clock_out: string | null | undefined; // ISO timestamp
  break_minutes?: number | null;
}

/**
 * Net worked hours = (clock_out − clock_in) − break, rounded to 2 decimals.
 * Returns 0 when inputs are missing/invalid or the interval is non-positive,
 * so callers can sum safely without guarding every row.
 */
export function computeWorkedHours(input: WorkedHoursInput): number {
  if (!input.clock_in || !input.clock_out) return 0;
  const start = new Date(input.clock_in).getTime();
  const end = new Date(input.clock_out).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  const grossHours = (end - start) / 3_600_000;
  const breakHours = Math.max(0, input.break_minutes ?? 0) / 60;
  const net = grossHours - breakHours;
  if (net <= 0) return 0;
  return Math.round(net * 100) / 100;
}

/** Sum worked hours across many assignments. */
export function sumWorkedHours(rows: WorkedHoursInput[]): number {
  const total = rows.reduce((acc, r) => acc + computeWorkedHours(r), 0);
  return Math.round(total * 100) / 100;
}

/** Format decimal hours as "7:30" (h:mm). */
export function formatHoursClock(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0:00";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
