// Automation logic — pure, no I/O. These are the decisions behind the
// "Automatisering" features (auto-occupancy, reminders, distance-aware open
// shifts). Side-effectful wiring (DB writes, the notification outbox, cron
// triggers) lives in apps/web; this package only decides WHAT should happen.

import type { AssignmentStatus, EventStatus } from "../types/index.js";

// ─── Auto-occupancy status ────────────────────────────────────
// An event flips to "Bevestigd" once enough crew have confirmed, and falls back
// to "Gepland" when a confirmation drops below the requirement. Only the
// planned <-> confirmed pair is automated: draft (not yet published), done and
// cancelled are deliberate human/lifecycle states and are never touched here.

export interface OccupancyInput {
  crew_needed: number;
  current_status: EventStatus;
  /** Status of every assignment on the event. */
  assignment_statuses: AssignmentStatus[];
}

/** Crew that count as "secured" for occupancy purposes. */
function isSecured(status: AssignmentStatus): boolean {
  return status === "confirmed" || status === "checked_in";
}

/**
 * Returns the status the event SHOULD have, or null when nothing should change.
 * Returning null (rather than the current status) lets callers skip a no-op DB
 * write and audit entry.
 */
export function computeOccupancyStatus(input: OccupancyInput): EventStatus | null {
  const { crew_needed, current_status, assignment_statuses } = input;

  // Only auto-manage the planned <-> confirmed transition.
  if (current_status !== "planned" && current_status !== "confirmed") return null;

  const secured = assignment_statuses.filter(isSecured).length;
  const enough = crew_needed > 0 && secured >= crew_needed;

  if (enough && current_status !== "confirmed") return "confirmed";
  if (!enough && current_status === "confirmed") return "planned";
  return null;
}

// ─── Distance (haversine) ─────────────────────────────────────
// Used for distance-aware open-shift suggestions and travel hints. Coordinates
// come from the geocoder (supabase/geocode.ts); either point may be ungeocoded.

