"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { writeAudit } from "@/lib/audit";

type Result = { ok: true } | { ok: false; error: string };

// Hire a prospect: make them active crew and mark them as in onboarding
// (prospect_status = 'hired' is the onboarding queue marker).
export async function hireProspect(crewId: string): Promise<Result> {
  if (!(await hasPerm("crew"))) {
    return { ok: false, error: "Geen rechten om crew aan te nemen." };
  }
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
//
// `missing` carries the checklist items that were still open when an admin
// chose to finish anyway — an early finish is allowed (someone starts before
// their VOG comes back more often than not), but it is never silent: it goes
// into the audit log with the list of what was outstanding.
export async function completeOnboarding(
  crewId: string,
  missing: string[] = []
): Promise<Result> {
  if (!(await hasPerm("crew"))) {
    return { ok: false, error: "Geen rechten om onboarding af te ronden." };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("crew") as any)
    .update({ prospect_status: null })
    .eq("id", crewId);
  if (error) return { ok: false, error: error.message };

  if (missing.length > 0) {
    await writeAudit({
      action: "UPDATE",
      table_name: "crew",
      record_id: crewId,
      new_data: {
        onboarding: "completed_early",
        missing: missing.slice(0, 20),
      },
    });
  }

  revalidatePath("/onboarding");
  revalidatePath("/crew");
  return { ok: true };
}
