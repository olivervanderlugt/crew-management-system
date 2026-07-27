import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { rateLimit } from "@/lib/rate-limit";
import {
  geocodeAddress,
  crewGeoQuery,
  eventGeoQuery,
} from "@/lib/geo/geocode";

// Geocode a single crew or event row on demand and persist its coordinates.
// Used by the crew new/edit pages (which save client-side via RLS and so can't
// geocode server-side inline). Best-effort: returns 200 with {skipped:true}
// when there's no address or the geocoder finds nothing — a save must never
// fail because geocoding did.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { type?: string; id?: string };
    const { type, id } = body;
    if (!id || (type !== "crew" && type !== "event")) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
    }

    // Same permission as editing the underlying record.
    const module = type === "crew" ? "crew" : "events";
    if (!(await hasPerm(module))) {
      return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
    }

    // Rate-limit per user: max 30 geocodes / minute. Plenty for real editing,
    // but stops runaway loops and keeps us polite to the geocoder.
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    const limited = rateLimit(`geocode:${user?.id ?? "anon"}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Te veel verzoeken — probeer zo opnieuw." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const supabase = await createServiceClient();
    const secondAddress = process.env.NEXT_PUBLIC_CREW_SECOND_ADDRESS === "true";

    if (type === "event") {
      const { data: row, error } = await supabase
        .from("events")
        .select("id, address, venue")
        .eq("id", id)
        .single();
      if (error || !row) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

      const query = eventGeoQuery(row as { address: string | null; venue: string | null });
      if (!query) return NextResponse.json({ skipped: true });
      const coords = await geocodeAddress(query);
      if (!coords) return NextResponse.json({ skipped: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("events") as any)
        .update({ latitude: coords.lat, longitude: coords.lng })
        .eq("id", id);
      return NextResponse.json({ latitude: coords.lat, longitude: coords.lng });
    }

    // ── Crew: geocode the primary address, plus the second one when enabled ──
    const cols = secondAddress
      ? "id, street, postcode, home_city, address_2, postcode_2, home_city_2"
      : "id, street, postcode, home_city";
    const { data: row, error } = await supabase
      .from("crew")
      .select(cols)
      .eq("id", id)
      .single();
    if (error || !row) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

    const r = row as Record<string, string | null>;
    const update: Record<string, number | null> = {};

    const q1 = crewGeoQuery({ street: r.street, postcode: r.postcode, home_city: r.home_city });
    const c1 = q1 ? await geocodeAddress(q1) : null;
    if (c1) { update.latitude = c1.lat; update.longitude = c1.lng; }

    if (secondAddress) {
      const q2 = crewGeoQuery({ street: r.address_2, postcode: r.postcode_2, home_city: r.home_city_2 });
      const c2 = q2 ? await geocodeAddress(q2) : null;
      update.latitude_2 = c2 ? c2.lat : null;
      update.longitude_2 = c2 ? c2.lng : null;
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ skipped: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("crew") as any).update(update).eq("id", id);
    return NextResponse.json(update);
  } catch (err) {
    console.error("geocode POST error:", err);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
