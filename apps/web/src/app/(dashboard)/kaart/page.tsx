import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { Topbar } from "@/components/layout/topbar";
import { CrewMap, type CrewPoint, type EventPoint } from "@/components/map/CrewMap";

export const metadata = { title: "Kaart" };

type CrewRow = {
  id: string; first_name: string; last_name: string; crew_code: string;
  latitude: number | null; longitude: number | null; home_city: string | null; has_car: boolean;
  latitude_2?: number | null; longitude_2?: number | null;
  address_label?: string | null; address_2_label?: string | null;
};
type EventRow = { id: string; name: string; latitude: number | null; longitude: number | null; start_datetime: string };

export default async function KaartPage() {
  const me = await getMyAdminPerms();
  if (!me.isAdmin) notFound();

  const supabase = await createClient();
  const secondAddress = process.env.NEXT_PUBLIC_CREW_SECOND_ADDRESS === "true";
  const crewCols = secondAddress
    ? "id, first_name, last_name, crew_code, latitude, longitude, home_city, has_car, latitude_2, longitude_2, address_label, address_2_label"
    : "id, first_name, last_name, crew_code, latitude, longitude, home_city, has_car";
  const [{ data: crewData }, { data: evData }] = await Promise.all([
    supabase
      .from("crew")
      .select(crewCols)
      .eq("status", "active")
      // Include crew that have EITHER a primary or (when enabled) a second coordinate.
      .or(secondAddress ? "latitude.not.is.null,latitude_2.not.is.null" : "latitude.not.is.null"),
    supabase
      .from("events")
      .select("id, name, latitude, longitude, start_datetime")
      .not("latitude", "is", null)
      .order("start_datetime", { ascending: false }),
  ]);

  const crew: CrewPoint[] = [];
  for (const c of (crewData ?? []) as CrewRow[]) {
    const locs: { lat: number; lng: number; label: string | null }[] = [];
    if (c.latitude != null && c.longitude != null)
      locs.push({ lat: c.latitude, lng: c.longitude, label: c.address_label ?? null });
    if (secondAddress && c.latitude_2 != null && c.longitude_2 != null)
      locs.push({ lat: c.latitude_2, lng: c.longitude_2, label: c.address_2_label ?? null });
    if (locs.length === 0) continue;
    crew.push({
      id: c.id, name: `${c.first_name} ${c.last_name}`, crew_code: c.crew_code,
      lat: locs[0]!.lat, lng: locs[0]!.lng, label: locs[0]!.label,
      home_city: c.home_city, has_car: c.has_car,
      alt: locs[1] ?? null,
    });
  }
  const events: EventPoint[] = ((evData ?? []) as EventRow[])
    .filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({
      id: e.id,
      name: e.name,
      lat: e.latitude as number,
      lng: e.longitude as number,
      date: e.start_datetime?.split("T")[0] ?? null,
    }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title={`Kaart (${crew.length} crew · ${events.length} events)`} />
      <div className="flex-1 overflow-hidden p-4">
        {crew.length === 0 && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen geocodeerde locaties. Draai <code className="bg-muted px-1 rounded">pnpm db:geocode</code> om
            crew- en eventadressen naar coördinaten om te zetten (gratis via OpenStreetMap, ~1 per seconde).
          </p>
        ) : (
          <CrewMap crew={crew} events={events} />
        )}
      </div>
    </div>
  );
}
