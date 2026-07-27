import { describe, it, expect } from "vitest";
import { computeWorkedHours, sumWorkedHours, formatHoursClock } from "./index.js";

describe("computeWorkedHours", () => {
  it("computes net hours minus break", () => {
    expect(
      computeWorkedHours({
        clock_in: "2026-06-22T08:00:00Z",
        clock_out: "2026-06-22T17:00:00Z",
        break_minutes: 30,
      })
    ).toBe(8.5);
  });

  it("handles no break", () => {
    expect(
      computeWorkedHours({ clock_in: "2026-06-22T08:00:00Z", clock_out: "2026-06-22T12:00:00Z" })
    ).toBe(4);
  });

  it("returns 0 for missing clock values", () => {
    expect(computeWorkedHours({ clock_in: null, clock_out: "2026-06-22T12:00:00Z" })).toBe(0);
    expect(computeWorkedHours({ clock_in: "2026-06-22T08:00:00Z", clock_out: undefined })).toBe(0);
  });

  it("returns 0 when end is before start", () => {
    expect(
      computeWorkedHours({ clock_in: "2026-06-22T17:00:00Z", clock_out: "2026-06-22T08:00:00Z" })
    ).toBe(0);
  });

  it("returns 0 when break exceeds worked time", () => {
    expect(
      computeWorkedHours({
        clock_in: "2026-06-22T08:00:00Z",
        clock_out: "2026-06-22T09:00:00Z",
        break_minutes: 90,
      })
    ).toBe(0);
  });

  it("rounds to two decimals", () => {
    // 20 minutes = 0.333… → 0.33
    expect(
      computeWorkedHours({ clock_in: "2026-06-22T08:00:00Z", clock_out: "2026-06-22T08:20:00Z" })
    ).toBe(0.33);
  });
});

describe("sumWorkedHours", () => {
  it("sums multiple rows and ignores invalid ones", () => {
    expect(
      sumWorkedHours([
        { clock_in: "2026-06-22T08:00:00Z", clock_out: "2026-06-22T12:00:00Z" }, // 4
        { clock_in: "2026-06-22T13:00:00Z", clock_out: "2026-06-22T17:30:00Z" }, // 4.5
        { clock_in: null, clock_out: null }, // 0
      ])
    ).toBe(8.5);
  });
});

describe("formatHoursClock", () => {
  it("formats decimal hours as h:mm", () => {
    expect(formatHoursClock(8.5)).toBe("8:30");
    expect(formatHoursClock(0)).toBe("0:00");
    expect(formatHoursClock(1.25)).toBe("1:15");
  });
});
