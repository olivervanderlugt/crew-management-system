import { describe, it, expect } from "vitest";
import { fetchAllRows } from "./fetch-all.js";

/**
 * A fake PostgREST that holds `total` rows and refuses to return more than
 * `serverCap` of them per request — which is exactly what Supabase does, and
 * exactly what nothing in this repo used to account for.
 */
function fakeTable(total: number, serverCap: number, failOnPage?: number) {
  let calls = 0;
  const build = async (from: number, to: number) => {
    calls++;
    if (failOnPage !== undefined && calls === failOnPage) {
      return { data: null, error: { message: "connection reset" } };
    }
    const end = Math.min(to, from + serverCap - 1, total - 1);
    const rows: number[] = [];
    for (let i = from; i <= end; i++) rows.push(i);
    return { data: rows, error: null };
  };
  return { build, calls: () => calls };
}

describe("fetchAllRows", () => {
  it("reads every row when the set is larger than one page", async () => {
    const { build } = fakeTable(3700, 1000);
    const res = await fetchAllRows(build, { pageSize: 1000 });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(3700);
    expect(res.data[0]).toBe(0);
    expect(res.data[3699]).toBe(3699);
  });

  // The regression that matters. A loop that stops at `received < pageSize`
  // gets 500 rows on its first request, decides that must be the end, and
  // reports success — the original silent-truncation bug, restored.
  it("keeps reading when the server caps below the requested page size", async () => {
    const { build } = fakeTable(3700, 500);
    const res = await fetchAllRows(build, { pageSize: 1000 });
    expect(res.data).toHaveLength(3700);
    expect(res.truncated).toBe(false);
  });

  it("propagates an error instead of returning a short list as success", async () => {
    const { build } = fakeTable(3700, 1000, 3);
    const res = await fetchAllRows(build, { pageSize: 1000 });
    expect(res.error).not.toBeNull();
    // The caller must be able to tell "failed after 2000 rows" from "there were
    // 2000 rows" — returning the partial list with error: null is the bug.
    expect(res.data.length).toBeLessThan(3700);
  });

  it("stops on an empty table without a wasted second request", async () => {
    const t = fakeTable(0, 1000);
    const res = await fetchAllRows(t.build, { pageSize: 1000 });
    expect(res.data).toEqual([]);
    expect(res.error).toBeNull();
    expect(t.calls()).toBe(1);
  });

  it("reports truncation rather than looping forever", async () => {
    const { build } = fakeTable(10_000, 1000);
    const res = await fetchAllRows(build, { pageSize: 1000, maxRows: 2500 });
    expect(res.truncated).toBe(true);
    expect(res.data).toHaveLength(2500);
  });

  it("handles a total that is an exact multiple of the page size", async () => {
    const { build } = fakeTable(2000, 1000);
    const res = await fetchAllRows(build, { pageSize: 1000 });
    expect(res.data).toHaveLength(2000);
  });
});
