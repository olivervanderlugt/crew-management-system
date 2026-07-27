"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Car, CheckCircle2, ChevronLeft, Loader2, User, AlertCircle } from "lucide-react";

import { createEventSchema } from "@crewops/core";
import type { MatchResult, MatchCandidate, CreateEventInput } from "@crewops/core";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, scoreColor, statusLabel } from "@/lib/utils";

// ─── Factor label map ────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  availability: "Beschikbaarheid",
  skill_match: "Skills",
  transport: "Transport",
  seniority: "Seniority",
  workload_balance: "Werkdruk",
};

const FACTOR_COLORS: Record<string, string> = {
  availability: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  skill_match: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  transport: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  seniority: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  workload_balance: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

// ─── Score bar ───────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor =
    pct >= 70
      ? "bg-green-500"
      : pct >= 40
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums w-8 text-right", scoreColor(pct))}>
        {Math.round(pct)}
      </span>
    </div>
  );
}

// ─── Phase 1 — Event form ────────────────────────────────────

interface FormState {
  name: string;
  client: string;
  venue: string;
  address: string;
  start_datetime: string;
  end_datetime: string;
  crew_needed: string;
  status: "draft" | "planned" | "confirmed";
  notes: string;
  recur_freq: "none" | "daily" | "weekly";
  recur_count: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  client: "",
  venue: "",
  address: "",
  start_datetime: "",
  end_datetime: "",
  crew_needed: "1",
  status: "draft",
  notes: "",
  recur_freq: "none",
  recur_count: "4",
};

