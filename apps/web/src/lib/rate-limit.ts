// Lightweight in-process rate limiter (best-effort). Bounds how often a single
// user can hit an endpoint — enough to stop accidental loops / abuse and to be
// polite to upstream services (e.g. the geocoder). On multi-instance hosting
// each instance keeps its own window; that's acceptable for politeness limits.

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

export type RateLimitResult = { ok: boolean; retryAfterMs: number };

/**
 * Allow at most `limit` calls per `windowMs` for the given key.
 * Returns ok=false with retryAfterMs when the window is exhausted.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const w = buckets.get(key);
  if (!w || now >= w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (w.count < limit) {
    w.count++;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: w.resetAt - now };
}
