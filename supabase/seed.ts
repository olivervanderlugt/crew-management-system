/**
 * CrewOps seed script — imports reference data into Supabase.
 * Run: pnpm db:seed (from project root)
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Uses service role key to bypass RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Load env from .env.local ─────────────────────────────────
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

const env = { ...process.env, ...loadEnv() };

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Parse CSV helper ─────────────────────────────────────────
function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  const headers = parseCsvRow(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Seed skills catalog ──────────────────────────────────────
const SKILLS = [
  { name: "Rigging", description: "Op- en afbouwen van constructies en trussen" },
  { name: "Heftruck", description: "Heftruckcertificaat vereist" },
  { name: "EHBO", description: "Eerste Hulp Bij Ongelukken certificaat" },
  { name: "BHV", description: "Bedrijfshulpverlening" },
  { name: "Beveiliging", description: "Security / crowd control" },
  { name: "Licht & Geluid", description: "Technische productie" },
  { name: "Decor", description: "Decoropbouw en -afbouw" },
  { name: "VCA Basis", description: "Veiligheid, Gezondheid & Milieu (VCA) basis" },
  { name: "Hoogwerker", description: "Bediening hoogwerker / plateaulift" },
];

async function seedSkills() {
  console.log("Seeding skills...");
  const { error } = await supabase
    .from("skills")
    .upsert(SKILLS, { onConflict: "name", ignoreDuplicates: true });
  if (error) console.error("Skills error:", error.message);
  else console.log(`  ✓ ${SKILLS.length} skills seeded`);
}

// ─── Seed crew ────────────────────────────────────────────────
async function seedCrew() {
  console.log("Seeding crew from _reference/crew.csv...");

  let csvContent: string;
  try {
    csvContent = readFileSync(join("_reference", "crew.csv"), "utf8");
  } catch {
    console.error("  ✗ _reference/crew.csv not found — run the parser first");
    return;
  }

  const rows = parseCsv(csvContent);
  const validRows = rows.filter((r) => /^CREW-\d{4}$/.test(r["crew_code"] ?? ""));

  const crewData = validRows.map((r) => ({
    crew_code: r["crew_code"]!,
    first_name: r["first_name"] || "—",
    last_name: r["last_name"] || "—",
    phone: r["phone"] || null,
    email: r["email"] || null,
    home_city: r["home_city"] || null,
    seniority: (["sitecrew", "senior", "teamlead"].includes(r["seniority"] ?? "")
      ? r["seniority"]
      : "sitecrew") as "sitecrew" | "senior" | "teamlead",
    has_car: r["has_car"] === "true",
    has_license: r["has_license"] === "true",
    notes: r["notes"] || null,
    status: "active" as const,
  }));

  // Batch upsert in chunks of 100
  let inserted = 0;
  for (let i = 0; i < crewData.length; i += 100) {
    const batch = crewData.slice(i, i + 100);
    const { error } = await supabase
      .from("crew")
      .upsert(batch, { onConflict: "crew_code", ignoreDuplicates: false });
    if (error) console.error(`  ✗ Crew batch ${i}-${i + 100}:`, error.message);
    else inserted += batch.length;
  }
  console.log(`  ✓ ${inserted}/${crewData.length} crew seeded`);
}

// ─── Seed availability ────────────────────────────────────────
async function seedAvailability() {
  console.log("Seeding availability from _reference/availability.csv...");

  let csvContent: string;
  try {
    csvContent = readFileSync(join("_reference", "availability.csv"), "utf8");
  } catch {
    console.error("  ✗ _reference/availability.csv not found");
    return;
  }

  // Load crew_code → id map
  const { data: crewList } = await supabase.from("crew").select("id, crew_code");
  if (!crewList?.length) {
    console.error("  ✗ No crew found — seed crew first");
    return;
  }
  const codeToId = new Map(crewList.map((c) => [c.crew_code, c.id]));

  const rows = parseCsv(csvContent);
  const availData = rows
    .filter((r) => r["crew_code"] && r["date"] && r["status"])
    .map((r) => {
      const crew_id = codeToId.get(r["crew_code"]!);
      if (!crew_id) return null;
      return {
        crew_id,
        date: r["date"]!,
        status: r["status"]! as "B" | "M" | "X" | "W" | "V",
      };
    })
    .filter(Boolean) as Array<{ crew_id: string; date: string; status: "B" | "M" | "X" | "W" | "V" }>;

  let inserted = 0;
  for (let i = 0; i < availData.length; i += 200) {
    const batch = availData.slice(i, i + 200);
    const { error } = await supabase
      .from("availability")
      .upsert(batch, { onConflict: "crew_id,date" });
    if (error) console.error(`  ✗ Availability batch ${i}:`, error.message);
    else inserted += batch.length;
  }
  console.log(`  ✓ ${inserted}/${availData.length} availability entries seeded`);
}

// ─── Seed demo events ─────────────────────────────────────────
async function seedDemoEvents() {
  console.log("Seeding demo events...");
  const now = new Date("2026-06-25T08:00:00Z").toISOString();
  const demo = [
    {
      name: "Zomerfestival 2026",
      client: "Demo Producties",
      venue: "Buitenterrein Noord",
      address: "Voorbeeldweg 1, 1000 AA Demostad",
      start_datetime: "2026-07-10T08:00:00Z",
      end_datetime: "2026-07-12T23:00:00Z",
      crew_needed: 12,
      status: "planned" as const,
      notes: "Jaarlijks outdoorfestival. Heftruck aanwezig.",
    },
    {
      name: "Openluchtfestival 2026 — Opbouw",
      client: "Demo Concerts",
      venue: "Evenemententerrein Zuid",
      address: "Voorbeeldlaan 22, 2000 BB Demostad",
      start_datetime: "2026-08-14T07:00:00Z",
      end_datetime: "2026-08-17T20:00:00Z",
      crew_needed: 20,
      status: "confirmed" as const,
      notes: "Groot festival. Rigging en heftruck vereist.",
    },
    {
      name: "Bedrijfsevenement Demo B.V.",
      client: "Demo B.V.",
      venue: "Congrescentrum Centraal",
      address: "Voorbeeldplein 5, 3000 CC Demostad",
      start_datetime: "2026-06-28T09:00:00Z",
      end_datetime: "2026-06-28T22:00:00Z",
      crew_needed: 6,
      status: "draft" as const,
      notes: "Interne bedrijfspresentatie.",
    },
  ];

  // Check if already seeded (avoid duplicates on re-run)
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log(`  ↩ Events already seeded (${count} exist), skipping`);
    return;
  }
  const { error } = await supabase.from("events").insert(demo);
  if (error) console.error("  ✗ Events:", error.message);
  else console.log(`  ✓ ${demo.length} demo events seeded`);
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("Seed Script");
  console.log("================");
  await seedSkills();
  await seedCrew();
  await seedAvailability();
  await seedDemoEvents();
  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
