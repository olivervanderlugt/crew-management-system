import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { Topbar } from "@/components/layout/topbar";
import { ClientManager, type Client } from "@/components/clients/ClientManager";

export const metadata = { title: "Klanten" };

export default async function KlantenPage() {
  const me = await getMyAdminPerms();
  if (!me.isAdmin) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("name", { ascending: true });
  const clients = (data ?? []) as Client[];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title={`Klanten${clients.length ? ` (${clients.length})` : ""}`} />
      <div className="flex-1 overflow-auto p-4">
        <ClientManager clients={clients} canWrite={can(me, "events")} />
      </div>
    </div>
  );
}
