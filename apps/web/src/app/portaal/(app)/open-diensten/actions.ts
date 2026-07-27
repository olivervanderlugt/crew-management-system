"use server";

import { revalidatePath } from "next/cache";
import { requirePortalCrew } from "@/lib/portal/session";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

// Crew self-requests an open shift. Crew can't write assignments via RLS, so
// this goes through the service role — but every check is server-side and scoped
// to the verified portal crew: the event must be upcoming and still short on
// crew, and the crew must not already be on it. The request lands as 'proposed'
// (the existing first step of the assignment lifecycle); an admin then
// invites/confirms — so this reuses the model rather than adding a new one.
export async function requestShiftAction(eventId: string): Promise<ActionResult> {
  if (!eventId) return { ok: false, error: "Geen dienst opgegeven." };

  const { crew } = await requirePortalCrew();
  const admin = createAdminClient();

  // Event must exist, be upcoming, and be open for requests.
  const { data: event } = await admin
    .from("events")
    .select("id, status, start_datetime, crew_needed, assignments(status)")
    .eq("id", eventId)
    .single();

  if (!event) return { ok: false, error: "Dienst niet gevonden." };
  const ev = event as unknown as {
    status: string;
    start_datetime: string;
    crew_needed: number;
    assignments: { status: string }[];
  };
  if (ev.status === "cancelled" || ev.status === "done") {
    return { ok: false, error: "Deze dienst is niet meer beschikbaar." };
  }
  if (new Date(ev.start_datetime) < new Date()) {
    return { ok: false, error: "Deze dienst is al geweest." };
  }

  // Already requested/assigned?
  const { data: existing } = await admin
    .from("assignments")
    .select("id")
    .eq("event_id", eventId)
    .eq("crew_id", crew.id)
    .maybeSingle();
  if (existing) return { ok: false, error: "Je hebt deze dienst al aangevraagd." };

  // Still short on crew?
  const confirmed = (ev.assignments ?? []).filter(
    (a) => a.status === "confirmed" || a.status === "checked_in"
  ).length;
  if (confirmed >= ev.crew_needed) {
    return { ok: false, error: "Deze dienst is al vol." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("assignments") as any).insert({
    event_id: eventId,
    crew_id: crew.id,
    status: "proposed",
    role: null,
  });
  if (error) return { ok: false, error: "Aanvraag kon niet worden verstuurd." };

  revalidatePath("/portaal/open-diensten");
  revalidatePath("/portaal/toewijzingen");
  return { ok: true };
}
