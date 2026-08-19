import Link from "next/link";
import { Plus, Users, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";
import { SECURED_STATUSES, fetchAllRows, type EventStatus } from "@crewops/core";

import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime, isoDate, statusLabel } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────

function statusVariant(
  status: EventStatus
): "muted" | "warning" | "success" | "secondary" | "outline" {
  switch (status) {
    case "draft":
      return "muted";
    case "planned":
      return "warning";
    case "confirmed":
      return "success";
    case "done":
      return "secondary";
    default:
      return "outline";
  }
}

/** CSS classes for availability heatmap cells */
function heatmapClass(count: number, max: number): string {
  if (max === 0 || count === 0) return "bg-muted text-muted-foreground";
  const ratio = count / max;
  if (ratio >= 0.75) return "bg-green-500 text-white";
  if (ratio >= 0.5) return "bg-green-300 text-green-900";
  if (ratio >= 0.25) return "bg-yellow-300 text-yellow-900";
  return "bg-red-200 text-red-900";
}

// ─── Page ─────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const todayIso = isoDate(today);

  // First day and last day of current month
  const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  // Next 30 days
  const in30 = isoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  // Next 7 days (heatmap)
  const next7: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return isoDate(d);
  });
  const heatmapEnd = next7[6]!;

  // ── Parallel data fetching ────────────────────────────────
  const [
    activeCrewRes,
    eventsThisMonthRes,
    availableTodayRes,
    upcomingEventsRes,
    openSlotsRes,
    heatmapRes,
  ] = await Promise.all([
    // 1. Active crew count
    supabase
      .from("crew")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),

    // 2. Events this month
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("start_datetime", monthStart)
      .lte("start_datetime", monthEnd + "T23:59:59"),

    // 3. Beschikbaar vandaag
    supabase
      .from("availability")
      .select("id", { count: "exact", head: true })
      .eq("date", todayIso)
      .eq("status", "B"),

    // 4. Upcoming events next 30 days
    supabase
      .from("events")
      .select("id, name, venue, start_datetime, crew_needed, status, assignments!inner(count)")
      .in("assignments.status", SECURED_STATUSES)
      .gte("start_datetime", todayIso)
      .lte("start_datetime", in30 + "T23:59:59")
      .in("status", ["draft", "planned", "confirmed"])
      .order("start_datetime", { ascending: true })
      .limit(20),

    // 5. Open slots: upcoming events with status planned/confirmed
    supabase
      .from("events")
      .select("id, crew_needed, assignments(count)")
      .in("assignments.status", SECURED_STATUSES)
      .gte("start_datetime", todayIso)
      .in("status", ["planned", "confirmed"]),

    // 6. Heatmap: availability for next 7 days. Paged — 7 days x all active
    //    crew crosses the 1000-row cap at ~143 crew, and the counts below are
    //    computed from whatever came back.
    fetchAllRows<{ date: string; status: string }>((from, to) =>
      supabase
        .from("availability")
        .select("date, status")
        .gte("date", todayIso)
        .lte("date", heatmapEnd)
        .in("status", ["B", "M", "X"])
        .range(from, to)
    ),
  ]);

  // ── Derived values ────────────────────────────────────────

  const activeCrewCount = activeCrewRes.count ?? 0;
  const eventsThisMonth = eventsThisMonthRes.count ?? 0;
  const availableToday = availableTodayRes.count ?? 0;

  type OpenSlotEvent = { id: string; crew_needed: number; assignments: Array<{ count: number }> };
  type UpcomingEvent = {
    id: string;
    name: string;
    venue: string | null;
    start_datetime: string;
    crew_needed: number;
    status: string;
    assignments: Array<{ count: number }>;
  };
  type HeatmapRow = { date: string; status: string };

  const openSlotsData = (openSlotsRes.data as unknown as OpenSlotEvent[]) ?? [];
  const upcomingEvents: UpcomingEvent[] = (upcomingEventsRes.data as unknown as UpcomingEvent[]) ?? [];
  const heatmapRows = (heatmapRes.data as unknown as HeatmapRow[]) ?? [];

  // Open slots: crew_needed minus the crew actually secured. The embedded
  // count is filtered to SECURED_STATUSES above — counting every assignment
  // row instead would let an event where everyone declined read as fully
  // staffed, which is the one number a planner acts on.
  const openSlots = openSlotsData.reduce((sum, ev) => {
    const secured = ev.assignments?.[0]?.count ?? 0;
    return sum + Math.max(0, ev.crew_needed - secured);
  }, 0);

  // Heatmap aggregation: per day, count B / M / X
  const heatmapData = next7.map((date) => {
    const rows = heatmapRows.filter((r) => r.date === date);
    const B = rows.filter((r) => r.status === "B").length;
    const M = rows.filter((r) => r.status === "M").length;
    const X = rows.filter((r) => r.status === "X").length;
    return { date, B, M, X };
  });
  const maxB = Math.max(...heatmapData.map((d) => d.B), 1);

  // Dutch date for header
  const todayLabel = today.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Dashboard"
        actions={
          <Button size="sm" asChild>
            <Link href="/events/new">
              <Plus />
              Nieuw event
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Date subtitle */}
        <p className="text-sm text-muted-foreground capitalize">{todayLabel}</p>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Users className="size-4" />}
            label="Actieve crew"
            value={activeCrewCount}
            href="/crew"
          />
          <StatCard
            icon={<CalendarDays className="size-4" />}
            label="Events deze maand"
            value={eventsThisMonth}
            href="/events"
          />
          <StatCard
            icon={<CheckCircle2 className="size-4" />}
            label="Beschikbaar vandaag"
            value={availableToday}
          />
          <StatCard
            icon={<AlertCircle className="size-4" />}
            label="Open slots"
            value={openSlots}
            valueClass={openSlots > 0 ? "text-yellow-600 dark:text-yellow-400" : undefined}
          />
        </div>

        {/* ── Upcoming events ── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>Aankomende events</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/events">Alle events</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingEvents.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                Geen events in de komende 30 dagen.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Naam</th>
                      <th className="px-4 py-2 font-medium">Datum</th>
                      <th className="px-4 py-2 font-medium">Locatie</th>
                      <th className="px-4 py-2 font-medium text-right">Crew</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {upcomingEvents.map((ev) => {
                      const confirmed = ev.assignments?.[0]?.count ?? 0;
                      const needed = ev.crew_needed;
                      const crewFull = confirmed >= needed;
                      return (
                        <tr
                          key={ev.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium">
                            <Link
                              href={`/events/${ev.id}`}
                              className="hover:underline"
                            >
                              {ev.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDateTime(ev.start_datetime)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {ev.venue ?? "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-mono tabular-nums",
                              crewFull
                                ? "text-green-600 dark:text-green-400"
                                : "text-yellow-600 dark:text-yellow-400"
                            )}
                          >
                            {confirmed}/{needed}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(ev.status as EventStatus)}>
                              {statusLabel(ev.status)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Availability heatmap ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Beschikbaarheidsheatmap — komende 7 dagen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {heatmapData.map(({ date, B, M, X }) => {
                const d = new Date(date + "T12:00:00"); // avoid tz-shift
                const dayLabel = d.toLocaleDateString("nl-NL", { weekday: "short" });
                const dateLabel = d.toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "numeric",
                });
                const isToday = date === todayIso;
                return (
                  <div key={date} className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "text-xs font-medium capitalize",
                        isToday ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {dayLabel}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        isToday ? "text-primary font-semibold" : "text-muted-foreground"
                      )}
                    >
                      {dateLabel}
                    </span>
                    {/* B = Beschikbaar */}
                    <div
                      className={cn(
                        "w-full rounded-md py-2 text-center text-xs font-semibold transition-colors",
                        heatmapClass(B, maxB)
                      )}
                      title={`Beschikbaar: ${B}`}
                    >
                      {B}
                    </div>
                    {/* M = Misschien */}
                    <div
                      className="w-full rounded-md py-1.5 text-center text-[11px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                      title={`Misschien: ${M}`}
                    >
                      {M}
                    </div>
                    {/* X = Niet beschikbaar */}
                    <div
                      className="w-full rounded-md py-1.5 text-center text-[11px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      title={`Niet beschikbaar: ${X}`}
                    >
                      {X}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-green-500" />
                Beschikbaar (B)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-yellow-300" />
                Misschien (M)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-red-200" />
                Niet beschikbaar (X)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── StatCard sub-component ───────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  href?: string;
  valueClass?: string;
}

function StatCard({ icon, label, value, href, valueClass }: StatCardProps) {
  const inner = (
    <Card className={cn("transition-colors", href && "hover:bg-muted/40")}>
      <CardHeader className="pb-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-bold tabular-nums", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
