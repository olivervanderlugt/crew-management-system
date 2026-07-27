import { NextResponse } from "next/server";
import { getEventById, updateEvent, createEventSchema } from "@crewops/core";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { geocodeAddress, eventGeoQuery } from "@/lib/geo/geocode";
import { writeAudit, clientIp } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: event, error } = await getEventById(
      supabase as unknown as Parameters<typeof getEventById>[0],
      id
    );

    if (error || !event) {
      return NextResponse.json(
        { error: "Event niet gevonden" },
        { status: 404 }
      );
    }

    return NextResponse.json(event);
  } catch (err) {
    console.error("event GET error:", err);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await hasPerm("events"))) {
      return NextResponse.json({ error: "Geen rechten voor events" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();

    // The edit form always submits the full event, so validate against the full
    // create schema (which enforces end > start).
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ongeldige invoer", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Re-geocode on every edit (the address may have changed); best-effort.
    const query = eventGeoQuery(parsed.data);
    const coords = query ? await geocodeAddress(query) : null;
    const updateData = coords
      ? { ...parsed.data, latitude: coords.lat, longitude: coords.lng }
      : parsed.data;

    const { data: event, error } = await updateEvent(
      supabase as unknown as Parameters<typeof updateEvent>[0],
      id,
      updateData
    );

    if (error || !event) {
      console.error("updateEvent error:", error);
      return NextResponse.json({ error: "Kon event niet bijwerken" }, { status: 500 });
    }

    await writeAudit({
      action: "UPDATE",
      table_name: "events",
      record_id: id,
      new_data: updateData,
      ip: clientIp(request),
    });

    return NextResponse.json(event);
  } catch (err) {
    console.error("event PATCH error:", err);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
