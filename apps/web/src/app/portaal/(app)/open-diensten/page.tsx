import { distanceKm } from "@crewops/core";
import { requirePortalCrew } from "@/lib/portal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { OpenShiftsList, type OpenShift } from "@/components/portal/OpenShiftsList";

export const metadata = { title: "Open diensten — Crew Portaal" };

type EventRow = {
  id: string;
  name: string;
  venue: string | null;
  address: string | null;
  start_datetime: string;
  end_datetime: string;
  crew_needed: number;
  status: string;
  latitude: number | null;
  longitude: number | null;
  assignments: { status: string }[];
};

// Availability sort priority: clearly available first, then maybe, then unknown.
function availPriority(a: string | null): number {
  if (a === "B") return 0;
  if (a === "M") return 1;
  if (a == null || a === "W" || a === "V") return 2;
  return 3; // X — kept for context but sinks to the bottom
}

export default async function OpenShiftsPage() {
  const { crew } = await requirePortalCrew();
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // This crew's home coordinates (geocoded) for the "dichtbij" suggestion.
  const { data: crewGeo } = await admin
    .from("crew")
    .select("latitude, longitude")
    .eq("id", crew.id)
    .single();
  const home = (crewGeo ?? { latitude: null, longitude: null }) as {
    latitude: number | null;
    longitude: number | null;
  };

  // Upcoming, non-cancelled/done events with their assignment statuses.
  const { data: evData } = await admin
    .from("events")
    .select("id, name, venue, address, start_datetime, end_datetime, crew_needed, status, latitude, longitude, assignments(status)")
    .gte("start_datetime", nowIso)
    .in("status", ["draft", "planned", "confirmed"])
    .order("start_datetime", { ascending: true });

  const events = (evData ?? []) as unknown as EventRow[];

  // Events this crew is already on (any status) — exclude them.
  const { data: mine } = await admin
    .from("assignments")
    .select("event_id")
    .eq("crew_id", crew.id);
  const mineSet = new Set((mine ?? []).map((m: { event_id: string }) => m.event_id));

  // This crew's availability for the relevant dates, to flag a good match.
  const dates = [...new Set(events.map((e) => e.start_datetime.split("T")[0]!))];
  const availByDate: Record<string, string> = {};
  if (dates.length) {
    const { data: avail } = await admin
      .from("availability")
      .select("date, status")
      .eq("crew_id", crew.id)
      .in("date", dates);
    for (const a of (avail ?? []) as { date: string; status: string }[]) {
      availByDate[a.date] = a.status;
    }
  }

  const open: OpenShift[] = [];
  for (const e of events) {
    if (mineSet.has(e.id)) continue;
    const confirmed = (e.assignments ?? []).filter(
      (a) => a.status === "confirmed" || a.status === "checked_in"
    ).length;
    const spots = e.crew_needed - confirmed;
    if (spots <= 0) continue;
    open.push({
      id: e.id,
      name: e.name,
      venue: e.venue,
      address: e.address,
      start_datetime: e.start_datetime,
      end_datetime: e.end_datetime,
      open_spots: spots,
      availability: availByDate[e.start_datetime.split("T")[0]!] ?? null,
      distance_km: distanceKm(home, { latitude: e.latitude, longitude: e.longitude }),
    });
  }

  // Smart suggestion order: where the crew is available first, then nearest,
  // then soonest. The client list defaults to filtering on available + nearby.
  open.sort((a, b) => {
    const pa = availPriority(a.availability);
    const pb = availPriority(b.availability);
    if (pa !== pb) return pa - pb;
    const da = a.distance_km ?? Number.POSITIVE_INFINITY;
    const db = b.distance_km ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.start_datetime.localeCompare(b.start_datetime);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Open diensten</h1>
        <p className="text-sm text-muted-foreground">
          Diensten die nog crew zoeken. Standaard tonen we waar je beschikbaar én dichtbij bent.
          Vraag een dienst aan; de planning bevestigt je daarna.
        </p>
      </div>
      <OpenShiftsList shifts={open} />
    </div>
  );
}
