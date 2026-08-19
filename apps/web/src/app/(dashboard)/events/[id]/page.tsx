"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Car, ChevronLeft, Clock, Edit, Loader2, Plus, Users, AlertCircle, Euro } from "lucide-react";

import type { AssignmentStatus, EventStatus, CrewSeniority } from "@crewops/core";

import { sumWorkedHours, formatHoursClock, computeEventCosting, eventDurationHours } from "@crewops/core";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/admin/perms-context";
import { Badge } from "@/components/ui/badge";
import { AssignmentHours } from "@/components/events/AssignmentHours";
import { cn, formatDateTime, statusLabel } from "@/lib/utils";

const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";
const COSTING = process.env.NEXT_PUBLIC_COSTING === "true";

const EUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Straight-line distance (km) between two coordinates — used to pre-fill the
// editable travel field. Good enough as a default; the admin can correct it.
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
}

function hhmmLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Types ──────────────────────────────────────────────────

interface CrewRecord {
  id: string;
  crew_code: string;
  first_name: string;
  last_name: string;
  has_car: boolean;
  seniority: string;
  hourly_cost?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface AssignmentRecord {
  id: string;
  event_id: string;
  crew_id: string;
  role: string | null;
  status: AssignmentStatus;
  transport_group: string | null;
  responded_at: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
  break_minutes?: number | null;
  hours_worked?: number | null;
  hours_approved?: boolean | null;
  distance_km?: number | null;
  crew: CrewRecord;
}

interface EventRecord {
  id: string;
  name: string;
  client: string | null;
  venue: string | null;
  address: string | null;
  start_datetime: string;
  end_datetime: string;
  crew_needed: number;
  status: EventStatus;
  notes: string | null;
  charge_rate?: number | null;
  recurrence_group_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  assignments: AssignmentRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────

function eventStatusVariant(
  status: EventStatus
): "muted" | "warning" | "success" | "secondary" | "outline" {
  switch (status) {
    case "draft": return "muted";
    case "planned": return "warning";
    case "confirmed": return "success";
    case "done": return "secondary";
    case "cancelled": return "outline";
  }
}

function assignmentStatusVariant(
  status: AssignmentStatus
): "muted" | "warning" | "success" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "proposed": return "muted";
    case "invited": return "warning";
    case "confirmed": return "success";
    case "declined": return "destructive" as "muted"; // fallback — use destructive class manually
    case "checked_in": return "success";
  }
}

const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "proposed",
  "invited",
  "confirmed",
  "declined",
  "checked_in",
];

