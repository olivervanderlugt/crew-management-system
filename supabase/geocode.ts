/**
 * Geocode crew + event addresses → lat/lng for the map.
 * Run: pnpm db:geocode   (from project root; needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Uses OpenStreetMap Nominatim (free, no key). Be polite: 1 request/second and a
 * descriptive User-Agent. Only rows WITHOUT coordinates are geocoded, so it is
 * safe to re-run / resume.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv(): Record<string, string> {
  try {
    const c = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
    const e: Record<string, string> = {};
    for (const line of c.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) e[m[1]!] = (m[2] ?? "").trim();
    }
    return e;
  } catch { return {}; }
}

const env = { ...loadEnv(), ...process.env };
const URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
if (!URL || !KEY) { console.error("Missing Supabase env."); process.exit(1); }

const admin = createClient(URL, KEY, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "crewops-planner/1.0 (admin@example.com)" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0]!.lat), lng: parseFloat(data[0]!.lon) };
  } catch { return null; }
}

async function main() {
  // ── Crew ──
  const { data: crew } = await admin
    .from("crew")
    .select("id, crew_code, street, postcode, home_city")
    .is("latitude", null);
  console.log(`Geocoding ${crew?.length ?? 0} crew without coordinates…`);
  let crewDone = 0;
  for (const c of (crew ?? []) as Array<{ id: string; crew_code: string; street: string | null; postcode: string | null; home_city: string | null }>) {
    const parts = [c.street, c.postcode, c.home_city].filter(Boolean);
    if (parts.length === 0) continue; // nothing to geocode
    const q = `${parts.join(", ")}, Nederland`;
    const geo = await geocode(q);
    if (geo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("crew") as any).update({ latitude: geo.lat, longitude: geo.lng }).eq("id", c.id);
      crewDone++;
    }
    await sleep(1100);
  }
  console.log(`  ✓ ${crewDone} crew geocoded.`);

  // ── Events ──
  const { data: events } = await admin
    .from("events")
    .select("id, name, address, venue")
    .is("latitude", null);
  console.log(`Geocoding ${events?.length ?? 0} events without coordinates…`);
  let evDone = 0;
  for (const e of (events ?? []) as Array<{ id: string; name: string; address: string | null; venue: string | null }>) {
    const base = e.address || e.venue;
    if (!base) continue;
    const geo = await geocode(`${base}, Nederland`);
    if (geo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("events") as any).update({ latitude: geo.lat, longitude: geo.lng }).eq("id", e.id);
      evDone++;
    }
    await sleep(1100);
  }
  console.log(`  ✓ ${evDone} events geocoded.`);
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
