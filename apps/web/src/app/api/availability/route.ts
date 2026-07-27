import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilityStatus, UUID } from "@crewops/core";

// POST /api/availability — upsert a single availability entry
export async function POST(req: NextRequest) {
  const body = await req.json() as { crew_id: UUID; date: string; status: AvailabilityStatus };
  const { crew_id, date, status } = body;

  if (!crew_id || !date || !status) {
    return NextResponse.json({ error: "crew_id, date en status zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  // Use setAvailability pattern: upsert with conflict on crew_id + date
  const { error } = await supabase
    .from("availability")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ crew_id, date, status } as any, { onConflict: "crew_id,date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, crew_id, date, status });
}

// PUT /api/availability — bulk fill/clear for many crew × dates at once.
// Body: { crew_ids: UUID[], dates: string[], status: AvailabilityStatus | null }
// status null clears those cells. RLS still applies (user-scoped client), so a
// non-'crew' admin is rejected by the database, same as the single-cell POST.
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as {
    crew_ids?: UUID[];
    dates?: string[];
    status?: AvailabilityStatus | null;
  };
  const crewIds = body.crew_ids ?? [];
  const dates = body.dates ?? [];
  const status = body.status ?? null;

  if (!Array.isArray(crewIds) || !Array.isArray(dates) || crewIds.length === 0 || dates.length === 0) {
    return NextResponse.json({ error: "crew_ids en dates zijn verplicht" }, { status: 400 });
  }
  // Guardrails so a runaway request can't write an unbounded payload.
  if (crewIds.length > 1000 || dates.length > 45) {
    return NextResponse.json({ error: "Te veel crew of datums in één keer" }, { status: 400 });
  }
  if (status !== null && !["B", "M", "X", "W", "V"].includes(status)) {
    return NextResponse.json({ error: "Ongeldige status" }, { status: 400 });
  }

  const supabase = await createClient();

  if (status === null) {
    // Clear: one delete over the crew × date matrix.
    const { error } = await supabase
      .from("availability")
      .delete()
      .in("crew_id", crewIds)
      .in("date", dates);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: crewIds.length * dates.length });
  }

  // Fill: build the full crew × date matrix and upsert in one call.
  const rows = crewIds.flatMap((crew_id) => dates.map((date) => ({ crew_id, date, status })));
  const { error } = await supabase
    .from("availability")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: "crew_id,date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, written: rows.length });
}

// DELETE /api/availability — remove an availability entry
export async function DELETE(req: NextRequest) {
  const body = await req.json() as { crew_id: string; date: string };
  const { crew_id, date } = body;

  if (!crew_id || !date) {
    return NextResponse.json({ error: "crew_id en date zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("crew_id", crew_id)
    .eq("date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
