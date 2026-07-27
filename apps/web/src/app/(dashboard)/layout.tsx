import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { AdminPermsProvider } from "@/components/admin/perms-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const me = await getMyAdminPerms();

  return (
    <AdminPermsProvider value={me}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar canManageAdmins={can(me, "admins")} canEvents={can(me, "events")} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </AdminPermsProvider>
  );
}
