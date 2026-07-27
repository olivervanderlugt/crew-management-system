import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { NotificationComposer } from "@/components/notifications/NotificationComposer";
import { RunRemindersButton } from "@/components/notifications/RunRemindersButton";
import { RunDocumentExpiryButton } from "@/components/notifications/RunDocumentExpiryButton";
import { RunDispatchButton } from "@/components/notifications/RunDispatchButton";

export const metadata: Metadata = { title: "Notificaties" };

type EventLite = { id: string; name: string; start_datetime: string };
type NotifRow = {
  id: string;
  channel: string;
  to_address: string | null;
  body: string;
  status: string;
  created_at: string;
  crew: { first_name: string; last_name: string } | null;
  events: { name: string } | null;
};

function statusBadge(s: string): "muted" | "success" | "warning" | "destructive" {
  if (s === "sent") return "success";
  if (s === "failed") return "destructive";
  if (s === "cancelled") return "warning";
  return "muted"; // queued
}

export default async function NotificatiesPage() {
  const me = await getMyAdminPerms();
  if (!me.isAdmin) notFound();

  const dispatchEnabled = process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED === "true";
  const supabase = await createClient();

  // Upcoming events for the composer.
  const nowIso = new Date().toISOString();
  const { data: evData } = await supabase
    .from("events")
    .select("id, name, start_datetime")
    .gte("start_datetime", nowIso)
    .order("start_datetime", { ascending: true })
    .limit(100);
  const events = (evData ?? []) as EventLite[];

  // Outbox — gracefully handle the table not existing yet (migration 0011).
  let outbox: NotifRow[] = [];
  let tableMissing = false;
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, channel, to_address, body, status, created_at, crew(first_name, last_name), events(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) tableMissing = true;
    else outbox = (data ?? []) as unknown as NotifRow[];
  } catch {
    tableMissing = true;
  }

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Notificaties" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="max-w-2xl space-y-6">
          {tableMissing && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              De notificaties-tabel bestaat nog niet op deze database. Pas migratie{" "}
              <code className="bg-muted px-1 rounded">20240101000011</code> toe met{" "}
              <code className="bg-muted px-1 rounded">supabase db push</code> om de wachtrij te activeren.
              Je kunt hieronder alvast een bericht opstellen.
            </div>
          )}

          <NotificationComposer events={events} dispatchEnabled={dispatchEnabled} />

          {/* Outbox */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <h2 className="text-sm font-semibold">Wachtrij &amp; verzonden</h2>
              <div className="flex items-center gap-2">
                {!tableMissing && <RunDocumentExpiryButton />}
                {!tableMissing && <RunRemindersButton />}
                {!tableMissing && dispatchEnabled && <RunDispatchButton />}
                <Badge variant={dispatchEnabled ? "success" : "muted"}>
                  {dispatchEnabled ? "Verzending aan" : "Verzending uit"}
                </Badge>
              </div>
            </div>
            {outbox.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nog geen berichten.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 px-3 font-medium">Crew</th>
                    <th className="py-2 px-3 font-medium">Event</th>
                    <th className="py-2 px-3 font-medium w-20">Kanaal</th>
                    <th className="py-2 px-3 font-medium w-24">Status</th>
                    <th className="py-2 px-3 font-medium w-28">Aangemaakt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {outbox.map((n) => (
                    <tr key={n.id}>
                      <td className="py-2 px-3">
                        {n.crew ? `${n.crew.first_name} ${n.crew.last_name}` : "—"}
                        <span className="block text-xs text-muted-foreground">{n.to_address ?? ""}</span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{n.events?.name ?? "—"}</td>
                      <td className="py-2 px-3 text-xs">{n.channel}</td>
                      <td className="py-2 px-3"><Badge variant={statusBadge(n.status)}>{n.status}</Badge></td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("nl-NL")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
