"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, Loader2 } from "lucide-react";

import { createEventSchema } from "@crewops/core";
import type { EventStatus } from "@crewops/core";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/components/admin/perms-context";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// Costing columns (migration 0015) only exist when this flag is on; gate both
// the input and the payload so we never send an unknown column to the DB.
const COSTING = process.env.NEXT_PUBLIC_COSTING === "true";

// Convert an ISO timestamp to a "YYYY-MM-DDTHH:mm" value for <input datetime-local>
// in the browser's local timezone.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHoursLocal(local: string, hours: number): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface FormState {
  name: string;
  client: string;
  venue: string;
  address: string;
  start_datetime: string;
  end_datetime: string;
  crew_needed: string;
  status: EventStatus;
  notes: string;
  charge_rate: string;
}

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: "draft", label: "Concept" },
  { value: "planned", label: "Gepland" },
  { value: "confirmed", label: "Bevestigd" },
  { value: "done", label: "Afgerond" },
  { value: "cancelled", label: "Geannuleerd" },
];

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const canEdit = useCan("events");

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Standard clients for the datalist + venue/address autofill.
  type ClientLite = { name: string; venue: string | null; address: string | null };
  const [clients, setClients] = useState<ClientLite[]>([]);

  useEffect(() => {
    createClient()
      .from("clients")
      .select("name, venue, address")
      .order("name")
      .then(({ data }) => setClients((data ?? []) as ClientLite[]));
  }, []);

  // Load the event into the form.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) throw new Error("Event niet gevonden");
        const ev = await res.json();
        setForm({
          name: ev.name ?? "",
          client: ev.client ?? "",
          venue: ev.venue ?? "",
          address: ev.address ?? "",
          start_datetime: ev.start_datetime ? isoToLocalInput(ev.start_datetime) : "",
          end_datetime: ev.end_datetime ? isoToLocalInput(ev.end_datetime) : "",
          crew_needed: String(ev.crew_needed ?? 1),
          status: (ev.status ?? "draft") as EventStatus,
          notes: ev.notes ?? "",
          charge_rate: ev.charge_rate != null ? String(ev.charge_rate) : "",
        });
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Laadfout");
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleClientChange(value: string) {
    const match = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    setForm((prev) =>
      prev
        ? {
            ...prev,
            client: value,
            venue: match?.venue ?? prev.venue,
            address: match?.address ?? prev.address,
          }
        : prev
    );
  }

  function handleStartChange(value: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next.start_datetime;
      delete next.end_datetime;
      return next;
    });
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, start_datetime: value };
      if (value && (!prev.end_datetime || new Date(prev.end_datetime) <= new Date(value))) {
        next.end_datetime = addHoursLocal(value, 4);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form) return;
    const raw = {
      name: form.name.trim(),
      client: form.client.trim() || null,
      venue: form.venue.trim() || null,
      address: form.address.trim() || null,
      start_datetime: form.start_datetime ? new Date(form.start_datetime).toISOString() : "",
      end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : "",
      crew_needed: parseInt(form.crew_needed, 10) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
      // Only attach the costing column when the migration/flag is live.
      ...(COSTING
        ? { charge_rate: form.charge_rate.trim() === "" ? null : Number(form.charge_rate) }
        : {}),
    };

    const parsed = createEventSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
        fieldErrors[field] = (msgs as string[])[0] ?? "Ongeldig";
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Opslaan mislukt");
      }
      toast.success("Event bijgewerkt");
      router.push(`/events/${eventId}`);
    } catch (err) {
      setErrors({ _global: err instanceof Error ? err.message : "Onbekende fout" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title="Event laden…" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (loadError || !form) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar
          title="Event bewerken"
          actions={
            <Button variant="outline" size="sm" onClick={() => router.push("/events")}>
              <ChevronLeft className="h-3 w-3" />
              Terug
            </Button>
          }
        />
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <AlertCircle className="h-5 w-5 mr-2" />
          {loadError ?? "Event niet gevonden"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title="Event bewerken"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(`/events/${eventId}`)}>
            <ChevronLeft className="h-3 w-3" />
            Terug
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {!canEdit && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Je hebt geen rechten om events te bewerken — wijzigingen worden niet opgeslagen.
            </div>
          )}

          {errors._global && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors._global}
            </div>
          )}

          {/* Event details */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Eventdetails
            </h2>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Naam <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className={cn(errors.name && "border-destructive")}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="client">Klant</Label>
                  <Input
                    id="client"
                    list="clients-list"
                    value={form.client}
                    onChange={(e) => handleClientChange(e.target.value)}
                    placeholder="Kies of typ een klant"
                  />
                  <datalist id="clients-list">
                    {clients.map((c) => <option key={c.name} value={c.name} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue">Locatie</Label>
                  <Input
                    id="venue"
                    value={form.venue}
                    onChange={(e) => setField("venue", e.target.value)}
                    placeholder="Venuenaam"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">Adres</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="Straat, stad"
                />
                <p className="text-xs text-muted-foreground">
                  Bij opslaan worden de coördinaten voor de kaart automatisch bijgewerkt.
                </p>
              </div>
            </div>
          </section>

          {/* Datum & tijd */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Datum &amp; Tijd
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start_datetime">
                  Start <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_datetime"
                  type="datetime-local"
                  value={form.start_datetime}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className={cn(errors.start_datetime && "border-destructive")}
                />
                {errors.start_datetime && (
                  <p className="text-xs text-destructive">{errors.start_datetime}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_datetime">
                  Einde <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="end_datetime"
                  type="datetime-local"
                  value={form.end_datetime}
                  min={form.start_datetime || undefined}
                  onChange={(e) => setField("end_datetime", e.target.value)}
                  className={cn(errors.end_datetime && "border-destructive")}
                />
                {errors.end_datetime && (
                  <p className="text-xs text-destructive">{errors.end_datetime}</p>
                )}
              </div>
            </div>
          </section>

          {/* Crew & status */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Crew &amp; Status
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="crew_needed">
                  Aantal crew <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="crew_needed"
                  type="number"
                  min={1}
                  value={form.crew_needed}
                  onChange={(e) => setField("crew_needed", e.target.value)}
                  className={cn(errors.crew_needed && "border-destructive")}
                />
                {errors.crew_needed && (
                  <p className="text-xs text-destructive">{errors.crew_needed}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value as EventStatus)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {COSTING && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="charge_rate">Klanttarief (€/crew-uur)</Label>
                  <Input
                    id="charge_rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.charge_rate}
                    onChange={(e) => setField("charge_rate", e.target.value)}
                    placeholder="bijv. 40"
                  />
                  <p className="text-xs text-muted-foreground">Wat je de klant per crewlid per uur rekent — voor de marge­berekening.</p>
                </div>
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notities
            </h2>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push(`/events/${eventId}`)}>
              Annuleren
            </Button>
            <Button onClick={handleSave} disabled={saving || !canEdit}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opslaan…
                </>
              ) : (
                "Wijzigingen opslaan"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