export interface GeoPoint {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in kilometres (rounded to 1 decimal), or null when
 * either point lacks coordinates. Good enough for "nearby" sorting; it is not a
 * driving distance.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number | null {
  if (
    a.latitude == null || a.longitude == null ||
    b.latitude == null || b.longitude == null
  ) {
    return null;
  }
  const R = 6371; // Earth radius, km
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(d * 10) / 10;
}

// ─── Reminder messages + outbox dedupe ────────────────────────
// The outbox (notifications table, migration 0011) has no "type" column, so the
// subject doubles as a dedupe marker: a daily cron can run idempotently by
// skipping crew that already have a queued/sent notification with the same
// subject. These prefixes/builders keep that convention in one place.

export const REMINDER_SUBJECT = "Herinnering dienst";
export const AVAILABILITY_SUBJECT_PREFIX = "Beschikbaarheid";

const MONTHS_NL = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

/** Dutch "maand jaar" label for a Date, e.g. "juli 2026". */
export function monthLabelNl(date: Date): string {
  return `${MONTHS_NL[date.getMonth()]} ${date.getFullYear()}`;
}

/** Subject for a monthly availability request — includes the month so the same
 *  month is only ever enqueued once per crew member. */
export function availabilitySubject(month: Date): string {
  return `${AVAILABILITY_SUBJECT_PREFIX} ${monthLabelNl(month)}`;
}

export interface EventReminderContext {
  crew_first_name: string;
  event_name: string;
  /** Pre-formatted date, e.g. "za 27 jun". */
  event_date: string;
  /** Pre-formatted start time, e.g. "18:00". */
  event_time: string;
  venue?: string | null;
  /** Deep link that confirms in one tap; omitted when no portal URL is set. */
  confirm_url?: string | null;
}

/** Body for an "X dagen vóór event" reminder. Channel-agnostic plain text. */
export function eventReminderMessage(ctx: EventReminderContext): string {
  const where = ctx.venue ? ` bij ${ctx.venue}` : "";
  let msg =
    `Hoi ${ctx.crew_first_name}, herinnering: je staat ingepland voor ` +
    `${ctx.event_name} op ${ctx.event_date} om ${ctx.event_time}${where}.`;
  if (ctx.confirm_url) {
    msg += ` Bevestig je komst met één tik: ${ctx.confirm_url}`;
  }
  return msg;
}

export interface AvailabilityReminderContext {
  crew_first_name: string;
  /** Month being requested, e.g. "juli 2026". */
  month_label: string;
  /** Portal availability URL; omitted when no portal URL is set. */
  availability_url?: string | null;
}

/** Body for the monthly "vul je beschikbaarheid in" request. */
export function availabilityReminderMessage(ctx: AvailabilityReminderContext): string {
  let msg =
    `Hoi ${ctx.crew_first_name}, wil je je beschikbaarheid voor ${ctx.month_label} ` +
    `doorgeven? Zo kunnen we je voor de juiste diensten inplannen.`;
  if (ctx.availability_url) {
    msg += ` Invullen kan hier: ${ctx.availability_url}`;
  }
  return msg;
}

// ─── Certificate / document expiry ────────────────────────────
// Crew documents (crew_documents, migration 0005) carry an optional expires_on.
// We flag certificates that are expired or about to expire so admins act before
// a crew member is scheduled on an invalid VCA/BHV/rijbewijs. Like the reminders
// above, dispatch reuses the notifications outbox; the subject encodes the
// document instance so a daily cron stays idempotent.

export const DOCUMENT_EXPIRY_SUBJECT_PREFIX = "Certificaat verloopt";

export type DocExpiryStatus = "expired" | "expiring_soon" | "ok";

/**
 * Classifies a document by its expiry date relative to `today`. Returns null
 * when the document has no expiry (it never needs renewing). Date-only and
 * timezone-stable: both sides are reduced to a UTC calendar day.
 */
export function documentExpiryStatus(
  expires_on: string | null | undefined,
  today: Date,
  warnWithinDays: number
): DocExpiryStatus | null {
  if (!expires_on) return null;
  const expMs = Date.parse(expires_on); // "YYYY-MM-DD" parses as UTC midnight
  if (Number.isNaN(expMs)) return null;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((expMs - todayUtc) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= warnWithinDays) return "expiring_soon";
  return "ok";
}

/** Parses a "30" style warn-window into a positive integer, else `fallback`. */
export function parseWarnDays(raw: string | undefined, fallback = 30): number {
  const n = parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export interface DocumentExpiryContext {
  crew_first_name: string;
  /** Document title, e.g. "VCA 2024". */
  doc_title: string;
  /** Pre-formatted expiry date, e.g. "31 dec 2026". */
  expires_date: string;
  /** Whether the document is already past its expiry. */
  expired: boolean;
}

/**
 * Subject for an expiry notification. Embeds the document title + raw expiry
 * date so the same document-instance dedupes to one queued reminder; renewing
 * (a new expires_on) yields a new subject and thus a fresh reminder.
 */
export function documentExpirySubject(doc_title: string, expires_on: string): string {
  return `${DOCUMENT_EXPIRY_SUBJECT_PREFIX}: ${doc_title} (${expires_on})`;
}

/** Body for a "certificaat verloopt / is verlopen" reminder. Channel-agnostic. */
export function documentExpiryMessage(ctx: DocumentExpiryContext): string {
  if (ctx.expired) {
    return (
      `Hoi ${ctx.crew_first_name}, je certificaat "${ctx.doc_title}" is verlopen op ` +
      `${ctx.expires_date}. Lever een geldige versie aan zodat je inzetbaar blijft.`
    );
  }
  return (
    `Hoi ${ctx.crew_first_name}, je certificaat "${ctx.doc_title}" verloopt op ` +
    `${ctx.expires_date}. Vernieuw het op tijd zodat je inzetbaar blijft.`
  );
}

// ─── Reminder scheduling window ───────────────────────────────

/** Whole calendar days from `from` to `to` (UTC date parts). Negative = past. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Parses a "7,3,1" style lead-days config into a sorted, de-duped list of
 * positive integers. Empty/invalid input falls back to [3].
 */
export function parseLeadDays(raw: string | undefined): number[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length ? unique : [3];
}
