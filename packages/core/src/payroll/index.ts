// Payroll export — pure, no I/O. Turns approved worked-hours rows into a CSV
// the office can hand to a payroll provider (Nmbrs/Loket/AFAS) or open in Excel.
// The DB/route layer in apps/web gathers the rows; this only formats them.

export interface PayrollLine {
  crew_code: string;
  crew_name: string;
  iban?: string | null;
  event_name: string;
  /** ISO date (YYYY-MM-DD) of the shift. */
  date: string;
  hours: number;
  /** Wage cost per hour (EUR); when set, amount = hours × hourly_cost. */
  hourly_cost?: number | null;
}

// Semicolon-delimited: the NL-Excel default, and it sidesteps the comma-decimal
// ambiguity payroll imports trip over. A field is quoted only when it contains a
// quote, semicolon or newline; embedded quotes are doubled (RFC 4180).
const DELIMITER = ";";

function escapeField(value: string): string {
  if (/[";\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => escapeField(f == null ? "" : typeof f === "number" ? f.toFixed(2) : f))
    .join(DELIMITER);
}

export const PAYROLL_CSV_HEADERS = [
  "Crew-ID",
  "Naam",
  "IBAN",
  "Event",
  "Datum",
  "Uren",
  "Uurtarief",
  "Bedrag",
] as const;

/** Amount for one line, or null when no hourly cost is known. */
export function payrollLineAmount(line: PayrollLine): number | null {
  if (line.hourly_cost == null) return null;
  return Math.round(line.hours * line.hourly_cost * 100) / 100;
}

/**
 * Builds the payroll CSV (header + one row per line). Rows are emitted in the
 * order given — sort upstream (e.g. by crew then date). Numeric fields use a dot
 * decimal and two places; the route should prepend a UTF-8 BOM for Excel.
 */
export function buildPayrollCsv(lines: PayrollLine[]): string {
  const rows = [PAYROLL_CSV_HEADERS.join(DELIMITER)];
  for (const line of lines) {
    rows.push(
      toRow([
        line.crew_code,
        line.crew_name,
        line.iban ?? "",
        line.event_name,
        line.date,
        line.hours,
        line.hourly_cost ?? null,
        payrollLineAmount(line),
      ])
    );
  }
  return rows.join("\r\n");
}