// Shift an ISO datetime by a number of days (for recurring series).
function shiftIsoDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Add hours to a "YYYY-MM-DDTHH:mm" datetime-local string (local time).
function addHoursLocal(local: string, hours: number): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Main page ───────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"form" | "matching">("form");
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const [eventData, setEventData] = useState<CreateEventInput | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Standard clients for the autocomplete + venue/address autofill.
  type ClientLite = { name: string; venue: string | null; address: string | null };
  const [clients, setClients] = useState<ClientLite[]>([]);
  useEffect(() => {
    createClient()
      .from("clients")
      .select("name, venue, address")
      .order("name")
      .then(({ data }) => setClients((data ?? []) as ClientLite[]));
  }, []);

  function handleClientChange(value: string) {
    setField("client", value);
    const match = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setForm((prev) => ({
        ...prev,
        client: value,
        venue: match.venue ?? prev.venue,
        address: match.address ?? prev.address,
      }));
    }
  }

  // ── Field helpers ──────────────────────────────────────────

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Assisted start change: auto-fill the end (start + 4h) when it's empty or no
  // longer after the start, so the end is always valid by default.
  function handleStartChange(value: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next.start_datetime;
      delete next.end_datetime;
      return next;
    });
    setForm((prev) => {
      const next = { ...prev, start_datetime: value };
      if (value && (!prev.end_datetime || new Date(prev.end_datetime) <= new Date(value))) {
        next.end_datetime = addHoursLocal(value, 4);
      }
      return next;
    });
  }

  // ── Phase 1 → 2: validate + run matching ──────────────────

  async function handleMatch() {
    // Parse form into API shape
    const raw = {
      name: form.name.trim(),
      client: form.client.trim() || null,
      venue: form.venue.trim() || null,
      address: form.address.trim() || null,
      start_datetime: form.start_datetime
        ? new Date(form.start_datetime).toISOString()
        : "",
      end_datetime: form.end_datetime
        ? new Date(form.end_datetime).toISOString()
        : "",
      crew_needed: parseInt(form.crew_needed, 10) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const parsed = createEventSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(
        parsed.error.flatten().fieldErrors
      )) {
        fieldErrors[field] = (msgs as string[])[0] ?? "Ongeldig";
      }
      setErrors(fieldErrors);
      return;
    }

    setLoadingMatch(true);
    setErrors({});

    try {
      const date = parsed.data.start_datetime.split("T")[0]!;
      const res = await fetch("/api/events/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventData: parsed.data, date }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Matching mislukt");
      }

      const body = await res.json();
      const result: MatchResult = body;
      setMatchResult(result);
      setBookedIds(new Set<string>((body.booked_crew_ids as string[]) ?? []));
      setEventData(parsed.data);
      setPhase("matching");
      setSelected(new Set());
    } catch (err) {
      setErrors({ _global: err instanceof Error ? err.message : "Onbekende fout" });
    } finally {
      setLoadingMatch(false);
    }
  }

  // ── Toggle crew selection ──────────────────────────────────

  function toggleCrew(crewId: string) {
    const crewNeeded = parseInt(form.crew_needed, 10) || 1;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else if (next.size < crewNeeded) {
        next.add(crewId);
      }
      return next;
    });
  }

  // ── Phase 2: save event + assignments ────────────────────

  async function handleSave() {
    if (!eventData) return;
    setSaving(true);
    setSaveError(null);

    try {
      // Recurring series can be tied together by a shared group id (migration
      // 0011). Gated by a flag so it stays inert until the column exists on the
      // DB; until then events are created exactly as before.
      const recurrenceGroups = process.env.NEXT_PUBLIC_RECURRENCE_GROUPS === "true";
      const groupId =
        recurrenceGroups && form.recur_freq !== "none" ? crypto.randomUUID() : null;
      const baseEvent = groupId
        ? { ...eventData, recurrence_group_id: groupId }
        : eventData;

      // 1. Create event
      const evRes = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseEvent),
      });

      if (!evRes.ok) {
        const body = await evRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Event aanmaken mislukt");
      }

      const createdEvent = await evRes.json() as {
        id: string;
        latitude?: number | null;
        longitude?: number | null;
      };

      // 2. Create assignments if any selected
      if (selected.size > 0) {
        const assignments = Array.from(selected).map((crew_id) => ({
          crew_id,
          role: null,
          status: "proposed",
        }));

        const aRes = await fetch(`/api/events/${createdEvent.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments }),
        });

        if (!aRes.ok) {
          const body = await aRes.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Toewijzingen aanmaken mislukt"
          );
        }
      }

      // 3. Recurring series — create the additional occurrences (no assignments).
      if (form.recur_freq !== "none") {
        const count = Math.min(52, Math.max(2, parseInt(form.recur_count, 10) || 2));
        const stepDays = form.recur_freq === "weekly" ? 7 : 1;
        for (let i = 1; i < count; i++) {
          const occ = {
            ...baseEvent,
            start_datetime: shiftIsoDays(eventData.start_datetime, i * stepDays),
            end_datetime: shiftIsoDays(eventData.end_datetime, i * stepDays),
            // Reuse the first occurrence's coordinates so the server doesn't
            // re-geocode the same address for every repeat.
            latitude: createdEvent.latitude ?? null,
            longitude: createdEvent.longitude ?? null,
          };
          await fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(occ),
          }).catch(() => {});
        }
      }

      router.push(`/events/${createdEvent.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setSaving(false);
    }
  }

  // ── Render: Phase 1 ──────────────────────────────────────

  const crewNeeded = parseInt(form.crew_needed, 10) || 1;

  if (phase === "form") {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar
          title="Plan een event"
          actions={
            <Button variant="outline" size="sm" asChild>
              <a href="/events">
                <ChevronLeft className="h-3 w-3" />
                Terug
              </a>
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
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
                    placeholder="bijv. Zomerfestival dag 1"
                    className={cn(errors.name && "border-destructive")}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name}</p>
                  )}
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
                  {!errors.end_datetime && form.start_datetime && (
                    <p className="text-xs text-muted-foreground">Moet ná de start liggen.</p>
                  )}
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
                    onChange={(e) =>
                      setField("status", e.target.value as FormState["status"])
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="draft">Concept</option>
                    <option value="planned">Gepland</option>
                    <option value="confirmed">Bevestigd</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Herhaling */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Herhaling
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="recur_freq">Frequentie</Label>
                  <select
                    id="recur_freq"
                    value={form.recur_freq}
                    onChange={(e) => setField("recur_freq", e.target.value as FormState["recur_freq"])}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="none">Eenmalig</option>
                    <option value="daily">Dagelijks</option>
                    <option value="weekly">Wekelijks</option>
                  </select>
                </div>
                {form.recur_freq !== "none" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="recur_count">Aantal keer</Label>
                    <Input
                      id="recur_count"
                      type="number"
                      min={2}
                      max={52}
                      value={form.recur_count}
                      onChange={(e) => setField("recur_count", e.target.value)}
                    />
                  </div>
                )}
              </div>
              {form.recur_freq !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Er worden {Math.min(52, Math.max(2, parseInt(form.recur_count, 10) || 2))} events
                  aangemaakt ({form.recur_freq === "weekly" ? "wekelijks" : "dagelijks"}); alleen het
                  eerste wordt nu van crew voorzien.
                </p>
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
                placeholder="Bijzonderheden, instructies…"
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </section>

            {/* Action */}
            <div className="flex justify-end pt-2">
              <Button onClick={handleMatch} disabled={loadingMatch} size="default">
                {loadingMatch ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crew matchen…
                  </>
                ) : (
                  "Crew matchen →"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Phase 2 — matching results ────────────────────

  const eligible = matchResult?.candidates.filter((c) => !c.excluded) ?? [];
  const excluded = matchResult?.candidates.filter((c) => c.excluded) ?? [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title="Crew selecteren"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPhase("form")}
          >
            <ChevronLeft className="h-3 w-3" />
            Terug naar form
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Event summary bar */}
        <div className="border-b bg-muted/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold">{eventData?.name}</span>
            {eventData?.client && (
              <span className="text-muted-foreground">{eventData.client}</span>
            )}
            {eventData?.venue && (
              <span className="text-muted-foreground">{eventData.venue}</span>
            )}
            {eventData?.start_datetime && (
              <span className="text-muted-foreground">
                {formatDateTime(eventData.start_datetime)}
              </span>
            )}
            <span className="flex items-center gap-1 font-medium">
              <User className="h-3.5 w-3.5" />
              {crewNeeded} crew nodig
            </span>
            <Badge variant="muted">{statusLabel(eventData?.status ?? "draft")}</Badge>
          </div>
        </div>

        {/* Match stats */}
        <div className="flex items-center gap-6 px-6 py-3 border-b text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{matchResult?.total_available ?? 0}</span>{" "}
            beschikbaar
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{matchResult?.total_excluded ?? 0}</span>{" "}
            uitgesloten
          </span>
          <span className="ml-auto text-muted-foreground">
            <span
              className={cn(
                "font-semibold",
                selected.size >= crewNeeded
                  ? "text-green-600 dark:text-green-400"
                  : "text-foreground"
              )}
            >
              {selected.size}/{crewNeeded}
            </span>{" "}
            geselecteerd
          </span>
        </div>

        {saveError && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        {/* Candidate table */}
        <div className="px-6 py-4 space-y-2">
          {/* Eligible crew */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="pb-2 pr-3 w-8"></th>
                <th className="pb-2 pr-3 w-8 text-center">#</th>
                <th className="pb-2 pr-3">Naam</th>
                <th className="pb-2 pr-3 w-28 font-mono">Code</th>
                <th className="pb-2 pr-3 w-36">Score</th>
                <th className="pb-2 pr-3">Redenen</th>
                <th className="pb-2 w-8 text-center">Auto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eligible.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Geen beschikbare crewleden gevonden voor dit event.
                  </td>
                </tr>
              )}
              {eligible.map((candidate: MatchCandidate, idx: number) => {
                const isSelected = selected.has(candidate.crew.id);
                const isDisabled = !isSelected && selected.size >= crewNeeded;
                return (
                  <CandidateRow
                    key={candidate.crew.id}
                    candidate={candidate}
                    rank={idx + 1}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    onToggle={() => toggleCrew(candidate.crew.id)}
                    excluded={false}
                    booked={bookedIds.has(candidate.crew.id)}
                  />
                );
              })}
            </tbody>
          </table>

          {/* Excluded crew */}
          {excluded.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground py-2 hover:text-foreground transition-colors select-none">
                {excluded.length} uitgesloten crewleden tonen
              </summary>
              <table className="w-full text-sm mt-2">
                <tbody className="divide-y divide-border">
                  {excluded.map((candidate: MatchCandidate, idx: number) => (
                    <CandidateRow
                      key={candidate.crew.id}
                      candidate={candidate}
                      rank={eligible.length + idx + 1}
                      isSelected={false}
                      isDisabled={true}
                      onToggle={() => {}}
                      excluded={true}
                    />
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </div>

      {/* Footer action bar */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selected.size === 0
            ? "Selecteer crewleden om toe te wijzen"
            : `${selected.size} crewli${selected.size === 1 ? "d" : "eden"} geselecteerd`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Opslaan…
              </>
            ) : (
              "Event opslaan (geen toewijzingen)"
            )}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || selected.size === 0}
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Opslaan…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Event opslaan + toewijzen ({selected.size})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate row sub-component ──────────────────────────────

interface CandidateRowProps {
  candidate: MatchCandidate;
  rank: number;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  excluded: boolean;
  booked?: boolean;
}

function CandidateRow({
  candidate,
  rank,
  isSelected,
  isDisabled,
  onToggle,
  excluded,
  booked = false,
}: CandidateRowProps) {
  const { crew, score, reasons, exclusion_reason } = candidate;

  return (
    <tr
      className={cn(
        "transition-colors",
        excluded
          ? "opacity-40"
          : isSelected
            ? "bg-primary/5"
            : isDisabled
              ? "opacity-50"
              : "hover:bg-secondary/30 cursor-pointer"
      )}
      onClick={excluded || isDisabled ? undefined : onToggle}
    >
      {/* Checkbox */}
      <td className="py-2.5 pr-3">
        {!excluded && (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={isDisabled && !isSelected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer"
          />
        )}
      </td>

      {/* Rank */}
      <td className="py-2.5 pr-3 text-center">
        <span className="text-xs font-mono text-muted-foreground">{rank}</span>
      </td>

      {/* Name */}
      <td className="py-2.5 pr-3">
        <span className={cn("font-medium", excluded && "line-through")}>
          {crew.first_name} {crew.last_name}
        </span>
        {booked && !excluded && (
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium" title="Al ingepland op een overlappend event">
            Al ingepland
          </span>
        )}
        {excluded && exclusion_reason && (
          <p className="text-xs text-muted-foreground mt-0.5">{exclusion_reason}</p>
        )}
      </td>

      {/* Crew code */}
      <td className="py-2.5 pr-3">
        <span className="font-mono text-xs text-muted-foreground">
          {crew.crew_code}
        </span>
      </td>

      {/* Score */}
      <td className="py-2.5 pr-3">
        <ScoreBar score={score} />
      </td>

      {/* Reason pills */}
      <td className="py-2.5 pr-3">
        <div className="flex flex-wrap gap-1">
          {reasons
            .filter((r) => r.score > 0)
            .map((r) => (
              <span
                key={r.factor}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  FACTOR_COLORS[r.factor] ?? "bg-muted text-muted-foreground"
                )}
                title={r.label}
              >
                <span className="opacity-60 text-[9px]">
                  {FACTOR_LABELS[r.factor] ?? r.factor}
                </span>
                <span>{Math.round(r.score * 10) / 10}</span>
              </span>
            ))}
          {reasons.filter((r) => r.score > 0).length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>

      {/* Transport */}
      <td className="py-2.5 text-center">
        {crew.has_car ? (
          <Car className="h-3.5 w-3.5 text-muted-foreground mx-auto" aria-label="Eigen auto" />
        ) : null}
      </td>
    </tr>
  );
}
