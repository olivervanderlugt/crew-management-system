"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Send } from "lucide-react";

type EventLite = { id: string; name: string; start_datetime: string };
type Channel = "whatsapp" | "email";

type AssignmentRow = {
  crew_id: string;
  status: string;
  crew: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
};

const DEFAULT_TEMPLATE =
  "Hoi {{naam}}, je bent ingepland voor {{event}} op {{datum}}. Kun je dit bevestigen? Groet, de planning";

export function NotificationComposer({
  events,
  dispatchEnabled,
}: {
  events: EventLite[];
  dispatchEnabled: boolean;
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [message, setMessage] = useState(DEFAULT_TEMPLATE);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ev = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId]);

  useEffect(() => {
    setPicked(new Set());
    if (!eventId) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await createClient()
        .from("assignments")
        .select("crew_id, status, crew(first_name, last_name, phone, email)")
        .eq("event_id", eventId);
      if (cancelled) return;
      const list = (data ?? []) as unknown as AssignmentRow[];
      setRows(list);
      // Pre-select everyone with a usable contact for the chosen channel.
      setPicked(new Set(list.filter((r) => contactFor(r, channel)).map((r) => r.crew_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function contactFor(r: AssignmentRow, ch: Channel): string | null {
    if (!r.crew) return null;
    return ch === "whatsapp" ? r.crew.phone : r.crew.email;
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function enqueue() {
    if (!message.trim() || picked.size === 0) return;
    setSaving(true);
    try {
      const recipients = rows
        .filter((r) => picked.has(r.crew_id))
        .map((r) => ({
          crew_id: r.crew_id,
          to_address: contactFor(r, channel),
          name: r.crew ? `${r.crew.first_name} ${r.crew.last_name}` : "",
        }));

      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId || null,
          event_name: ev?.name ?? null,
          event_date: ev ? new Date(ev.start_datetime).toLocaleDateString("nl-NL") : null,
          channel,
          body: message,
          recipients,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? "Mislukt");
      }
      const { queued } = await res.json();
      toast.success(`${queued} bericht(en) in de wachtrij`);
      setPicked(new Set());
      router.refresh();
    } catch (e) {
      toast.error("Kon niet in wachtrij zetten", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const eligible = rows.filter((r) => contactFor(r, channel));

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold">Bericht opstellen</h2>

      {!dispatchEnabled && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Verzending staat uit. Berichten worden alleen in de wachtrij gezet. Koppel WhatsApp/e-mail
          (env <code>NEXT_PUBLIC_NOTIFICATIONS_ENABLED</code> + adapter-keys) om echt te versturen.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev">Event</Label>
          <select
            id="ev"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Kies een event…</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {new Date(e.start_datetime).toLocaleDateString("nl-NL")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ch">Kanaal</Label>
          <select
            id="ch"
            value={channel}
            onChange={(e) => { setChannel(e.target.value as Channel); setPicked(new Set()); }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="msg">Bericht</Label>
        <textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Variabelen: <code>{"{{naam}}"}</code>, <code>{"{{event}}"}</code>, <code>{"{{datum}}"}</code>
        </p>
      </div>

      {/* Recipients */}
      {eventId && (
        <div className="space-y-1.5">
          <Label>Ontvangers ({picked.size}/{eligible.length})</Label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen toewijzingen voor dit event.</p>
          ) : (
            <ul className="max-h-48 overflow-auto rounded-md border divide-y text-sm">
              {rows.map((r) => {
                const contact = contactFor(r, channel);
                return (
                  <li key={r.crew_id} className="flex items-center gap-2 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={picked.has(r.crew_id)}
                      disabled={!contact}
                      onChange={() => toggle(r.crew_id)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span className={!contact ? "text-muted-foreground" : ""}>
                      {r.crew ? `${r.crew.first_name} ${r.crew.last_name}` : "—"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {contact ?? `geen ${channel === "whatsapp" ? "telefoon" : "e-mail"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={enqueue} disabled={saving || picked.size === 0 || !message.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          In wachtrij zetten ({picked.size})
        </Button>
      </div>
    </div>
  );
}
