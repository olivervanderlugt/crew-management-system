"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";

type Result = { ok: true } | { ok: false; error: string };

// Mirrors the prospect_pipeline_status enum (migration 0005). Kept as a const
// array so the action can reject anything else before it reaches Postgres.
// Not exported: a "use server" module may only export async functions.
const PIPELINE_STAGES = [
  "new",
  "contacted",
  "intake_planned",
  "intake_done",
  "hired",
  "rejected",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Move a prospect to another pipeline stage. Used by the board's drag-and-drop
// and by the per-card stage picker, which is the touch and keyboard path.
export async function moveProspect(
  crewId: string,
  stage: PipelineStage
): Promise<Result> {
  if (!(await hasPerm("crew"))) {
    return { ok: false, error: "Geen rechten om prospects te verplaatsen." };
  }
  if (!PIPELINE_STAGES.includes(stage)) {
    return { ok: false, error: "Onbekende fase." };
  }

  // Dropping on "Aangenomen" has to do exactly what the Aannemen button does,
  // or the record ends up hired while still carrying status 'prospect'.
  // Dragging back out of that column undoes it.
  const patch =
    stage === "hired"
      ? { prospect_status: "hired", status: "active" }
      : { prospect_status: stage, status: "prospect" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("crew") as any)
    .update(patch)
    .eq("id", crewId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/prospects");
  revalidatePath("/onboarding");
  revalidatePath("/crew");
  return { ok: true };
}
