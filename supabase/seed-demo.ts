/**
 * CrewOps demo seed — a complete, usable fictional dataset:
 * 100 crew, their skills and availability, ~12 clients, ~40 events and the
 * assignments that staff them.
 *
 * Run: pnpm db:seed-demo        (from project root)
 *      pnpm db:seed-demo --dry-run   prints stats, touches no database
 *
 * Everything this writes is invented. Names are common Dutch given/family
 * names recombined at random — they describe no real person. Emails use the
 * RFC 2606 reserved `.invalid` TLD so a message can never be delivered.
 * Phone numbers sit in an unissued 06-0000 range. IBANs use the literal
 * `NL00DEMO…` form, whose check digits are invalid by construction, so they
 * cannot be mistaken for a real account.
 *
 * City names and their coordinates ARE real — they are public geography, not
 * personal data, and the map, distance sorting and "open diensten dichtbij"
 * features are meaningless without them. Street addresses are invented.
 *
 * SAFETY — every entity lives in its own reserved namespace, so the script can
 * never touch a real record:
 *   crew         crew_code  CREW-9001 … CREW-9100   (real crew: CREW-0001…8999)
 *   clients      name       "DEMO …"                 (upsert key is name)
 *   events       external_id DEMO-EVT-9001 … 9040, and a UUID primary key
 *                derived from that code, so an upsert can only ever hit itself
 *   assignments  only ever on those events (upsert key event_id+crew_id)
 * Everything upserts, so re-running is idempotent.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { createHash } from "crypto";

// ─── Load env from .env.local (same loader as seed.ts) ────────
function loadEnv(): Record<string, string> {
  try {
    const content = readFileSync(".env.local", "utf8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) env[m[1]!] = m[2]!.trim();
    }
    return env;
  } catch {
    return {};
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const env = { ...process.env, ...loadEnv() };
const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

// ─── Deterministic PRNG ───────────────────────────────────────
// Fixed seed → the same 100 people every run, so upserts are stable and a
// re-seed does not churn the demo database.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260819);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const intBetween = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** Stable UUIDv5-shaped id from a name, so event rows upsert onto themselves. */
function demoUuid(name: string): string {
  const h = createHash("sha1").update("crewops-demo-seed:").update(name).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // version 5
  h[8] = (h[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return h
    .subarray(0, 16)
    .toString("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/** The demo dataset is anchored to a fixed "today" so re-runs are identical. */
const TODAY = new Date("2026-08-19T00:00:00Z");
const DAY = 86400000;
const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ─── Name pools ───────────────────────────────────────────────
const FIRST_NAMES = [
  "Daan", "Sem", "Lucas", "Finn", "Levi", "Luuk", "Bram", "Milan", "Jesse", "Noah",
  "Emma", "Julia", "Mila", "Tess", "Sanne", "Lotte", "Fenna", "Eva", "Nora", "Saar",
  "Youssef", "Amir", "Mehmet", "Ayoub", "Ravi", "Joost", "Pieter", "Wouter", "Bas", "Tim",
  "Anouk", "Marit", "Roos", "Isa", "Femke", "Iris", "Britt", "Naomi", "Lieke", "Jasmijn",
  "Thijs", "Ruben", "Stijn", "Koen", "Jorik", "Sander", "Niels", "Rick", "Mees", "Gijs",
] as const;

const LAST_NAMES = [
  "de Vries", "Jansen", "van den Berg", "Bakker", "Visser", "Smit", "Meijer", "de Boer",
  "Mulder", "de Groot", "Bos", "Vos", "Peters", "Hendriks", "van Leeuwen", "Dekker",
  "Brouwer", "de Wit", "Dijkstra", "Kok", "van der Meer", "Timmermans", "Willems",
  "Vermeulen", "Yilmaz", "El Amrani", "Kowalski", "Nowak", "Silva", "Okafor",
  "van Dijk", "Verhoeven", "Schouten", "Postma", "Kuipers", "Molenaar", "Blom",
] as const;

// Real Dutch cities with real approximate centroids — public geography.
// Coordinates are what make the map and distance sorting demoable.
const CITIES = [
  { city: "Amsterdam", postcode: "10", lat: 52.3676, lon: 4.9041 },
  { city: "Rotterdam", postcode: "30", lat: 51.9244, lon: 4.4777 },
  { city: "Den Haag", postcode: "25", lat: 52.0705, lon: 4.3007 },
  { city: "Utrecht", postcode: "35", lat: 52.0907, lon: 5.1214 },
  { city: "Eindhoven", postcode: "56", lat: 51.4416, lon: 5.4697 },
  { city: "Groningen", postcode: "97", lat: 53.2194, lon: 6.5665 },
  { city: "Tilburg", postcode: "50", lat: 51.5555, lon: 5.0913 },
  { city: "Almere", postcode: "13", lat: 52.3508, lon: 5.2647 },
  { city: "Breda", postcode: "48", lat: 51.5719, lon: 4.7683 },
  { city: "Nijmegen", postcode: "65", lat: 51.8126, lon: 5.8372 },
  { city: "Arnhem", postcode: "68", lat: 51.9851, lon: 5.8987 },
  { city: "Haarlem", postcode: "20", lat: 52.3874, lon: 4.6462 },
  { city: "Zwolle", postcode: "80", lat: 52.5168, lon: 6.0830 },
  { city: "Maastricht", postcode: "62", lat: 50.8514, lon: 5.6910 },
  { city: "Leiden", postcode: "23", lat: 52.1601, lon: 4.4970 },
  { city: "Amersfoort", postcode: "38", lat: 52.1561, lon: 5.3878 },
  { city: "Apeldoorn", postcode: "73", lat: 52.2112, lon: 5.9699 },
  { city: "Enschede", postcode: "75", lat: 52.2215, lon: 6.8937 },
  { city: "Delft", postcode: "26", lat: 52.0116, lon: 4.3571 },
  { city: "Alkmaar", postcode: "18", lat: 52.6324, lon: 4.7534 },
] as const;

const STREETS = [
  "Voorbeeldstraat", "Demolaan", "Proefweg", "Testkade", "Modelplein",
  "Fictiestraat", "Steigerpad", "Truss-singel", "Podiumweg", "Backstagelaan",
] as const;

const SHIRT_SIZES = ["S", "M", "L", "XL", "XXL"] as const;

// Enum values, mirrored from the migrations. Getting one of these wrong is only
// caught by Postgres at insert time ("invalid input value for enum"), so the
// dry run asserts membership of every enum-typed column this script writes.
// crew_seniority + skill_level + event_status
// + assignment_status + availability_status: 20240101000001_enums.sql
// prospect_pipeline_status:                   20240101000005_crew_extended.sql
const SENIORITY = ["sitecrew", "senior", "teamlead"] as const;
const SKILL_LEVELS = ["basic", "intermediate", "expert"] as const;
const PROSPECT_STATUSES = ["new", "contacted", "intake_planned", "intake_done", "hired", "rejected"] as const;
const CREW_STATUSES = ["active", "inactive", "prospect"] as const;
const AVAILABILITY_STATUSES = ["B", "M", "X", "W", "V"] as const;
const EVENT_STATUSES = ["draft", "planned", "confirmed", "done", "cancelled"] as const;
const ASSIGNMENT_STATUSES = ["proposed", "invited", "confirmed", "declined", "checked_in"] as const;

// Must match the SKILLS catalog in seed.ts.
const SKILL_NAMES = [
  "Rigging", "Heftruck", "EHBO", "BHV", "Beveiliging",
  "Licht & Geluid", "Decor", "VCA Basis", "Hoogwerker",
] as const;

const NOTE_SNIPPETS = [
  "Werkt bij voorkeur in het weekend.",
  "Heeft eigen gereedschap.",
  "Rijdt graag met de bus mee.",
  "Beschikbaar vanaf 16:00 op doordeweekse dagen.",
  "Ervaren met opbouw op festivalterrein.",
  "Liever geen nachtdiensten.",
  null, null, null,
] as const;

// ─── Row builders ─────────────────────────────────────────────
export type DemoCrewRow = ReturnType<typeof buildCrew>[number];

function buildCrew() {
  const rows = [];
  const usedEmails = new Set<string>();

  for (let i = 1; i <= 100; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const place = pick(CITIES);
    const code = `CREW-${9000 + i}`;

    // Jitter the city centroid so 100 pins don't stack on 20 points.
    const lat = +(place.lat + (rand() - 0.5) * 0.09).toFixed(6);
    const lon = +(place.lon + (rand() - 0.5) * 0.13).toFixed(6);

    // Index-suffixed so recombined names can never collide.
    const slug = `${first}.${last}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z.]/g, "");
    const email = `${slug}${i}@example.invalid`;
    usedEmails.add(email);

    // Seniority skews junior, the way a real crew pool does.
    const seniority = chance(0.12) ? "teamlead" : chance(0.3) ? "senior" : "sitecrew";
    const hasLicense = chance(0.7);

    // 80 active, 10 inactive, 10 prospects — enough to exercise every filter.
    const status = i > 90 ? "prospect" : i > 80 ? "inactive" : "active";

    rows.push({
      crew_code: code,
      first_name: first,
      last_name: last,
      phone: `+3160000${String(i).padStart(4, "0")}`,
      email,
      street: `${pick(STREETS)} ${intBetween(1, 180)}`,
      home_city: place.city,
      postcode: `${place.postcode}${intBetween(10, 99)} ${pick("ABCDEGHJKLMNPRSTVWXZ".split(""))}${pick("ABCDEGHJKLMNPRSTVWXZ".split(""))}`,
      latitude: lat,
      longitude: lon,
      has_license: hasLicense,
      has_car: hasLicense && chance(0.65),
      seniority: seniority as (typeof SENIORITY)[number],
      status,
      date_of_birth: `${intBetween(1975, 2005)}-${String(intBetween(1, 12)).padStart(2, "0")}-${String(intBetween(1, 28)).padStart(2, "0")}`,
      nationality: "NL",
      shirt_size: pick(SHIRT_SIZES),
      emergency_contact_name: `${pick(FIRST_NAMES)} ${last}`,
      emergency_contact_phone: `+3160001${String(i).padStart(4, "0")}`,
      // Invalid check digits by construction — cannot be a real account.
      iban: `NL00DEMO${String(i).padStart(10, "0")}`,
      hourly_cost:
        seniority === "teamlead" ? 28.5 : seniority === "senior" ? 24.0 : 19.5,
      start_date: `${intBetween(2019, 2026)}-${String(intBetween(1, 12)).padStart(2, "0")}-01`,
      notes: pick(NOTE_SNIPPETS),
      ...(status === "prospect"
        ? {
            prospect_source: pick(["website", "referral", "jobboard", "open sollicitatie"]),
            prospect_status: pick(PROSPECT_STATUSES) as string,
            prospect_applied_on: `2026-0${intBetween(5, 8)}-${String(intBetween(1, 28)).padStart(2, "0")}`,
          }
        : {}),
    });
  }

  if (usedEmails.size !== rows.length) {
    throw new Error(`email collision: ${rows.length - usedEmails.size} duplicate(s)`);
  }
  return rows;
}

/** ~90 days of availability per crew member, weighted so the grid looks real. */
function buildAvailability(crewIds: string[], from = new Date("2026-08-01T00:00:00Z")) {
  const rows: Array<{ crew_id: string; date: string; status: string }> = [];
  for (const crew_id of crewIds) {
    // Each person gets their own bias — some are around a lot, some barely.
    const availability = 0.35 + rand() * 0.5;
    for (let d = 0; d < 90; d++) {
      const day = new Date(from.getTime() + d * DAY);
      const date = ymd(day);
      const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
      const p = weekend ? availability + 0.2 : availability;
      const roll = rand();
      const status = roll < p ? "B" : roll < p + 0.2 ? "M" : "X";
      rows.push({ crew_id, date, status });
    }
  }
  return rows;
}

// ─── Clients ──────────────────────────────────────────────────
// Fictional Dutch event/production companies. Every name starts with "DEMO "
// — that prefix is the reserved namespace: the upsert key is `name`, so this
// can never overwrite a real client.
const CLIENT_NAMES = [
  "DEMO Podiumkracht Producties",
  "DEMO Stagelight Events",
  "DEMO Noorderlicht Festivals",
  "DEMO Havenwerk Concerts",
  "DEMO Truss & Rigging Collectief",
  "DEMO Zaalhuur Centraal",
  "DEMO Kadeconcerten",
  "DEMO Polderpop Organisatie",
  "DEMO Congreszaal Zuid",
  "DEMO Vestingfeesten Stichting",
  "DEMO Backstage Crew Partners",
  "DEMO Winterlicht Producties",
] as const;

const VENUES = [
  "Evenemententerrein Noord", "Congrescentrum Centraal", "Stadspark Weide",
  "Havenloods 7", "Beursgebouw Oost", "Openluchttheater De Kuil",
  "Sporthal De Wilg", "Kade 12", "Fabriekshal Zuid", "Marktplein",
] as const;

function buildClients() {
  return CLIENT_NAMES.map((name, i) => {
    const place = CITIES[i % CITIES.length]!;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return {
      name,
      contact_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      contact_phone: `+3160002${String(i + 1).padStart(4, "0")}`,
      contact_email: `planning@${slug}.invalid`,
      venue: pick(VENUES),
      address: `${pick(STREETS)} ${intBetween(1, 120)}, ${place.postcode}${intBetween(10, 99)} AA ${place.city}`,
      notes: pick([
        "Vaste klant, factuur per event.",
        "Levert zelf materiaal aan.",
        "Wil altijd een teamlead op locatie.",
        "Betaalt per 30 dagen.",
        null,
        null,
      ]),
    };
  });
}

// ─── Events ───────────────────────────────────────────────────
const EVENT_KINDS = [
  { label: "Festival", multiDay: true, crew: [10, 24], hours: [8, 23] },
  { label: "Opbouw", multiDay: true, crew: [6, 14], hours: [7, 19] },
  { label: "Concert", multiDay: false, crew: [4, 12], hours: [14, 23] },
  { label: "Congres", multiDay: false, crew: [3, 8], hours: [8, 18] },
  { label: "Bedrijfsfeest", multiDay: false, crew: [3, 9], hours: [16, 23] },
  { label: "Beurs", multiDay: true, crew: [8, 16], hours: [8, 18] },
  { label: "Afbouw", multiDay: false, crew: [4, 10], hours: [7, 16] },
  { label: "Clubavond", multiDay: false, crew: [2, 5], hours: [20, 23] },
] as const;

export type DemoEventRow = ReturnType<typeof buildEvents>[number];

/**
 * ~40 events, roughly 3 months back to 3 months forward, each tied to a client
 * by name (events.client is a TEXT column — there is no client_id FK).
 * Status follows the date: past → done/cancelled, near → confirmed/planned,
 * far → planned/draft.
 */
function buildEvents(clientNames: readonly string[]) {
  const rows = [];
  const total = 40;
  // The last 4 are one weekly recurring series sharing a recurrence_group_id.
  const seriesGroup = demoUuid("recurrence-group:clubavond");

  for (let i = 0; i < total; i++) {
    const n = i + 1;
    const code = `DEMO-EVT-${9000 + n}`;
    const inSeries = i >= total - 4;
    const kind = inSeries ? EVENT_KINDS[7]! : EVENT_KINDS[i % 7]!;
    const client = clientNames[i % clientNames.length]!;
    const place = CITIES[(i * 3) % CITIES.length]!;

    // -92 … +92 days, evenly spread; the series sits on consecutive Fridays.
    const dayOffset = inSeries
      ? 12 + (i - (total - 4)) * 7
      : Math.round(-92 + (i * 184) / (total - 5)) + intBetween(-2, 2);

    const startDay = new Date(TODAY.getTime() + dayOffset * DAY);
    const startHour = kind.hours[0] + (inSeries ? 0 : intBetween(0, 1));
    const start = new Date(Date.UTC(
      startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate(), startHour, 0, 0
    ));
    // Multi-day kinds run 2–4 days; single-day events end the same evening.
    const extraDays = kind.multiDay && chance(0.7) ? intBetween(1, 3) : 0;
    const endHour = Math.max(startHour + 3, kind.hours[1] - intBetween(0, 2));
    const end = new Date(start.getTime() + extraDays * DAY);
    end.setUTCHours(endHour, 0, 0, 0);
    // The DB enforces end_datetime > start_datetime (migration 0008).
    if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 4 * 3600000);

    const past = end.getTime() < TODAY.getTime();
    const near = !past && start.getTime() < TODAY.getTime() + 21 * DAY;
    const status = past
      ? chance(0.9) ? "done" : "cancelled"
      : near
        ? chance(0.65) ? "confirmed" : chance(0.85) ? "planned" : "cancelled"
        : chance(0.6) ? "planned" : "draft";

    rows.push({
      id: demoUuid(code),
      external_id: code,
      name: `${kind.label} ${client.replace("DEMO ", "")} — ${place.city}`,
      client,
      venue: pick(VENUES),
      address: `${pick(STREETS)} ${intBetween(1, 120)}, ${place.postcode}${intBetween(10, 99)} AA ${place.city}`,
      start_datetime: iso(start),
      end_datetime: iso(end),
      crew_needed: intBetween(kind.crew[0], kind.crew[1]),
      status,
      latitude: +(place.lat + (rand() - 0.5) * 0.04).toFixed(6),
      longitude: +(place.lon + (rand() - 0.5) * 0.06).toFixed(6),
      charge_rate: pick([34.0, 38.5, 42.0, 45.0, 49.5, 52.0]),
      recurrence_group_id: inSeries ? seriesGroup : null,
      notes: pick([
        "Opbouw start een dag eerder.",
        "Heftruck aanwezig op locatie.",
        "Rigging-certificaat vereist.",
        "Parkeren op het terrein zelf.",
        null,
        null,
      ]),
    });
  }
  return rows;
}

// ─── Assignments ──────────────────────────────────────────────
const ROLES = ["Sitecrew", "Teamlead", "Rigger", "Chauffeur", "Steward", "Op-/afbouw"] as const;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

type AssignCrew = {
  id: string;
  seniority: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Staff the events from the crew pool.
 *  - never double-books: a crew member is skipped for any event overlapping one
 *    they already hold (tracked in `busy`, regardless of assignment status)
 *  - prefers crew marked `B` on the event's start date, then unknown/`M`;
 *    `X` is excluded the way the matching engine excludes it
 *  - status follows the event date: past → mostly checked_in with worked hours,
 *    near future → mostly confirmed, far future → proposed/invited/confirmed
 *  - ~35% of events are deliberately left under-staffed so the dashboard's
 *    open-slots view has something to show
 */
function buildAssignments(
  crew: AssignCrew[],
  events: ReturnType<typeof buildEvents>,
  availability: Map<string, string>
) {
  const pool = crew.filter((c) => c.status === "active");
  const busy = new Map<string, Array<[number, number]>>();
  const rows: Array<Record<string, unknown>> = [];

  const sorted = [...events].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  for (const ev of sorted) {
    if (ev.status === "cancelled") continue;
    const start = new Date(ev.start_datetime).getTime();
    const end = new Date(ev.end_datetime).getTime();
    const date = ev.start_datetime.slice(0, 10);
    const past = end < TODAY.getTime();
    const near = !past && start < TODAY.getTime() + 21 * DAY;

    // Under-staff ~35% of events on purpose.
    const target = chance(0.65)
      ? ev.crew_needed
      : Math.max(1, Math.round(ev.crew_needed * (0.35 + rand() * 0.45)));

    // Tier by availability, shuffle within tier, then take in order.
    const tiered = pool
      .map((c) => ({ c, a: availability.get(`${c.id}|${date}`), k: rand() }))
      .filter((x) => x.a !== "X")
      .sort((x, y) => (x.a === "B" ? 0 : 1) - (y.a === "B" ? 0 : 1) || x.k - y.k);

    let placed = 0;
    for (const { c } of tiered) {
      if (placed >= target) break;
      const held = busy.get(c.id) ?? [];
      if (held.some(([s, e]) => start < e && s < end)) continue; // no double-booking
      held.push([start, end]);
      busy.set(c.id, held);
      placed++;

      const status = past
        ? chance(0.82) ? "checked_in" : chance(0.6) ? "confirmed" : "declined"
        : near
          ? chance(0.7) ? "confirmed" : chance(0.5) ? "invited" : chance(0.6) ? "proposed" : "declined"
          : chance(0.4) ? "confirmed" : chance(0.6) ? "proposed" : "invited";

      const row: Record<string, unknown> = {
        event_id: ev.id,
        crew_id: c.id,
        role: c.seniority === "teamlead" && placed === 1 ? "Teamlead" : pick(ROLES),
        status,
        transport_group: chance(0.3) ? `Bus ${intBetween(1, 2)}` : null,
        responded_at: status === "proposed" ? null : iso(new Date(start - intBetween(2, 20) * DAY)),
        distance_km:
          c.latitude != null && c.longitude != null
            ? +haversineKm(c.latitude, c.longitude, ev.latitude, ev.longitude).toFixed(1)
            : null,
      };

      // Worked hours only ever on a shift that has actually happened. The keys
      // are always present: a batch upsert sends one column list for the whole
      // batch, so a row that omits break_minutes would post NULL into a NOT NULL
      // column instead of falling back to its default.
      const worked = status === "checked_in";
      const shift = worked ? Math.min((end - start) / 3600000, intBetween(6, 11)) : 0;
      const clockIn = new Date(start + intBetween(0, 45) * 60000);
      const breakMinutes = worked ? pick([0, 30, 30, 45, 60]) : 0;
      row["clock_in"] = worked ? iso(clockIn) : null;
      row["clock_out"] = worked ? iso(new Date(clockIn.getTime() + shift * 3600000)) : null;
      row["break_minutes"] = breakMinutes;
      row["hours_worked"] = worked ? +(shift - breakMinutes / 60).toFixed(2) : null;
      row["hours_approved"] = worked ? chance(0.6) : false;
      rows.push(row);
    }
  }
  return rows;
}

// ─── Dry run: verify the generator without a database ─────────
function dryRun() {
  const crew = buildCrew();
  console.assert(crew.length === 100, "expected 100 crew");
  console.assert(
    new Set(crew.map((c) => c.crew_code)).size === 100,
    "crew_code must be unique"
  );
  console.assert(
    crew.every((c) => /^CREW-9\d{3}$/.test(c.crew_code)),
    "every code must sit in the reserved CREW-9xxx demo range"
  );
  console.assert(
    crew.every((c) => c.email.endsWith("@example.invalid")),
    "every email must be undeliverable"
  );
  console.assert(
    crew.every((c) => c.iban.startsWith("NL00DEMO")),
    "every IBAN must be obviously fake"
  );
  // Enum membership. Postgres rejects a bad value at insert time with
  // "invalid input value for enum" — catch it here instead.
  console.assert(
    crew.every((c) => (CREW_STATUSES as readonly string[]).includes(c.status)),
    "crew.status must be a crew_status enum value"
  );
  console.assert(
    crew.every((c) => (SENIORITY as readonly string[]).includes(c.seniority)),
    "crew.seniority must be a crew_seniority enum value"
  );
  console.assert(
    crew.every((c) => !("prospect_status" in c) || (PROSPECT_STATUSES as readonly string[]).includes(c.prospect_status as string)),
    "crew.prospect_status must be a prospect_pipeline_status enum value"
  );

  const avail = buildAvailability(crew.map((c) => c.crew_code));
  console.assert(avail.length === 100 * 90, "expected 90 days per crew");
  console.assert(
    avail.every((a) => (AVAILABILITY_STATUSES as readonly string[]).includes(a.status)),
    "availability.status must be an availability_status enum value"
  );

  const clients = buildClients();
  console.assert(clients.length === 12, "expected 12 clients");
  console.assert(
    new Set(clients.map((c) => c.name)).size === clients.length,
    "client name is the upsert key and must be unique"
  );
  console.assert(
    clients.every((c) => c.name.startsWith("DEMO ")),
    "every client must sit in the reserved DEMO name range"
  );
  console.assert(
    clients.every((c) => c.contact_email!.endsWith(".invalid")),
    "every client email must be undeliverable"
  );

  const events = buildEvents(clients.map((c) => c.name));
  console.assert(events.length === 40, "expected 40 events");
  console.assert(
    events.every((e) => /^DEMO-EVT-9\d{3}$/.test(e.external_id)),
    "every event must sit in the reserved DEMO-EVT-9xxx range"
  );
  console.assert(
    new Set(events.map((e) => e.id)).size === events.length,
    "event ids must be unique"
  );
  console.assert(
    events.every((e) => (EVENT_STATUSES as readonly string[]).includes(e.status)),
    "events.status must be an event_status enum value"
  );
  console.assert(
    events.every((e) => e.end_datetime > e.start_datetime),
    "events_end_after_start: end_datetime must be strictly after start_datetime"
  );
  console.assert(
    events.every((e) => e.crew_needed >= 1),
    "crew_needed >= 1 is a CHECK constraint"
  );
  console.assert(
    events.every((e) => clients.some((c) => c.name === e.client)),
    "every event must reference a seeded client"
  );

  const availMap = new Map(avail.map((a) => [`${a.crew_id}|${a.date}`, a.status]));
  const assignments = buildAssignments(
    crew.map((c) => ({
      id: c.crew_code,
      seniority: c.seniority,
      status: c.status,
      latitude: c.latitude,
      longitude: c.longitude,
    })),
    events,
    availMap
  );
  console.assert(
    assignments.every((a) => (ASSIGNMENT_STATUSES as readonly string[]).includes(a["status"] as string)),
    "assignments.status must be an assignment_status enum value"
  );
  console.assert(
    new Set(assignments.map((a) => `${a["event_id"]}|${a["crew_id"]}`)).size === assignments.length,
    "assignments are unique per (event_id, crew_id)"
  );
  // No future shift may already be checked in, and no checked-in shift may be
  // missing its hours.
  const evById = new Map(events.map((e) => [e.id, e]));
  console.assert(
    assignments.every(
      (a) =>
        a["status"] !== "checked_in" ||
        new Date(evById.get(a["event_id"] as string)!.end_datetime).getTime() < TODAY.getTime()
    ),
    "a future event must never be checked_in"
  );
  console.assert(
    assignments.every((a) => a["status"] !== "checked_in" || (a["hours_worked"] as number) > 0),
    "checked_in assignments must carry worked hours"
  );
  console.assert(
    assignments.every((a) => a["hours_worked"] == null || a["status"] === "checked_in"),
    "worked hours only belong on checked_in assignments"
  );
  // Batch upserts post one column list for the whole batch — a row missing a
  // key would write NULL into a NOT NULL column.
  console.assert(
    new Set(assignments.map((a) => Object.keys(a).sort().join(","))).size === 1,
    "every assignment row must carry the same column set"
  );
  console.assert(
    assignments.every((a) => typeof a["break_minutes"] === "number"),
    "assignments.break_minutes is NOT NULL"
  );
  // The double-booking rule, re-proved on the generated rows.
  const overlaps = (() => {
    const byCrew = new Map<string, Array<[number, number]>>();
    let n = 0;
    for (const a of assignments) {
      const ev = evById.get(a["event_id"] as string)!;
      const s = new Date(ev.start_datetime).getTime();
      const e = new Date(ev.end_datetime).getTime();
      const held = byCrew.get(a["crew_id"] as string) ?? [];
      if (held.some(([hs, he]) => s < he && hs < e)) n++;
      held.push([s, e]);
      byCrew.set(a["crew_id"] as string, held);
    }
    return n;
  })();
  console.assert(overlaps === 0, `no crew may be double-booked (found ${overlaps})`);
  console.assert(
    assignments.every((a) => !events.find((e) => e.id === a["event_id"])!.status.includes("cancelled")),
    "cancelled events are not staffed"
  );

  const by = (k: string) => crew.filter((c) => c.status === k).length;
  const sen = (k: string) => crew.filter((c) => c.seniority === k).length;
  const evBy = (k: string) => events.filter((e) => e.status === k).length;
  const asBy = (k: string) => assignments.filter((a) => a["status"] === k).length;
  const staffed = events.filter(
    (e) => assignments.filter((a) => a["event_id"] === e.id).length >= e.crew_needed
  ).length;
  console.log("Dry run OK — nothing was written.\n");
  console.log(`  crew           ${crew.length}`);
  console.log(`  status         active ${by("active")} · inactive ${by("inactive")} · prospect ${by("prospect")}`);
  console.log(`  seniority      sitecrew ${sen("sitecrew")} · senior ${sen("senior")} · teamlead ${sen("teamlead")}`);
  console.log(`  with a car     ${crew.filter((c) => c.has_car).length}`);
  console.log(`  cities         ${new Set(crew.map((c) => c.home_city)).size}`);
  console.log(`  availability   ${avail.length} rows (${avail.filter((a) => a.status === "B").length} B)`);
  console.log(`  clients        ${clients.length}`);
  console.log(`  events         ${events.length} (${events.filter((e) => e.recurrence_group_id).length} in a recurring series)`);
  console.log(`  event window   ${events.map((e) => e.start_datetime).sort()[0]!.slice(0, 10)} … ${events.map((e) => e.start_datetime).sort().at(-1)!.slice(0, 10)}`);
  console.log(`  event status   ${EVENT_STATUSES.map((s) => `${s} ${evBy(s)}`).join(" · ")}`);
  console.log(`  multi-day      ${events.filter((e) => e.start_datetime.slice(0, 10) !== e.end_datetime.slice(0, 10)).length}`);
  console.log(`  assignments    ${assignments.length} over ${new Set(assignments.map((a) => a["event_id"])).size} events`);
  console.log(`  assign status  ${ASSIGNMENT_STATUSES.map((s) => `${s} ${asBy(s)}`).join(" · ")}`);
  console.log(`  worked hours   ${assignments.filter((a) => a["hours_worked"] != null).length} rows · ${assignments.filter((a) => a["hours_approved"]).length} approved`);
  console.log(`  fully staffed  ${staffed}/${events.length} events (rest has open slots)`);
  console.log(`  double-booked  ${overlaps}`);
  console.log(`\n  sample         ${crew[0]!.crew_code} ${crew[0]!.first_name} ${crew[0]!.last_name}, ${crew[0]!.home_city} <${crew[0]!.email}>`);
  console.log(`  sample event   ${events[0]!.external_id} ${events[0]!.name} (${events[0]!.start_datetime.slice(0, 10)}, ${events[0]!.crew_needed} crew)`);
}

// ─── Seed ─────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) return dryRun();

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    console.error("Tip: run with --dry-run to check the generator without a database.");
    process.exit(1);
  }

  console.log(`Target: ${SUPABASE_URL}`);
  console.log("Writing CREW-9001…9100, DEMO-prefixed clients and DEMO-EVT-9001…9040 only.");
  console.log("Real crew, clients and events are untouched.\n");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const fail = (what: string, msg?: string) => {
    console.error(`  ✗ ${what}:`, msg);
    process.exit(1);
  };

  // 1. Crew
  const crew = buildCrew();
  for (let i = 0; i < crew.length; i += 50) {
    const batch = crew.slice(i, i + 50);
    const { error } = await supabase
      .from("crew")
      .upsert(batch, { onConflict: "crew_code" });
    if (error) fail(`crew ${i}-${i + batch.length}`, error.message);
  }
  console.log(`  ✓ ${crew.length} crew`);

  // 2. Resolve the ids we just wrote. Ordered, so every later PRNG-driven
  //    decision (skills, assignments) is identical on a re-run.
  const { data: written, error: readErr } = await supabase
    .from("crew")
    .select("id, crew_code, seniority, status, latitude, longitude")
    .like("crew_code", "CREW-9%")
    .order("crew_code");
  if (readErr || !written?.length) fail("could not read back demo crew", readErr?.message);
  const ids = written!.map((c) => c.id);

  // 3. Skills — 1 to 4 each, from whatever the catalog actually holds
  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .in("name", SKILL_NAMES as unknown as string[])
    .order("name");
  if (!skills?.length) {
    console.log("  ! no skills found — run pnpm db:seed first to load the catalog");
  } else {
    const links: Array<{ crew_id: string; skill_id: string; level: string; certified: boolean }> = [];
    for (const crew_id of ids) {
      const shuffled = [...skills].sort(() => rand() - 0.5);
      for (const s of shuffled.slice(0, intBetween(1, 4))) {
        links.push({
          crew_id,
          skill_id: s.id,
          level: pick(SKILL_LEVELS),
          certified: chance(0.4),
        });
      }
    }
    for (let i = 0; i < links.length; i += 200) {
      const { error } = await supabase
        .from("crew_skills")
        .upsert(links.slice(i, i + 200), { onConflict: "crew_id,skill_id" });
      if (error) console.error(`  ✗ crew_skills ${i}:`, error.message);
    }
    console.log(`  ✓ ${links.length} crew-skill links`);
  }

  // 4. Availability — 90 days forward
  const avail = buildAvailability(ids);
  let done = 0;
  for (let i = 0; i < avail.length; i += 500) {
    const { error } = await supabase
      .from("availability")
      .upsert(avail.slice(i, i + 500), { onConflict: "crew_id,date" });
    if (error) console.error(`  ✗ availability ${i}:`, error.message);
    else done += Math.min(500, avail.length - i);
  }
  console.log(`  ✓ ${done} availability entries`);

  // 5. Clients — upsert on the unique name, all inside the "DEMO " namespace
  const clients = buildClients();
  {
    const { error } = await supabase.from("clients").upsert(clients, { onConflict: "name" });
    if (error) fail("clients", error.message);
  }
  console.log(`  ✓ ${clients.length} clients`);

  // 6. Events — the primary key is derived from the reserved external_id, so an
  //    upsert can only ever land on a row this script created.
  const events = buildEvents(clients.map((c) => c.name));
  {
    const { error } = await supabase.from("events").upsert(events);
    if (error) fail("events", error.message);
  }
  console.log(`  ✓ ${events.length} events`);

  // 7. Assignments — staffed from the crew pool, never double-booked
  const availMap = new Map(avail.map((a) => [`${a.crew_id}|${a.date}`, a.status]));
  const assignments = buildAssignments(written as AssignCrew[], events, availMap);
  for (let i = 0; i < assignments.length; i += 200) {
    const { error } = await supabase
      .from("assignments")
      .upsert(assignments.slice(i, i + 200), { onConflict: "event_id,crew_id" });
    if (error) fail(`assignments ${i}`, error.message);
  }
  const worked = assignments.filter((a) => a["hours_worked"] != null).length;
  console.log(`  ✓ ${assignments.length} assignments (${worked} with worked hours)`);

  console.log("\nDone. Open /crew, /klanten, /events and /uren to see it.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
