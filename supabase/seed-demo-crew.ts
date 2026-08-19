/**
 * CrewOps demo-crew seed — generates 100 fictional crew members.
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
 * SAFETY: this script only ever writes crew_code CREW-9001 … CREW-9100 and the
 * availability/skill rows belonging to those ids. It upserts on crew_code, so
 * re-running it is idempotent and it cannot touch real crew records, which live
 * in the CREW-0001 … CREW-8999 range.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

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
// caught by Postgres at insert time, so the dry run asserts membership.
// crew_seniority + skill_level: 20240101000001_enums.sql
// prospect_pipeline_status:     20240101000005_crew_extended.sql
const SENIORITY = ["sitecrew", "senior", "teamlead"] as const;
const SKILL_LEVELS = ["basic", "intermediate", "expert"] as const;
const PROSPECT_STATUSES = ["new", "contacted", "intake_planned", "intake_done", "hired", "rejected"] as const;
const CREW_STATUSES = ["active", "inactive", "prospect"] as const;

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
      const day = new Date(from.getTime() + d * 86400000);
      const date = day.toISOString().slice(0, 10);
      const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
      const p = weekend ? availability + 0.2 : availability;
      const roll = rand();
      const status = roll < p ? "B" : roll < p + 0.2 ? "M" : "X";
      rows.push({ crew_id, date, status });
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

  const by = (k: string) => crew.filter((c) => c.status === k).length;
  const sen = (k: string) => crew.filter((c) => c.seniority === k).length;
  console.log("Dry run OK — nothing was written.\n");
  console.log(`  crew           ${crew.length}`);
  console.log(`  status         active ${by("active")} · inactive ${by("inactive")} · prospect ${by("prospect")}`);
  console.log(`  seniority      sitecrew ${sen("sitecrew")} · senior ${sen("senior")} · teamlead ${sen("teamlead")}`);
  console.log(`  with a car     ${crew.filter((c) => c.has_car).length}`);
  console.log(`  cities         ${new Set(crew.map((c) => c.home_city)).size}`);
  console.log(`  availability   ${avail.length} rows (${avail.filter((a) => a.status === "B").length} B)`);
  console.log(`\n  sample         ${crew[0]!.crew_code} ${crew[0]!.first_name} ${crew[0]!.last_name}, ${crew[0]!.home_city} <${crew[0]!.email}>`);
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
  console.log("Writing crew_code CREW-9001 … CREW-9100 only. Real crew records are untouched.\n");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Crew
  const crew = buildCrew();
  for (let i = 0; i < crew.length; i += 50) {
    const batch = crew.slice(i, i + 50);
    const { error } = await supabase
      .from("crew")
      .upsert(batch, { onConflict: "crew_code" });
    if (error) {
      console.error(`  ✗ crew ${i}-${i + batch.length}:`, error.message);
      process.exit(1);
    }
  }
  console.log(`  ✓ ${crew.length} crew`);

  // 2. Resolve the ids we just wrote
  const { data: written, error: readErr } = await supabase
    .from("crew")
    .select("id, crew_code")
    .like("crew_code", "CREW-9%");
  if (readErr || !written?.length) {
    console.error("  ✗ could not read back demo crew:", readErr?.message);
    process.exit(1);
  }
  const ids = written.map((c) => c.id);

  // 3. Skills — 1 to 4 each, from whatever the catalog actually holds
  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .in("name", SKILL_NAMES as unknown as string[]);
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

  console.log("\nDone. Open /crew to see them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
