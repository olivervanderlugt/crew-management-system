/**
 * Paged reads for queries that can outgrow PostgREST's row cap.
 *
 * PostgREST caps a single response (Supabase's default is 1000 rows) and says
 * nothing when it does: the request succeeds, you get 1000 rows, and the caller
 * quietly renders an answer computed from a fraction of the data. On 2026-08-19
 * that cost the availability grid 53 of 80 crew, and the per-day totals under
 * it read 25/16/18 where the truth was 62/66/48 — a planner was told less than
 * half the crew were free.
 *
 * Anything that reads a row per crew member per day (availability), or a row
 * per assignment, will cross the cap on a real dataset. Route it through here.
 */

/** What one page's query resolves to. Structural, so this accepts a real
 *  PostgrestFilterBuilder without importing supabase-js into core. */
export type PageResult<Row> = PromiseLike<{ data: Row[] | null; error: unknown }>;

export interface FetchAllOptions {
  /** Rows to request per round trip. Never assume this is what you get back. */
  pageSize?: number;
  /** Stop after this many rows rather than looping forever on a broken cursor. */
  maxRows?: number;
}

export interface FetchAllResult<Row> {
  data: Row[];
  error: unknown | null;
  /** True when `maxRows` cut the read short — the answer is incomplete. */
  truncated: boolean;
}

/**
 * Read every row a query matches, one page at a time.
 *
 * @param build called once per page with the row offsets for that page; it
 *              must apply them itself with `.range(from, to)` and return the
 *              query. Applying the range at the call site keeps the rest of the
 *              query — filters, ordering, embeds — exactly where it is read.
 *
 * The loop advances by how many rows the server **actually returned**, and
 * stops only on an empty page. Stopping at `received < pageSize` — the obvious
 * version, and the one first written for the availability grid — silently
 * reintroduces the original bug the moment the server's cap is lower than the
 * requested page size, because the very first page then looks like the last.
 */
export async function fetchAllRows<Row>(
  build: (from: number, to: number) => PageResult<Row>,
  options: FetchAllOptions = {}
): Promise<FetchAllResult<Row>> {
  const pageSize = Math.max(1, options.pageSize ?? 1000);
  const maxRows = options.maxRows ?? 100_000;

  const rows: Row[] = [];

  for (;;) {
    const from = rows.length;
    const { data, error } = await build(from, from + pageSize - 1);

    if (error) return { data: rows, error, truncated: false };

    const batch = data ?? [];
    if (batch.length === 0) return { data: rows, error: null, truncated: false };

    rows.push(...batch);

    if (rows.length >= maxRows) {
      return { data: rows.slice(0, maxRows), error: null, truncated: true };
    }
  }
}
