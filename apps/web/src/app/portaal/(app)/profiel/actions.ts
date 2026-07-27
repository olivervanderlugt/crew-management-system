"use server";

import { revalidatePath } from "next/cache";
import { updateCrewProfileSchema, updateCrewProfile, getCrewByUserId } from "@crewops/core";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

// Crew updates their own contact details. The crew_guard_columns trigger and
// RLS guarantee only the caller's own row — and only contact columns — can
// change, regardless of what is sent.
export async function updateProfileAction(input: {
  phone: string | null;
  email: string | null;
  home_city: string | null;
  postcode: string | null;
}): Promise<ActionResult> {
  const parsed = updateCrewProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldige invoer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Je bent niet ingelogd." };

  const { data: crew } = await getCrewByUserId(
    supabase as unknown as Parameters<typeof getCrewByUserId>[0],
    user.id
  );
  if (!crew) return { ok: false, error: "Geen crewprofiel gevonden." };

  const { error } = await updateCrewProfile(
    supabase as unknown as Parameters<typeof updateCrewProfile>[0],
    crew.id,
    parsed.data
  );
  if (error) return { ok: false, error: "Opslaan mislukt. Probeer het opnieuw." };

  revalidatePath("/portaal/profiel");
  return { ok: true };
}
