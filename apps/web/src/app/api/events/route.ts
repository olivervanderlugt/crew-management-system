import { NextResponse } from "next/server";
import { createEvent, createEventSchema } from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { geocodeAddress, eventGeoQuery } from "@/lib/geo/geocode";
import { writeAudit, clientIp } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasPerm("events"))) {
      return NextResponse.json({ error: "Geen rechten voor events" }, { status: 403 });
    }
    const body = await request.json();
    const parsed = createEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ongeldige invoer", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();
    const { data: event, error } = await createEvent(supabase as unknown as Parameters<typeof createEvent>[0], parsed.data);

    if (error || !event) {
      console.error("createEvent error:", error);
      return NextResponse.json(
        { error: "Kon event niet aanmaken" },
        { status: 500 }
      );
    }

    // Geocode on save — only when coordinates weren't supplied (recurring
    // occurrences pass the first occurrence's coords so we don't re-geocode the
    // same address). Best-effort: a geocode miss never fails the save.
    let result = event as typeof event & {
      latitude?: number | null;
      longitude?: number | null;
    };
    if (parsed.data.latitude == null && parsed.data.longitude == null) {
      const query = eventGeoQuery(parsed.data);
      if (query) {
        const coords = await geocodeAddress(query);
        if (coords) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: updated } = await (supabase.from("events") as any)
            .update({ latitude: coords.lat, longitude: coords.lng })
            .eq("id", (event as { id: string }).id)
            .select()
            .single();
          if (updated) result = updated;
        }
      }
    }

    await writeAudit({
      action: "INSERT",
      table_name: "events",
      record_id: (result as { id: string }).id,
      new_data: result,
      ip: clientIp(request),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("events POST error:", err);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
