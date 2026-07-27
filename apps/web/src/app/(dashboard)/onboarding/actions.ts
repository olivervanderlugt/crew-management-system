"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Hire a prospect: make them active crew and mark them as in onboarding
// (prospect_status = 'hired' is the onboarding queue marker).
export async function hireProspect(crewId: string): Promise<Result> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("crew") as any)
    .update({ status: "active", prospect_status: "hired" })
    .eq("id", crewId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/prospects");
  revalidatePath("/onboarding");
  revalidatePath("/crew");
  return { ok: true };
}

// Finish onboarding: clear the queue marker. The crew member stays active.
export async function completeOnboarding(crewId: string): Promise<Result> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("crew") as any)
    .update({ prospect_status: null })
    .eq("id", crewId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");
  return { ok: true };
}
