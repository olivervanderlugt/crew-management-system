import { createClient } from "@/lib/supabase/server";
import { can, cleanPerms, type AdminModule, type MyPerms } from "@/lib/admin/modules";

// Server-side permission gate for API routes / actions that use the service
// role (which bypasses RLS). Checks the SIGNED-IN user's module permission.
export async function hasPerm(module: AdminModule): Promise<boolean> {
  return can(await getMyAdminPerms(), module);
}

// Server-only: the current user's admin permissions, read live from
// admin_permissions (so changes apply without a re-login). Pure helpers like
// can()/ADMIN_MODULES live in ./modules and are safe for client components.
export async function getMyAdminPerms(): Promise<MyPerms> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.app_metadata as { role?: string })?.role !== "admin") {
    return { isAdmin: false, isFull: false, perms: [] };
  }
  const { data } = await supabase
    .from("admin_permissions")
    .select("is_full, perms")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { is_full: boolean; perms: string[] } | null;
  return {
    isAdmin: true,
    isFull: !!row?.is_full,
    perms: cleanPerms((row?.perms ?? []) as string[]),
  };
}
