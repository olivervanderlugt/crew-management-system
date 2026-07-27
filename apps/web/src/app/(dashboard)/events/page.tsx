import Link from "next/link";
import { Plus } from "lucide-react";
import type { EventStatus } from "@crewops/core";

import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, statusLabel } from "@/lib/utils";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";

// ─── Helpers ──────────────────────────────────────────────────

function eventStatusVariant(
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
    case "cancelled":
      return "outline";
  }
}

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string; when?: string; year?: string; month?: string }>;
}

type EventRow = {
  id: string;
  name: string;
  client: string | null;
  venue: string | null;
  start_datetime: string;
  end_datetime: string;
  crew_needed: number;
  status: EventStatus;
  assignments: Array<{ count: number }>;
};

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "", label: "Alles" },
  { value: "draft", label: "Concept" },
  { value: "planned", label: "Gepland" },
  { value: "confirmed", label: "Bevestigd" },
  { value: "done", label: "Afgerond" },
];

// Period ("wanneer") tabs. Default is "upcoming" so the list opens on what
// still needs planning; "past" and "all" let you dig up finished events.
const WHEN_TABS: Array<{ value: string; label: string }> = [
  { value: "upcoming", label: "Komend" },
  { value: "past", label: "Verleden" },
  { value: "all", label: "Alles" },
];

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

export default async function EventsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const q = params.q ?? "";
  // A specific year (optionally month) overrides the upcoming/past default.
  const year = params.year ? parseInt(params.year, 10) : undefined;
  const month = params.month ? parseInt(params.month, 10) : undefined; // 1–12
  const periodActive = Boolean(year);
  const when = periodActive ? "" : (params.when ?? "upcoming");

  const supabase = await createClient();
  const canEvents = can(await getMyAdminPerms(), "events");

  const now = new Date();
  // Newest-first feels right for browsing the past/specific periods; soonest
  // -first for what's still coming up.
  const ascending = when === "upcoming";

  let query = supabase
    .from("events")
    .select("id, name, client, venue, start_datetime, end_datetime, crew_needed, status, assignments(count)")
    .order("start_datetime", { ascending });

  if (year) {
    // Year / month window.
    const from = new Date(year, month ? month - 1 : 0, 1);
    const to = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    query = query.gte("start_datetime", from.toISOString()).lt("start_datetime", to.toISOString());
  } else if (when === "upcoming") {
    query = query.gte("start_datetime", now.toISOString());
  } else if (when === "past") {
    query = query.lt("start_datetime", now.toISOString());
  }

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,client.ilike.%${q}%,venue.ilike.%${q}%`);
  }

  const { data: events } = await query;
  const rows = (events ?? []) as EventRow[];

  // Year options: a couple back through next year (most planning lives here).
  const thisYear = now.getFullYear();
  const yearOptions: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - 3; y--) yearOptions.push(y);

  // Build an /events href preserving the current filters with overrides applied.
  function hrefWith(overrides: Record<string, string | undefined>): string {
    const base: Record<string, string | undefined> = {
      status: statusFilter || undefined,
      q: q || undefined,
      when: periodActive ? undefined : (params.when || undefined),
      year: year ? String(year) : undefined,
      month: month ? String(month) : undefined,
    };
    const merged = { ...base, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `/events${qs.toString() ? `?${qs.toString()}` : ""}`;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title="Events"
        actions={
          canEvents ? (
            <Button asChild size="sm">
              <Link href="/events/new">
                <Plus />
                Nieuw event
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Search + status filter tabs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0 flex-wrap">
        <form method="get" action="/events" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {!periodActive && params.when && <input type="hidden" name="when" value={params.when} />}
          {year && <input type="hidden" name="year" value={String(year)} />}
          {month && <input type="hidden" name="month" value={String(month)} />}
          <Input
            name="q"
            defaultValue={q}
            placeholder="Zoek op naam, klant of locatie…"
            className="h-8 w-64 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8">Zoek</Button>
        </form>
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={hrefWith({ status: tab.value || undefined })}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} event{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Period filter: upcoming / past / all + year-month picker */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Periode</span>
        <div className="flex items-center gap-1">
          {WHEN_TABS.map((tab) => {
            const active = !periodActive && when === tab.value;
            return (
              <Link
                key={tab.value}
                href={hrefWith({ when: tab.value, year: undefined, month: undefined })}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Year / month — a specific period overrides the tabs above */}
        <form method="get" action="/events" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {q && <input type="hidden" name="q" value={q} />}
          <select
            name="year"
            defaultValue={year ? String(year) : ""}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Jaar…</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            name="month"
            defaultValue={month ? String(month) : ""}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Hele jaar</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" className="h-8">Toon</Button>
        </form>

        {periodActive && (
          <Link
            href={hrefWith({ when: "upcoming", year: undefined, month: undefined })}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Wis periode
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 px-3 font-medium">Naam</th>
              <th className="py-2 px-3 font-medium">Klant</th>
              <th className="py-2 px-3 font-medium">Locatie</th>
              <th className="py-2 px-3 font-medium whitespace-nowrap">Datum / Tijd</th>
              <th className="py-2 px-3 font-medium w-20 text-center">Crew</th>
              <th className="py-2 px-3 font-medium w-28">Status</th>
              <th className="py-2 px-3 font-medium w-16 text-right">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                  Geen events gevonden.
                </td>
              </tr>
            )}
            {rows.map((ev) => {
              const assignedCount = ev.assignments?.[0]?.count ?? 0;
              const crewFull = assignedCount >= ev.crew_needed;
              return (
                <tr
                  key={ev.id}
                  className="hover:bg-secondary/40 transition-colors group"
                >
                  <td className="py-2 px-3">
                    <Link
                      href={`/events/${ev.id}`}
                      className="font-medium hover:underline"
                    >
                      {ev.name}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {ev.client ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {ev.venue ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                    {formatDateTime(ev.start_datetime)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums font-semibold",
                        crewFull
                          ? "text-green-600 dark:text-green-400"
                          : "text-yellow-600 dark:text-yellow-400"
                      )}
                    >
                      {assignedCount}/{ev.crew_needed}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant={eventStatusVariant(ev.status)}>
                      {statusLabel(ev.status)}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100"
                    >
                      <Link href={`/events/${ev.id}`}>Open</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
