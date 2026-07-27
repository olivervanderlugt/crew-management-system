import { NextResponse } from "next/server";
import type { AssignmentStatus } from "@crewops/core";
import { computeWorkedHours } from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { writeAudit, clientIp } from "@/lib/audit";
import { syncEventOccupancy } from "@/lib/automation/occupancy";

const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";

type Body = {
  status?: AssignmentStatus;
  // Time-tracking fields (only honoured when the feature is enabled).
  clock_in?: string | null;
  clock_out?: string | null;
  break_minutes?: number | null;
  hours_approved?: boolean;
  distance_km?: number | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    if (!(await hasPerm("assignments"))) {
      return NextResponse.json({ error: "Geen rechten om toe te wijzen" }, { status: 403 });
    }
    const { id: eventId, assignmentId } = await params;
    const body = (await request.json()) as Body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

    if (body.status) {
      update.status = body.status;
      update.responded_at = new Date().toISOString();
    }

    const hasHours =
      "clock_in" in body || "clock_out" in body || "break_minutes" in body ||
      "hours_approved" in body || "distance_km" in body;
    if (TIME_TRACKING && hasHours) {
      if ("clock_in" in body) update.clock_in = body.clock_in || null;
      if ("clock_out" in body) update.clock_out = body.clock_out || null;
      if ("break_minutes" in body) update.break_minutes = Math.max(0, body.break_minutes ?? 0);
      if ("hours_approved" in body) update.hours_approved = !!body.hours_approved;
      if ("distance_km" in body)
        update.distance_km = body.distance_km == null ? null : Math.max(0, body.distance_km);
      // Recompute worked hours from the resulting clock values.
      update.hours_worked = computeWorkedHours({
        clock_in: update.clock_in ?? body.clock_in,
        clock_out: update.clock_out ?? body.clock_out,
        break_minutes: update.break_minutes ?? body.break_minutes ?? 0,
      });
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Niets om bij te werken" }, { status: 400 });
    }

    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("assignments") as any)
      .update(update)
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("assignment update error:", error);
      return NextResponse.json({ error: "Kon toewijzing niet bijwerken" }, { status: 500 });
    }

    await writeAudit({
      action: "UPDATE",
      table_name: "assignments",
      record_id: assignmentId,
      new_data: update,
      ip: clientIp(request),
    });

    // Auto-occupancy: a status change (confirm/decline) may flip the event
    // between Gepland and Bevestigd. Hours-only edits don't affect it.
    if (update.status) {
      await syncEventOccupancy(supabase, eventId);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("assignment PATCH error:", err);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
