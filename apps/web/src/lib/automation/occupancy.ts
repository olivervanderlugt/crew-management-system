import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOccupancyStatus } from "@crewops/core";
import type { AssignmentStatus, EventStatus } from "@crewops/core";
import { writeAudit } from "@/lib/audit";

// Auto-occupancy: after any assignment change, recompute whether the event has
// enough secured crew and flip its status between "planned" and "confirmed"
// accordingly. The decision lives in @crewops/core (computeOccupancyStatus); this
// module is just the DB read/write around it. Enabled by default; set
// AUTO_OCCUPANCY=false to turn the automation off without code changes.
const AUTO_OCCUPANCY = process.env.AUTO_OCCUPANCY !== "false";

// Accept any service-role/admin Supabase client — callers pass the one they
// already have (API routes: createServiceClient; portal actions:
// createAdminClient). Casts mirror the codebase's existing pattern around the
// generated DB types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * Recompute and, if needed, apply the auto-occupancy status for one event.
 * Returns the new status when it changed, otherwise null. Best-effort: never
 * throws — an automation failure must not break the assignment write that
 * triggered it.
 */
export async function syncEventOccupancy(
  admin: AnyClient,
  eventId: string
): Promise<EventStatus | null> {
  if (!AUTO_OCCUPANCY || !eventId) return null;
  try {
    const { data: event } = await admin
      .from("events")
      .select("id, status, crew_needed, assignments(status)")
      .eq("id", eventId)
      .single();

    if (!event) return null;
    const ev = event as unknown as {
      status: EventStatus;
      crew_needed: number;
      assignments: { status: AssignmentStatus }[];
    };

    const next = computeOccupancyStatus({
      crew_needed: ev.crew_needed,
      current_status: ev.status,
      assignment_statuses: (ev.assignments ?? []).map((a) => a.status),
    });
    if (!next) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from("events") as any)
      .update({ status: next })
      .eq("id", eventId);
    if (error) {
      console.error("auto-occupancy update failed:", error);
      return null;
    }

    await writeAudit({
      action: "UPDATE",
      table_name: "events",
      record_id: eventId,
      new_data: { status: next, reason: "auto-occupancy" },
    });
    return next;
  } catch (err) {
    console.error("syncEventOccupancy error:", err);
    return null;
  }
}

/** Convenience wrapper: resolve an assignment's event, then sync that event. */
export async function syncOccupancyForAssignment(
  admin: AnyClient,
  assignmentId: string
): Promise<EventStatus | null> {
  try {
    const { data } = await admin
      .from("assignments")
      .select("event_id")
      .eq("id", assignmentId)
      .single();
    const eventId = (data as { event_id?: string } | null)?.event_id;
    if (!eventId) return null;
    return await syncEventOccupancy(admin, eventId);
  } catch (err) {
    console.error("syncOccupancyForAssignment error:", err);
    return null;
  }
}
