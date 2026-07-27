"use server";

import { revalidatePath } from "next/cache";
import { requirePortalCrew } from "@/lib/portal/session";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// Fields a crew member may fill in for themselves during onboarding. Identity/
// status/seniority are NOT here, so they can never be self-edited.
const ONBOARDING_FIELDS = [
  "phone", "street", "postcode", "home_city",
  "date_of_birth", "nationality",
  "emergency_contact_name", "emergency_contact_phone", "iban",
] as const;

// Crew updates their own onboarding fields. Runs as service role AFTER verifying
// the session belongs to a crew member, scoped to that crew's own id.
export async function saveOnboarding(input: Record<string, string>): Promise<Result> {
  const { crew } = await requirePortalCrew();
  const update: Record<string, string | null> = {};
  for (const f of ONBOARDING_FIELDS) {
    if (f in input) update[f] = (input[f] ?? "").trim() || null;
  }
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("crew") as any).update(update).eq("id", crew.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portaal/onboarding");
  return { ok: true };
}

const ALLOWED_DOCS = ["vog", "id_document", "contract"];

// Crew uploads one of their own onboarding documents (service role, own crew_id).
export async function uploadOnboardingDoc(formData: FormData): Promise<Result> {
  const { crew } = await requirePortalCrew();
  const file = formData.get("file") as File | null;
  const docType = String(formData.get("doc_type") ?? "");
  if (!file || file.size === 0) return { ok: false, error: "Geen bestand gekozen." };
  if (file.size > 10_000_000) return { ok: false, error: "Bestand is te groot (max 10 MB)." };
  if (!ALLOWED_DOCS.includes(docType)) return { ok: false, error: "Ongeldig documenttype." };

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${crew.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await admin.storage.from("crew-documents").upload(path, file, { upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (admin.from("crew_documents") as any).insert({
    crew_id: crew.id,
    doc_type: docType,
    title: file.name,
    file_path: path,
  });
  if (insErr) {
    await admin.storage.from("crew-documents").remove([path]).catch(() => {});
    return { ok: false, error: insErr.message };
  }
  revalidatePath("/portaal/onboarding");
  return { ok: true };
}
