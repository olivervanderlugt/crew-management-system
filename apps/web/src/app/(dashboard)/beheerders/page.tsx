import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { Topbar } from "@/components/layout/topbar";
import { AdminManager } from "@/components/admin/AdminManager";

export const metadata = { title: "Beheerders" };

type AdminRow = { user_id: string; email: string | null; is_full: boolean; perms: string[]; created_at: string };

export default async function BeheerdersPage() {
  const me = await getMyAdminPerms();
  if (!can(me, "admins")) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_permissions")
    .select("user_id, email, is_full, perms, created_at")
    .order("created_at", { ascending: true });
  const admins = (data ?? []) as AdminRow[];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="Beheerders" />
      <div className="flex-1 overflow-auto p-4">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Voeg extra beheerders toe met beperkte rechten per onderdeel. Rechten gelden direct (geen opnieuw inloggen nodig).
        </p>
        <AdminManager admins={admins} currentUserId={user?.id ?? ""} />
      </div>
    </div>
  );
}
