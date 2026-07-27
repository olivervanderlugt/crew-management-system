"use client";

import { useMemo, useState } from "react";
import { computeWorkedHours, formatHoursClock } from "@crewops/core";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Check, Loader2, Lock } from "lucide-react";

export interface AssignmentHoursValue {
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number | null;
  hours_approved: boolean | null;
  distance_km: number | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hhmm(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(dateYmd: string, time: string, addDay: boolean): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  if (addDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/**
 * Inline worked-hours + travel editor for one assignment.
 * Automation: hours are pre-filled from the event's scheduled times and the km
 * are pre-computed from the home↔event distance — both editable. Editing only
 * unlocks once the shift has ended (eventEnded), so hours are registered after
 * the fact. Times entered as HH:MM; an end at/before start counts as next day.
 */
export function AssignmentHours({
  eventId,
  assignmentId,
  eventDate,
  eventStart,
  eventEnd,
  eventEnded,
  canEdit,
  suggestedKm,
  value,
}: {
  eventId: string;
  assignmentId: string;
  eventDate: string; // YYYY-MM-DD
  eventStart: string; // HH:MM (scheduled)
  eventEnd: string; // HH:MM (scheduled)
  eventEnded: boolean;
  canEdit: boolean;
  suggestedKm: number | null;
  value: AssignmentHoursValue;
}) {
  // Pre-fill from the schedule when nothing is recorded yet.
  const [start, setStart] = useState(hhmm(value.clock_in) || eventStart);
  const [end, setEnd] = useState(hhmm(value.clock_out) || eventEnd);
  const [brk, setBrk] = useState(String(value.break_minutes ?? 0));
  const [approved, setApproved] = useState(!!value.hours_approved);
  const [km, setKm] = useState(
    value.distance_km != null ? String(value.distance_km) : suggestedKm != null ? String(suggestedKm) : ""
  );
  const [saving, setSaving] = useState(false);

  const editable = canEdit && eventEnded;

  const hours = useMemo(() => {
    const ci = toIso(eventDate, start, false);
    const co = toIso(eventDate, end, !!start && !!end && end <= start);
    return computeWorkedHours({ clock_in: ci, clock_out: co, break_minutes: parseInt(brk, 10) || 0 });
  }, [eventDate, start, end, brk]);

  async function save() {
    setSaving(true);
    try {
      const ci = toIso(eventDate, start, false);
      const co = toIso(eventDate, end, !!start && !!end && end <= start);
      const res = await fetch(`/api/events/${eventId}/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clock_in: ci,
          clock_out: co,
          break_minutes: parseInt(brk, 10) || 0,
          hours_approved: approved,
          distance_km: km.trim() === "" ? null : Math.max(0, parseFloat(km.replace(",", ".")) || 0),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? "Mislukt");
      }
      toast.success(`Uren opgeslagen (${formatHoursClock(hours)})`);
    } catch (e) {
      toast.error("Opslaan mislukt", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "h-7 w-[4.5rem] rounded border border-input bg-transparent px-1.5 text-xs text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="time" value={start} disabled={!editable} onChange={(e) => setStart(e.target.value)} className={inputCls} aria-label="Starttijd" />
      <span className="text-muted-foreground text-xs">–</span>
      <input type="time" value={end} disabled={!editable} onChange={(e) => setEnd(e.target.value)} className={inputCls} aria-label="Eindtijd" />
      <input type="number" min={0} value={brk} disabled={!editable} onChange={(e) => setBrk(e.target.value)} className={inputCls} aria-label="Pauze (min)" title="Pauze in minuten" />
      <span className="text-xs font-semibold tabular-nums w-12 text-right" title="Gewerkte uren">{formatHoursClock(hours)}</span>
      <span className="flex items-center gap-1">
        <input type="number" min={0} step="0.1" value={km} disabled={!editable} onChange={(e) => setKm(e.target.value)} className={inputCls} aria-label="Kilometers" title="Reisafstand (km), voorgerekend" />
        <span className="text-[10px] text-muted-foreground">km</span>
      </span>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={approved} disabled={!editable} onChange={(e) => setApproved(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
        Akkoord
      </label>
      {!eventEnded ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Beschikbaar na afloop van de shift">
          <Lock className="h-3 w-3" /> na afloop
        </span>
      ) : (
        canEdit && (
          <Button size="sm" variant="default" className="h-7 px-2 text-xs" disabled={saving || !start || !end} onClick={save}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Opslaan
          </Button>
        )
      )}
    </div>
  );
}
