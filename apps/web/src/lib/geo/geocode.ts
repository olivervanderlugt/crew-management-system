/**
 * Server-only geocoding for crew + event addresses.
 *
 * Strategy: try PDOK Locatieserver first (the official Dutch geocoder — free,
 * no key, NL-accurate, generous rate limits), then fall back to OpenStreetMap
 * Nominatim for anything PDOK can't resolve (e.g. foreign addresses, bare venue
 * names). Results are cached in-process per query so repeated saves of the same
 * address (and recurring-event series) don't hit the network again.
 *
 * This replaces needing to run `pnpm db:geocode` for newly created/edited rows;
 * the batch script in `supabase/geocode.ts` stays useful for bulk backfills.
 */

const PDOK =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "crewops-planner/1.0 (admin@example.com)";

export type Coords = { lat: number; lng: number };

// Simple bounded in-process cache (most-recent wins). Per server instance.
const cache = new Map<string, Coords | null>();
const CACHE_MAX = 1000;

function cacheGet(key: string): Coords | null | undefined {
  return cache.get(key);
}
function cacheSet(key: string, val: Coords | null) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, val);
}

async function geocodePdok(query: string): Promise<Coords | null> {
  const url = `${PDOK}?q=${encodeURIComponent(query)}&rows=1&fq=type:(adres OR woonplaats OR weg)`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      response?: { docs?: Array<{ centroide_ll?: string }> };
    };
    const point = data.response?.docs?.[0]?.centroide_ll; // "POINT(lng lat)"
    if (!point) return null;
    const m = point.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
    if (!m) return null;
    const lng = parseFloat(m[1]!);
    const lat = parseFloat(m[2]!);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeNominatim(query: string): Promise<Coords | null> {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0]!.lat);
    const lng = parseFloat(data[0]!.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Geocode a free-text address query to coordinates, or null if not found. */
export async function geocodeAddress(query: string): Promise<Coords | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cached = cacheGet(trimmed);
  if (cached !== undefined) return cached;

  const result = (await geocodePdok(trimmed)) ?? (await geocodeNominatim(trimmed));
  cacheSet(trimmed, result);
  return result;
}

/** Build the geocode query for a crew member from its address parts. */
export function crewGeoQuery(parts: {
  street?: string | null;
  postcode?: string | null;
  home_city?: string | null;
}): string | null {
  const pieces = [parts.street, parts.postcode, parts.home_city].filter(Boolean);
  if (pieces.length === 0) return null;
  return `${pieces.join(", ")}, Nederland`;
}

/** Build the geocode query for an event from its address/venue. */
export function eventGeoQuery(parts: {
  address?: string | null;
  venue?: string | null;
}): string | null {
  const base = parts.address || parts.venue;
  if (!base) return null;
  return `${base}, Nederland`;
}
