"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can, cleanPerms } from "@/lib/admin/modules";

type Result = { ok: true } | { ok: false; error: string };

// Every action requires the caller to hold the 'admins' permission — even the
// ones that use the service role, so a limited admin can never escalate.
async function requireAdminsPerm(): Promise<Result> {
  const me = await getMyAdminPerms();
  if (!can(me, "admins")) return { ok: false, error: "Je hebt geen rechten om beheerders te beheren." };
  return { ok: true };
}

export async function createSubAdmin(input: {
  email: string;
  password: string;
  isFull: boolean;
  perms: string[];
}): Promise<Result> {
  const guard = await requireAdminsPerm();
  if (!guard.ok) return guard;

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Ongeldig e-mailadres." };
  if (input.password.length < 8) return { ok: false, error: "Wachtwoord moet minstens 8 tekens zijn." };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (error || !created.user) return { ok: false, error: error?.message ?? "Account aanmaken mislukt." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: pErr } = await (admin.from("admin_permissions") as any).insert({
    user_id: created.user.id,
    email,
    is_full: input.isFull,
    perms: input.isFull ? [] : cleanPerms(input.perms),
  });
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath("/beheerders");
  return { ok: true };
}

export async function updateAdminPerms(input: {
  userId: string;
  isFull: boolean;
  perms: string[];
}): Promise<Result> {
  const guard = await requireAdminsPerm();
  if (!guard.ok) return guard;

  const supabase = await createClient(); // RLS additionally requires the 'admins' perm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("admin_permissions") as any)
    .update({ is_full: input.isFull, perms: input.isFull ? [] : cleanPerms(input.perms) })
    .eq("user_id", input.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/beheerders");
  return { ok: true };
}

export async function deleteSubAdmin(userId: string): Promise<Result> {
  const guard = await requireAdminsPerm();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) return { ok: false, error: "Je kunt je eigen account niet verwijderen." };

  const admin = createAdminClient();
  // Never delete the last full admin.
  const { data: fulls } = await admin.from("admin_permissions").select("user_id").eq("is_full", true);
  const { data: target } = await admin
    .from("admin_permissions")
    .select("is_full")
    .eq("user_id", userId)
    .maybeSingle();
  if (target?.is_full && (fulls ?? []).length <= 1) {
    return { ok: false, error: "Je kunt de laatste volledige beheerder niet verwijderen." };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  // admin_permissions row is removed by the ON DELETE CASCADE FK.
  revalidatePath("/beheerders");
  return { ok: true };
}
