// Analytics helpers — pure, no I/O. Aggregations behind the "Inzichten" tab.
// Keeping the maths here (rather than inline in the page) makes the numbers on
// the management dashboard unit-testable.

import type { AssignmentStatus } from "../types/index.js";

/**
 * The assignment statuses that mean a crew member is actually coming.
 * Exported as an array as well as a predicate because callers that build a
 * database query need the list, not a function — counting every assignment row
 * regardless of status makes an event where everyone declined read as fully
 * staffed.
 */
export const SECURED_STATUSES = ["confirmed", "checked_in"] as const satisfies readonly AssignmentStatus[];

/** Crew that count as "secured" for an event (confirmed or checked in). */
export function isSecuredStatus(status: AssignmentStatus): boolean {
  return (SECURED_STATUSES as readonly AssignmentStatus[]).includes(status);
}

export interface EventFill {
  crew_needed: number;
  secured: number;
}

/**
 * Bezettingsgraad (fill rate), 0..1: total secured crew divided by total needed
 * across events, each event capped at its own need (over-staffing one event
 * can't mask another's shortage). Returns 0 when nothing is needed.
 */
export function fillRate(events: EventFill[]): number {
  let needed = 0;
  let filled = 0;
  for (const e of events) {
    const cap = Math.max(0, e.crew_needed);
    needed += cap;
    filled += Math.min(Math.max(0, e.secured), cap);
  }
  if (needed === 0) return 0;
  return Math.round((filled / needed) * 1000) / 1000;
}

/**
 * Afzeggingsratio (decline rate), 0..1: declined / (declined + secured). Crew
 * still pending (proposed/invited) are ignored — they haven't answered yet.
 * Returns 0 when there are no resolved responses.
 */
export function declineRate(statuses: AssignmentStatus[]): number {
  let declined = 0;
  let secured = 0;
  for (const s of statuses) {
    if (s === "declined") declined++;
    else if (isSecuredStatus(s)) secured++;
  }
  const resolved = declined + secured;
  if (resolved === 0) return 0;
  return Math.round((declined / resolved) * 1000) / 1000;
}

/** "YYYY-MM" bucket key for an ISO datetime (UTC date parts). */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Group items by their "YYYY-MM" month. Preserves insertion order of keys. */
export function bucketByMonth<T>(items: T[], getIso: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = monthKey(getIso(item));
    const arr = out.get(key);
    if (arr) arr.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/** The last `count` month keys ending at `end` (inclusive), oldest first. */
export function recentMonthKeys(end: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Count occurrences of each value returned by `key`. */
export function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k == null || k === "") continue;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Top-N entries of a count map, highest first. */
export function topN(counts: Map<string, number>, n: number): Array<{ key: string; count: number }> {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
