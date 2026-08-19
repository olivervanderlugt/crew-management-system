import { NextResponse } from "next/server";
import { matchCrew, getMatchingPool } from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";

export async function POST(request: Request) {
  try {
    // This route returns whole crew rows. Until now its only gate was the
    // middleware redirect, and it was saved from being a PII dump purely by
    // the client below happening to run under the caller's RLS.
    if (!(await hasPerm("assignments"))) {
      return NextResponse.json({ error: "Geen rechten voor matching." }, { status: 403 });
    }
    const body = await request.json();
    const { eventData, date } = body as {
      eventData: {
        id?: string;
        start_datetime: string;
        end_datetime: string;
        crew_needed: number;
      };
      date: string;
    };

    if (!eventData || !date) {
      return NextResponse.json(
        { error: "eventData and date are required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const { data: pool, error: poolError } = await getMatchingPool(supabase as unknown as Parameters<typeof getMatchingPool>[0], date);

    if (poolError) {
      console.error("getMatchingPool error:", poolError);
      return NextResponse.json(
        { error: "Kon matching pool niet ophalen" },
        { status: 500 }
      );
    }

    // Conflict-aware matching: find crew already booked on a time-overlapping
    // event so the matcher can exclude them (sorted to the bottom with a clear
    // reason) instead of merely warning. Two events overlap when
    // start < otherEnd AND end > otherStart. Resolved here (DB I/O) and handed
    // to the pure matcher as an id set.
    let bookedCrewIds: string[] = [];
    try {
      const { data: clashes } = await supabase
        .from("assignments")
        .select("crew_id, events!inner(id, start_datetime, end_datetime)")
        .in("status", ["invited", "confirmed", "checked_in"])
        .lt("events.start_datetime", eventData.end_datetime)
        .gt("events.end_datetime", eventData.start_datetime);
      const rows = (clashes ?? []) as unknown as Array<{
        crew_id: string;
        events: { id: string } | null;
      }>;
      bookedCrewIds = [
        ...new Set(
          rows
            .filter((r) => r.events && r.events.id !== (eventData.id ?? ""))
            .map((r) => r.crew_id)
        ),
      ];
    } catch (e) {
      console.error("double-booking check failed:", e);
    }

    const result = matchCrew({
      event: {
        id: eventData.id ?? "preview",
        start_datetime: eventData.start_datetime,
        end_datetime: eventData.end_datetime,
        crew_needed: eventData.crew_needed,
      },
      required_skills: [],
      crew_pool: pool ?? [],
      busy_crew_ids: bookedCrewIds,
    });

    // Still returned for backward compatibility with the matching UI badge; the
    // matcher now also excludes these crew outright.
    return NextResponse.json({ ...result, booked_crew_ids: bookedCrewIds });
  } catch (err) {
    console.error("match route error:", err);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
