import { describe, it, expect } from "vitest";
import {
  eventDurationHours,
  computeEventCosting,
  DEFAULT_HOURLY_COST_BY_SENIORITY,
} from "./index.js";

describe("eventDurationHours", () => {
  it("computes whole + fractional hours", () => {
    expect(eventDurationHours("2026-06-22T09:00:00Z", "2026-06-22T17:00:00Z")).toBe(8);
    expect(eventDurationHours("2026-06-22T09:00:00Z", "2026-06-22T12:30:00Z")).toBe(3.5);
  });
  it("is 0 for non-positive or invalid ranges", () => {
    expect(eventDurationHours("2026-06-22T17:00:00Z", "2026-06-22T09:00:00Z")).toBe(0);
    expect(eventDurationHours("nope", "2026-06-22T09:00:00Z")).toBe(0);
  });
});

describe("computeEventCosting", () => {
  const lines = [
    { id: "a", seniority: "sitecrew" as const, hourly_cost: 20, secured: true },
    { id: "b", seniority: "senior" as const, hourly_cost: 25, secured: true },
  ];

  it("computes revenue, cost and margin over secured crew", () => {
    const r = computeEventCosting({ charge_rate: 40, planned_hours: 8, lines });
    // cost = 8*20 + 8*25 = 360; revenue = 8*40*2 = 640; margin = 280
    expect(r.cost).toBe(360);
    expect(r.revenue).toBe(640);
    expect(r.margin).toBe(280);
    expect(r.margin_pct).toBeCloseTo(0.44, 2);
    expect(r.hours).toBe(16);
    expect(r.has_estimates).toBe(false);
  });

  it("excludes non-secured crew", () => {
    const r = computeEventCosting({
      charge_rate: 40,
      planned_hours: 8,
      lines: [...lines, { id: "c", seniority: "teamlead", hourly_cost: 30, secured: false }],
    });
    expect(r.cost).toBe(360); // c ignored
    expect(r.lines).toHaveLength(2);
  });

  it("returns null revenue/margin when no charge_rate is set, but still costs", () => {
    const r = computeEventCosting({ planned_hours: 8, lines });
    expect(r.revenue).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.margin_pct).toBeNull();
    expect(r.cost).toBe(360);
    expect(r.lines[0]?.line_revenue).toBeNull();
  });

  it("falls back to the seniority default cost and flags the estimate", () => {
    const r = computeEventCosting({
      charge_rate: 40,
      planned_hours: 10,
      lines: [{ id: "a", seniority: "teamlead", secured: true }],
    });
    expect(r.has_estimates).toBe(true);
    expect(r.lines[0]?.cost_estimated).toBe(true);
    expect(r.cost).toBe(10 * DEFAULT_HOURLY_COST_BY_SENIORITY.teamlead);
  });

  it("prefers worked hours over planned hours when present", () => {
    const r = computeEventCosting({
      charge_rate: 40,
      planned_hours: 8,
      lines: [{ id: "a", seniority: "sitecrew", hourly_cost: 20, hours_worked: 6, secured: true }],
    });
    expect(r.cost).toBe(120); // 6 * 20
    expect(r.hours).toBe(6);
  });

  it("honours a default_cost override", () => {
    const r = computeEventCosting({
      planned_hours: 1,
      default_cost: { sitecrew: 99 },
      lines: [{ id: "a", seniority: "sitecrew", secured: true }],
    });
    expect(r.cost).toBe(99);
  });
});
