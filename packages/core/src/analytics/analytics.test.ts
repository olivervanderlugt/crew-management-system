import { describe, it, expect } from "vitest";
import {
  fillRate,
  declineRate,
  monthKey,
  bucketByMonth,
  recentMonthKeys,
  countBy,
  topN,
} from "./index.js";

describe("fillRate", () => {
  it("caps each event at its own need", () => {
    // Event A over-staffed (3/2 → capped at 2), event B short (1/4).
    expect(fillRate([{ crew_needed: 2, secured: 3 }, { crew_needed: 4, secured: 1 }])).toBe(0.5);
  });
  it("is 0 when nothing is needed", () => {
    expect(fillRate([])).toBe(0);
    expect(fillRate([{ crew_needed: 0, secured: 0 }])).toBe(0);
  });
  it("is 1 when fully staffed", () => {
    expect(fillRate([{ crew_needed: 3, secured: 3 }])).toBe(1);
  });
});

describe("declineRate", () => {
  it("ignores pending responses", () => {
    // 1 declined, 3 secured (confirmed/checked_in), 2 pending → 1/4 = 0.25
    expect(
      declineRate(["declined", "confirmed", "checked_in", "confirmed", "invited", "proposed"])
    ).toBe(0.25);
  });
  it("is 0 with no resolved responses", () => {
    expect(declineRate(["invited", "proposed"])).toBe(0);
    expect(declineRate([])).toBe(0);
  });
});

describe("month bucketing", () => {
  it("monthKey slices YYYY-MM", () => {
    expect(monthKey("2026-06-21T18:00:00Z")).toBe("2026-06");
  });
  it("bucketByMonth groups by month", () => {
    const items = [
      { d: "2026-05-01T00:00:00Z" },
      { d: "2026-06-10T00:00:00Z" },
      { d: "2026-06-20T00:00:00Z" },
    ];
    const buckets = bucketByMonth(items, (i) => i.d);
    expect(buckets.get("2026-06")?.length).toBe(2);
    expect(buckets.get("2026-05")?.length).toBe(1);
  });
  it("recentMonthKeys returns trailing months oldest-first", () => {
    expect(recentMonthKeys(new Date(2026, 5, 15), 3)).toEqual(["2026-04", "2026-05", "2026-06"]);
  });
});

describe("countBy + topN", () => {
  it("counts and ranks, skipping empty keys", () => {
    const counts = countBy(
      [{ c: "Amsterdam" }, { c: "Amsterdam" }, { c: "Tilburg" }, { c: null }, { c: "" }],
      (i) => i.c
    );
    expect(counts.get("Amsterdam")).toBe(2);
    expect(topN(counts, 1)).toEqual([{ key: "Amsterdam", count: 2 }]);
  });
});
