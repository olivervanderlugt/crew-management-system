import { describe, it, expect } from "vitest";
import { buildPayrollCsv, payrollLineAmount, PAYROLL_CSV_HEADERS } from "./index.js";

const base = {
  crew_code: "CREW-0001",
  crew_name: "Jan Jansen",
  event_name: "Zomerfestival",
  date: "2026-06-20",
  hours: 8,
};

describe("payrollLineAmount", () => {
  it("multiplies hours by hourly cost", () => {
    expect(payrollLineAmount({ ...base, hourly_cost: 18.5 })).toBe(148);
  });
  it("is null when no hourly cost is known", () => {
    expect(payrollLineAmount({ ...base })).toBeNull();
    expect(payrollLineAmount({ ...base, hourly_cost: null })).toBeNull();
  });
});

describe("buildPayrollCsv", () => {
  it("emits a header row first", () => {
    const csv = buildPayrollCsv([]);
    expect(csv).toBe(PAYROLL_CSV_HEADERS.join(";"));
  });

  it("formats numbers with two decimals and computes the amount", () => {
    const csv = buildPayrollCsv([{ ...base, iban: "NL00BANK", hourly_cost: 20 }]);
    const [, row] = csv.split("\r\n");
    expect(row).toBe("CREW-0001;Jan Jansen;NL00BANK;Zomerfestival;2026-06-20;8.00;20.00;160.00");
  });

  it("leaves amount + rate empty when no hourly cost", () => {
    const csv = buildPayrollCsv([{ ...base }]);
    const [, row] = csv.split("\r\n");
    expect(row).toBe("CREW-0001;Jan Jansen;;Zomerfestival;2026-06-20;8.00;;");
  });

  it("escapes delimiters, quotes and newlines (RFC 4180)", () => {
    const csv = buildPayrollCsv([
      { ...base, crew_name: 'De Vries; "Bert"', event_name: "A\nB" },
    ]);
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"De Vries; ""Bert"""');
    expect(row).toContain('"A\nB"');
  });
});