// ─── Main component ─────────────────────────────────────────

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingAssignment, setUpdatingAssignment] = useState<string | null>(null);
  const canAssign = useCan("assignments");
  const canEdit = useCan("events");

  // ── Fetch event ──────────────────────────────────────────

  async function fetchEvent() {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        throw new Error("Event niet gevonden");
      }
      const data: EventRecord = await res.json();
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laadfout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ── Update assignment status ─────────────────────────────

  async function updateAssignmentStatus(
    assignmentId: string,
    newStatus: AssignmentStatus
  ) {
    setUpdatingAssignment(assignmentId);
    try {
      const res = await fetch(
        `/api/events/${eventId}/assignments/${assignmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Update mislukt");
      }

      // Optimistic update
      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assignments: prev.assignments.map((a) =>
            a.id === assignmentId ? { ...a, status: newStatus } : a
          ),
        };
      });
    } catch (err) {
      console.error("Assignment status update error:", err);
    } finally {
      setUpdatingAssignment(null);
    }
  }

  // ── Loading / error states ───────────────────────────────

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

  if (error || !event) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar
          title="Event"
          actions={
            <Button variant="outline" size="sm" onClick={() => router.push("/events")}>
              <ChevronLeft className="h-3 w-3" />
              Terug
            </Button>
          }
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error ?? "Event niet gevonden"}</span>
          </div>
        </div>
      </div>
    );
  }

  const confirmed = event.assignments.filter(
    (a) => a.status === "confirmed" || a.status === "checked_in"
  ).length;

  const crewFull = confirmed >= event.crew_needed;

  // Group assignments by transport_group
  const transportGroups = event.assignments.reduce<Record<string, AssignmentRecord[]>>(
    (acc, a) => {
      if (a.transport_group) {
        (acc[a.transport_group] ??= []).push(a);
      }
      return acc;
    },
    {}
  );

  const hasTransportGroups = Object.keys(transportGroups).length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title={event.name}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={eventStatusVariant(event.status)}>
              {statusLabel(event.status)}
            </Badge>
            {event.recurrence_group_id && (
              <Badge variant="outline" title="Onderdeel van een herhaalreeks">
                Reeks
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push("/events")}>
              <ChevronLeft className="h-3 w-3" />
              Events
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/events/${event.id}/edit`)}
              >
                <Edit className="h-3 w-3" />
                Bewerk
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── Event info card ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 rounded-lg border bg-card p-4">
          <InfoField label="Datum / Tijd">
            {formatDateTime(event.start_datetime)}
            {" — "}
            {formatDateTime(event.end_datetime)}
          </InfoField>
          <InfoField label="Locatie">
            {event.venue ?? "—"}
            {event.address && (
              <span className="block text-xs text-muted-foreground mt-0.5">
                {event.address}
              </span>
            )}
          </InfoField>
          <InfoField label="Klant">{event.client ?? "—"}</InfoField>
          <InfoField label="Crew">
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                crewFull
                  ? "text-green-600 dark:text-green-400"
                  : "text-yellow-600 dark:text-yellow-400"
              )}
            >
              {confirmed}/{event.crew_needed}
            </span>
            <span className="text-xs text-muted-foreground ml-1">bevestigd</span>
          </InfoField>
          {event.notes && (
            <div className="col-span-2 lg:col-span-4">
              <InfoField label="Notities">{event.notes}</InfoField>
            </div>
          )}
        </div>

        {/* ── Assignments table ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Toewijzingen
              <span className="text-muted-foreground font-normal">
                ({event.assignments.length})
              </span>
            </h2>
            {canAssign && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/events/new?addTo=${event.id}`)}
              >
                <Plus className="h-3 w-3" />
                Crew toevoegen
              </Button>
            )}
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Naam</th>
                  <th className="py-2 px-3 font-medium w-28 font-mono">Code</th>
                  <th className="py-2 px-3 font-medium w-24">Rol</th>
                  <th className="py-2 px-3 font-medium w-32">Status</th>
                  <th className="py-2 px-3 font-medium w-8 text-center">Auto</th>
                  <th className="py-2 px-3 font-medium w-40 text-right">Wijzig status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {event.assignments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                      Nog geen crewleden toegewezen.
                    </td>
                  </tr>
                )}
                {event.assignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    isUpdating={updatingAssignment === a.id}
                    canAssign={canAssign}
                    onStatusChange={(newStatus) =>
                      updateAssignmentStatus(a.id, newStatus)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Margin & labour cost (costing) ── */}
        {COSTING && (() => {
          const plannedHours = eventDurationHours(event.start_datetime, event.end_datetime);
          const costing = computeEventCosting({
            charge_rate: event.charge_rate ?? null,
            planned_hours: plannedHours,
            lines: event.assignments.map((a) => ({
              id: a.id,
              seniority: (a.crew.seniority as CrewSeniority) ?? "sitecrew",
              hourly_cost: a.crew.hourly_cost ?? null,
              hours_worked: a.hours_worked ?? null,
              secured: a.status === "confirmed" || a.status === "checked_in",
            })),
          });
          const crewById = new Map(event.assignments.map((a) => [a.id, a.crew]));
          const marginTone =
            costing.margin == null ? "" : costing.margin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
          return (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Euro className="h-4 w-4 text-muted-foreground" />
                  Marge &amp; loonkosten
                </h2>
                <span className="text-xs text-muted-foreground">
                  {plannedHours} u gepland · {costing.lines.length} bevestigd
                </span>
              </div>

              {costing.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen bevestigde crew om kosten voor te berekenen.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 rounded-lg border bg-card p-4">
                    <CostStat label="Omzet" value={costing.revenue != null ? EUR.format(costing.revenue) : "—"}
                      hint={costing.revenue == null ? "stel klanttarief in" : "klant"} />
                    <CostStat label="Loonkosten" value={EUR.format(costing.cost)} hint="crew" />
                    <CostStat label="Marge" value={costing.margin != null ? EUR.format(costing.margin) : "—"} valueClass={marginTone} />
                    <CostStat label="Marge %" value={costing.margin_pct != null ? `${Math.round(costing.margin_pct * 100)}%` : "—"} valueClass={marginTone} />
                  </div>

                  {event.charge_rate == null && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      Geen klanttarief ingesteld — vul het uurtarief in bij <span className="font-medium">Bewerk</span> om de marge te zien.
                    </p>
                  )}
                  {costing.has_estimates && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sommige loonkosten zijn een schatting op basis van het niveau (crew zonder eigen uurtarief). Vul het tarief in op de crewpagina voor exacte cijfers.
                    </p>
                  )}

                  <ul className="mt-3 divide-y divide-border rounded-lg border text-sm">
                    {costing.lines.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                        {(() => {
                          const c = crewById.get(l.id);
                          return c ? (
                            <Link href={`/crew/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                              {c.first_name} {c.last_name}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 truncate font-medium">—</span>
                          );
                        })()}
                        <span className="shrink-0 text-xs text-muted-foreground">{l.hours} u</span>
                        <span className={cn("shrink-0 text-xs tabular-nums", l.cost_estimated && "italic text-muted-foreground")}
                          title={l.cost_estimated ? "Schatting op basis van niveau" : "Eigen uurtarief"}>
                          {EUR.format(l.cost_rate)}/u{l.cost_estimated ? "*" : ""}
                        </span>
                        <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">{EUR.format(l.line_cost)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })()}

        {/* ── Worked hours (time-tracking) ── */}
        {TIME_TRACKING && (() => {
          const tracked = event.assignments.filter(
            (a) => a.status === "confirmed" || a.status === "checked_in"
          );
          const eventDate = event.start_datetime.split("T")[0]!;
          const eventStart = hhmmLocal(event.start_datetime);
          const eventEnd = hhmmLocal(event.end_datetime);
          const eventEnded = new Date(event.end_datetime) < new Date();
          const eventCoord =
            event.latitude != null && event.longitude != null
              ? { lat: event.latitude, lng: event.longitude }
              : null;
          const totalHours = sumWorkedHours(
            tracked.map((a) => ({
              clock_in: a.clock_in ?? null,
              clock_out: a.clock_out ?? null,
              break_minutes: a.break_minutes ?? 0,
            }))
          );
          return (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Uren
                  <span className="text-muted-foreground font-normal">({tracked.length})</span>
                </h2>
                <span className="text-sm">
                  Totaal: <span className="font-semibold tabular-nums">{formatHoursClock(totalHours)}</span> uur
                </span>
              </div>
              {!eventEnded && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Urenregistratie wordt automatisch bewerkbaar na afloop van de shift. De tijden en
                  kilometers zijn alvast voorgerekend.
                </p>
              )}
              {tracked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen bevestigde crew om uren voor te registreren.
                </p>
              ) : (
                <ul className="space-y-2">
                  {tracked.map((a) => {
                    const crewCoord =
                      a.crew.latitude != null && a.crew.longitude != null
                        ? { lat: a.crew.latitude, lng: a.crew.longitude }
                        : null;
                    const suggestedKm =
                      eventCoord && crewCoord ? haversineKm(crewCoord, eventCoord) : null;
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 flex-wrap">
                        <Link href={`/crew/${a.crew.id}`} className="text-sm font-medium min-w-[140px] hover:underline">
                          {a.crew.first_name} {a.crew.last_name}
                        </Link>
                        <AssignmentHours
                          eventId={event.id}
                          assignmentId={a.id}
                          eventDate={eventDate}
                          eventStart={eventStart}
                          eventEnd={eventEnd}
                          eventEnded={eventEnded}
                          canEdit={canAssign}
                          suggestedKm={suggestedKm}
                          value={{
                            clock_in: a.clock_in ?? null,
                            clock_out: a.clock_out ?? null,
                            break_minutes: a.break_minutes ?? 0,
                            hours_approved: a.hours_approved ?? false,
                            distance_km: a.distance_km ?? null,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })()}

        {/* ── Transport groups ── */}
        {hasTransportGroups && (
          <section>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Car className="h-4 w-4 text-muted-foreground" />
              Transport
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(transportGroups).map(([group, members]) => (
                <div key={group} className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Groep {group}
                  </p>
                  <ul className="space-y-1">
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className="text-sm flex items-center gap-2"
                      >
                        {m.crew.has_car && (
                          <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <Link href={`/crew/${m.crew.id}`} className="hover:underline">
                          {m.crew.first_name} {m.crew.last_name}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground ml-auto">
                          {m.crew.crew_code}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── InfoField sub-component ──────────────────────────────────

function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

// ─── Cost stat sub-component ──────────────────────────────────

function CostStat({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", valueClass)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Assignment row sub-component ─────────────────────────────

interface AssignmentRowProps {
  assignment: AssignmentRecord;
  isUpdating: boolean;
  canAssign: boolean;
  onStatusChange: (status: AssignmentStatus) => void;
}

const STATUS_BADGE_CLASS: Record<AssignmentStatus, string> = {
  proposed:
    "bg-muted text-muted-foreground",
  invited:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  declined:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  checked_in:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

function AssignmentRow({
  assignment,
  isUpdating,
  canAssign,
  onStatusChange,
}: AssignmentRowProps) {
  const { crew, status } = assignment;

  return (
    <tr className="hover:bg-secondary/30 transition-colors">
      <td className="py-2.5 px-3">
        <Link href={`/crew/${crew.id}`} className="font-medium hover:underline">
          {crew.first_name} {crew.last_name}
        </Link>
      </td>
      <td className="py-2.5 px-3">
        <span className="font-mono text-xs text-muted-foreground">
          {crew.crew_code}
        </span>
      </td>
      <td className="py-2.5 px-3 text-muted-foreground text-xs">
        {assignment.role ?? "—"}
      </td>
      <td className="py-2.5 px-3">
        <span
          className={cn(
            "inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-semibold",
            STATUS_BADGE_CLASS[status]
          )}
        >
          {statusLabel(status)}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center">
        {crew.has_car ? (
          <Car className="h-3.5 w-3.5 text-muted-foreground mx-auto" aria-label="Eigen auto" />
        ) : null}
      </td>
      <td className="py-2.5 px-3 text-right">
        {isUpdating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
        ) : (
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as AssignmentStatus)}
            disabled={!canAssign}
            title={!canAssign ? "Geen rechten om toe te wijzen" : undefined}
            className="text-xs rounded border border-input bg-transparent px-2 py-1 text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}
