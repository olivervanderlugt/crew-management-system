"use server";

import { revalidatePath } from "next/cache";
import { respondAssignmentSchema, respondToAssignment } from "@crewops/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOccupancyForAssignment } from "@/lib/automation/occupancy";

type ActionResult = { ok: true } | { ok: false; error: string };

// Crew confirms/declines their own assignment. Ownership and the allowed
// status values are enforced in the database (RLS + the
// assignment_guard_crew_response trigger); this action only validates shape and
// runs the update through the crew member's own session.
export async function respondToAssignmentAction(input: {
  assignment_id: string;
  status: "confirmed" | "declined";
}): Promise<ActionResult> {
  const parsed = respondAssignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ongeldige invoer." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Je bent niet ingelogd." };

  const { error } = await respondToAssignment(
    supabase as unknown as Parameters<typeof respondToAssignment>[0],
    parsed.data.assignment_id,
    parsed.data.status
  );
  if (error) return { ok: false, error: "Reactie kon niet worden opgeslagen." };

  // Auto-occupancy: the crew's confirm/decline may flip the event between
  // Gepland and Bevestigd. The crew session can't write events (RLS), so run the
  // recompute through the service role — it only reads statuses and sets the
  // event status, scoped to this one assignment's event.
  await syncOccupancyForAssignment(createAdminClient(), parsed.data.assignment_id);

  revalidatePath("/portaal/toewijzingen");
  revalidatePath("/portaal");
  return { ok: true };
}
