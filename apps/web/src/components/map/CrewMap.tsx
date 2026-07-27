"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { createClient } from "@/lib/supabase/client";

export type CrewPoint = {
  id: string; name: string; crew_code: string;
  lat: number; lng: number; home_city: string | null; has_car: boolean;
  label?: string | null;
  // Optional second (named) address — the map uses whichever is closer.
  alt?: { lat: number; lng: number; label: string | null } | null;
};
export type EventPoint = { id: string; name: string; lat: number; lng: number; date: string | null };

type LatLng = { lat: number; lng: number };
type AvailStatus = "B" | "M" | "X" | "W" | "V";

// A crew member's geocoded location(s) — primary + optional second address.
function crewLocs(c: CrewPoint): { lat: number; lng: number; label: string | null }[] {
  const locs = [{ lat: c.lat, lng: c.lng, label: c.label ?? null }];
  if (c.alt) locs.push(c.alt);
  return locs;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Marker fill/stroke by availability for the selected event's date.
function availColors(status: AvailStatus | undefined): { fill: string; stroke: string } {
  switch (status) {
    case "B": return { fill: "#22c55e", stroke: "#15803d" };
    case "M": return { fill: "#f59e0b", stroke: "#b45309" };
    case "X": return { fill: "#ef4444", stroke: "#b91c1c" };
    case "W":
    case "V": return { fill: "#a855f7", stroke: "#7e22ce" };
    default: return { fill: "#3b82f6", stroke: "#1d4ed8" }; // unknown / no event selected
  }
}

const TRAVEL_LIMIT = 40; // bound OSRM matrix to the nearest N crew

export function CrewMap({ crew, events }: { crew: CrewPoint[]; events: EventPoint[] }) {
  const divRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crewClusterRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);
  const [selected, setSelected] = useState<string>("");
  const [availability, setAvailability] = useState<Record<string, AvailStatus>>({});
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [travel, setTravel] = useState<Record<string, number>>({}); // crew_id → minutes
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);

  const ev = useMemo(() => events.find((e) => e.id === selected) ?? null, [events, selected]);

  // Init the Leaflet map once (leaflet + the cluster plugin are browser-only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const Lmod = mod.default;
      await import("leaflet.markercluster");
      if (cancelled || !divRef.current || mapRef.current) return;
      const map = Lmod.map(divRef.current).setView([52.15, 5.4], 7);
      Lmod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      eventsLayerRef.current = Lmod.layerGroup().addTo(map);
      crewClusterRef.current = Lmod.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
      }).addTo(map);
      mapRef.current = map;
      setL(Lmod);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Load availability for the selected event's date; reset travel times.
  useEffect(() => {
    setTravel({});
    setTravelError(null);
    if (!ev?.date) { setAvailability({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("availability")
        .select("crew_id, status")
        .eq("date", ev.date as string);
      if (cancelled) return;
      const map: Record<string, AvailStatus> = {};
      for (const row of (data ?? []) as Array<{ crew_id: string; status: AvailStatus }>) {
        map[row.crew_id] = row.status;
      }
      setAvailability(map);
    })();
    return () => { cancelled = true; };
  }, [ev?.date]);

  // Crew passing the "only available" filter (B or M count as available).
  const visibleCrew = useMemo(() => {
    if (!onlyAvailable || !ev) return crew;
    return crew.filter((c) => {
      const s = availability[c.id];
      return s === "B" || s === "M";
    });
  }, [crew, onlyAvailable, ev, availability]);

  // (Re)draw markers when leaflet is ready or inputs change.
  useEffect(() => {
    if (!L || !mapRef.current || !eventsLayerRef.current || !crewClusterRef.current) return;
    const eventsLayer = eventsLayerRef.current;
    const crewCluster = crewClusterRef.current;
    eventsLayer.clearLayers();
    crewCluster.clearLayers();

    for (const e of events) {
      const isSel = e.id === selected;
      L.circleMarker([e.lat, e.lng], {
        radius: isSel ? 11 : 7, color: "#c2410c", fillColor: "#2563eb",
        fillOpacity: 0.95, weight: 2,
      }).bindPopup(`<b>${e.name}</b>`).addTo(eventsLayer);
    }
    const status = (id: string) => (ev ? availability[id] : undefined);
    const crewMarkers = visibleCrew.flatMap((c) => {
      const { fill, stroke } = availColors(status(c.id) as AvailStatus | undefined);
      const mins = travel[c.id];
      return crewLocs(c).map((loc) => {
        const dist = ev ? haversineKm(ev, loc) : null;
        const lines = [
          `<b>${c.name}</b> (${c.crew_code})`,
          loc.label ? `📍 ${loc.label}` : null,
          status(c.id) ? `Status: ${status(c.id)}` : null,
          dist != null ? `${dist.toFixed(1)} km` : null,
          mins != null ? `± ${mins} min rijden` : null,
        ].filter(Boolean);
        return L.circleMarker([loc.lat, loc.lng], {
          radius: 5, color: stroke, fillColor: fill, fillOpacity: 0.8, weight: 1,
        }).bindPopup(lines.join("<br>"));
      });
    });
    crewCluster.addLayers(crewMarkers);
    if (ev) mapRef.current.setView([ev.lat, ev.lng], 10);
  }, [L, selected, ev, visibleCrew, availability, travel, events]);

  const nearby = useMemo(() => {
    if (!ev) return [];
    return visibleCrew
      .map((c) => {
        // Pick whichever of the crew's addresses is closest to the event.
        const locs = crewLocs(c);
        let best = locs[0]!;
        let bestDist = haversineKm(ev, best);
        for (const l of locs.slice(1)) {
          const d = haversineKm(ev, l);
          if (d < bestDist) { bestDist = d; best = l; }
        }
        return {
          ...c, dist: bestDist, nearLat: best.lat, nearLng: best.lng, nearLabel: best.label,
          status: availability[c.id], mins: travel[c.id],
        };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, TRAVEL_LIMIT);
  }, [ev, visibleCrew, availability, travel]);

  // Fetch driving time (OSRM table service) for the nearest crew. One request.
  async function loadTravel() {
    if (!ev || nearby.length === 0) return;
    setTravelLoading(true);
    setTravelError(null);
    try {
      // OSRM expects lng,lat. Source = event (index 0), destinations = crew.
      const coords = [`${ev.lng},${ev.lat}`, ...nearby.map((c) => `${c.nearLng},${c.nearLat}`)].join(";");
      const dest = nearby.map((_, i) => i + 1).join(";");
      const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${dest}&annotations=duration`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error("OSRM error");
      const data = (await res.json()) as { durations?: number[][] };
      const row = data.durations?.[0];
      if (!row) throw new Error("Geen reistijden");
      const map: Record<string, number> = {};
      nearby.forEach((c, i) => {
        const sec = row[i];
        if (sec != null) map[c.id] = Math.round(sec / 60);
      });
      setTravel(map);
    } catch {
      setTravelError("Reistijd kon niet worden opgehaald (externe dienst).");
    } finally {
      setTravelLoading(false);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
      <div ref={divRef} className="flex-1 min-h-[400px] rounded-lg border overflow-hidden z-0" />

      <div className="lg:w-80 shrink-0 flex flex-col min-h-0">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Kies een event om nabije crew te zien…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        {!ev ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {crew.length} crew &amp; {events.length} events op de kaart. Selecteer een event om crew op
            afstand te sorteren en hun beschikbaarheid te kleuren.
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Alleen beschikbaar
              </label>
              <button
                onClick={loadTravel}
                disabled={travelLoading}
                className="ml-auto rounded border px-2 py-1 hover:bg-secondary/40 disabled:opacity-50"
              >
                {travelLoading ? "Reistijd…" : "Reistijd ophalen"}
              </button>
            </div>

            {/* Availability legend */}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#22c55e" }} />Beschikbaar</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#f59e0b" }} />Misschien</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#ef4444" }} />Niet</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#3b82f6" }} />Onbekend</span>
            </div>

            {travelError && <p className="mt-2 text-xs text-destructive">{travelError}</p>}

            <ul className="mt-2 flex-1 overflow-auto divide-y rounded-md border text-sm">
              {nearby.map((c) => {
                const { fill } = availColors(c.status);
                return (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: fill }} title={c.status ?? "onbekend"} />
                    <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {c.mins != null ? `${c.mins} min` : c.dist < 100 ? `${c.dist.toFixed(1)} km` : `${Math.round(c.dist)} km`}
                    </span>
                    <Link href={`/crew/${c.id}`} className="font-medium hover:underline truncate">{c.name}</Link>
                    {c.has_car && <span title="Eigen auto">🚗</span>}
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {c.nearLabel ?? c.home_city ?? ""}
                    </span>
                  </li>
                );
              })}
              {nearby.length === 0 && <li className="px-3 py-2 text-muted-foreground">Geen crew die voldoet aan het filter.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
