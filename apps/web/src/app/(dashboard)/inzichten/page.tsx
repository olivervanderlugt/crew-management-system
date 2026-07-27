import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Car, CalendarDays, TrendingDown, Percent, Clock, Users, ShieldAlert } from "lucide-react";
import {
  fillRate,
  declineRate,
  bucketByMonth,
  recentMonthKeys,
  countBy,
  topN,
  isSecuredStatus,
  documentExpiryStatus,
  parseWarnDays,
  type AssignmentStatus,
  type DocExpiryStatus,
} from "@crewops/core";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayrollExportButton } from "@/components/payroll/PayrollExportButton";
import { cn, formatDate, crewDocumentTypeLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Inzichten" };

const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";

const SENIORITY_LABELS: Record<string, string> = {
  teamlead: "Teamleider",
  senior: "Senior",
  sitecrew: "Sitecrew",
};

const MONTH_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function monthKeyLabel(key: string): string {
  const [, m] = key.split("-");
  return MONTH_SHORT[parseInt(m ?? "1", 10) - 1] ?? key;
}

type EventRow = {
  id: string;
  start_datetime: string;
  status: string;
  crew_needed: number;
  assignments: {
    status: AssignmentStatus;
    crew_id: string;
    hours_worked: number | null;
    crew: { first_name: string; last_name: string } | null;
  }[];
};

export default async function InzichtenPage() {
  const me = await getMyAdminPerms();
  if (!me.isAdmin) notFound();

  const supabase = await createClient();
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const iso = (d: Date) => d.toISOString();
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  const warnDays = parseWarnDays(process.env.DOCUMENT_EXPIRY_WARN_DAYS);
  const docHorizon = new Date(now.getTime() + warnDays * 86_400_000);

  const [eventsRes, crewRes, availRes, docsRes] = await Promise.all([
    // Events over the last 6 months with their assignment outcomes + hours.
    supabase
      .from("events")
      .select("id, start_datetime, status, crew_needed, assignments(status, crew_id, hours_worked, crew(first_name, last_name))")
      .gte("start_datetime", iso(sixMonthsAgo))
      .lte("start_datetime", iso(now))
      .order("start_datetime", { ascending: true }),
    // Active crew composition.
    supabase.from("crew").select("home_city, has_car, seniority").eq("status", "active"),
    // Availability responses for next month (coverage).
    supabase
      .from("availability")
      .select("crew_id, status")
      .gte("date", isoDay(nextMonthStart))
      .lte("date", isoDay(nextMonthEnd)),
    // Certificates that are expired or expiring within the warn window.
    supabase
      .from("crew_documents")
      .select("id, doc_type, title, expires_on, crew(first_name, last_name, status)")
      .not("expires_on", "is", null)
      .lte("expires_on", isoDay(docHorizon))
      .order("expires_on", { ascending: true }),
  ]);

  const events = (eventsRes.data as unknown as EventRow[]) ?? [];
  const crew = (crewRes.data as unknown as { home_city: string | null; has_car: boolean; seniority: string }[]) ?? [];
  const avail = (availRes.data as unknown as { crew_id: string; status: string }[]) ?? [];

  // ── Certificates needing attention (expired / expiring soon, active crew) ──
  type DocRow = {
    id: string;
    doc_type: string;
    title: string;
    expires_on: string | null;
    crew: { first_name: string; last_name: string; status: string } | null;
  };
  const expiringDocs = ((docsRes.data as unknown as DocRow[]) ?? [])
    .map((d) => ({ ...d, expiry: documentExpiryStatus(d.expires_on, now, warnDays) }))
    .filter(
      (d): d is DocRow & { expiry: DocExpiryStatus } =>
        d.crew?.status === "active" && (d.expiry === "expired" || d.expiry === "expiring_soon")
    );
  const expiredCount = expiringDocs.filter((d) => d.expiry === "expired").length;

  // ── KPIs (last 90 days) ──
  const recentEvents = events.filter((e) => new Date(e.start_datetime) >= ninetyDaysAgo);
  const securedOf = (e: EventRow) => e.assignments.filter((a) => isSecuredStatus(a.status)).length;
  const kpiFill = fillRate(recentEvents.map((e) => ({ crew_needed: e.crew_needed, secured: securedOf(e) })));
  const kpiDecline = declineRate(recentEvents.flatMap((e) => e.assignments.map((a) => a.status)));
  const avgCrew =
    recentEvents.length > 0
      ? Math.round((recentEvents.reduce((s, e) => s + e.crew_needed, 0) / recentEvents.length) * 10) / 10
      : 0;
  const carShare = crew.length > 0 ? Math.round((crew.filter((c) => c.has_car).length / crew.length) * 100) : 0;

  // ── Monthly trends (6 months) ──
  const months = recentMonthKeys(now, 6);
  const byMonth = bucketByMonth(events, (e) => e.start_datetime);
  const monthly = months.map((key) => {
    const evs = byMonth.get(key) ?? [];
    const fill = fillRate(evs.map((e) => ({ crew_needed: e.crew_needed, secured: securedOf(e) })));
    const hours = evs.reduce(
      (s, e) => s + e.assignments.reduce((hs, a) => hs + (a.hours_worked ?? 0), 0),
      0
    );
    return { key, label: monthKeyLabel(key), events: evs.length, fill, hours: Math.round(hours) };
  });
  const maxEvents = Math.max(...monthly.map((m) => m.events), 1);
  const maxHours = Math.max(...monthly.map((m) => m.hours), 1);

  // ── Top crew (most secured shifts, 6 months) ──
  const crewName = new Map<string, string>();
  const crewSecured = new Map<string, number>();
  for (const e of events) {
    for (const a of e.assignments) {
      if (!isSecuredStatus(a.status)) continue;
      crewSecured.set(a.crew_id, (crewSecured.get(a.crew_id) ?? 0) + 1);
      if (a.crew) crewName.set(a.crew_id, `${a.crew.first_name} ${a.crew.last_name}`);
    }
  }
  const topCrew = topN(crewSecured, 8);
  const maxTopCrew = topCrew[0]?.count ?? 1;

  // ── Crew composition ──
  const seniority = countBy(crew, (c) => c.seniority);
  const topCities = topN(countBy(crew, (c) => c.home_city), 5);

  // ── Availability coverage (next month) ──
  const respondedCrew = new Set(avail.map((a) => a.crew_id)).size;
  const coverage = crew.length > 0 ? Math.round((respondedCrew / crew.length) * 100) : 0;
  const availB = avail.filter((a) => a.status === "B").length;
  const availM = avail.filter((a) => a.status === "M").length;
  const availX = avail.filter((a) => a.status === "X").length;
  const nextMonthLabel = nextMonthStart.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Inzichten" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          Operationele cijfers over de laatste 6 maanden. Bezettingsgraad en afzeggingsratio gaan over de
          laatste 90 dagen.
        </p>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi icon={<Percent className="size-4" />} label="Bezettingsgraad" value={`${Math.round(kpiFill * 100)}%`}
            hint="bevestigd vs. nodig" valueClass={kpiFill >= 0.9 ? "text-green-600 dark:text-green-400" : kpiFill >= 0.7 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"} />
          <Kpi icon={<TrendingDown className="size-4" />} label="Afzeggingsratio" value={`${Math.round(kpiDecline * 100)}%`}
            hint="afgezegd vs. beantwoord" valueClass={kpiDecline <= 0.1 ? "text-green-600 dark:text-green-400" : kpiDecline <= 0.25 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"} />
          <Kpi icon={<Users className="size-4" />} label="Gem. crew / event" value={`${avgCrew}`} hint="laatste 90 dagen" />
          <Kpi icon={<Car className="size-4" />} label="Crew met auto" value={`${carShare}%`} hint="van actieve crew" />
        </div>

        {/* Certificates needing attention */}
        <Card className={cn(expiredCount > 0 && "border-red-500/40")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className={cn("size-4", expiringDocs.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
              Certificaten die aandacht nodig hebben
              {expiringDocs.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {expiredCount > 0 && `${expiredCount} verlopen · `}
                  {expiringDocs.length} totaal · venster {warnDays} dgn
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiringDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Geen verlopen of bijna-verlopen certificaten bij actieve crew. 👍
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {expiringDocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                        d.expiry === "expired"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      )}
                    >
                      {d.expiry === "expired" ? "Verlopen" : "Verloopt bijna"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">
                        {d.crew ? `${d.crew.first_name} ${d.crew.last_name}` : "Onbekend"}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}— {crewDocumentTypeLabel(d.doc_type)}: {d.title}
                      </span>
                    </span>
                    {d.expires_on && (
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs tabular-nums",
                          d.expiry === "expired" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                        )}
                      >
                        {formatDate(d.expires_on)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Monthly trends */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" /> Events per maand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {monthly.map((m) => (
                <BarRow key={m.key} label={m.label} value={m.events} max={maxEvents} display={`${m.events}`} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><Percent className="size-4" /> Bezettingsgraad per maand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {monthly.map((m) => (
                <BarRow key={m.key} label={m.label} value={Math.round(m.fill * 100)} max={100}
                  display={`${Math.round(m.fill * 100)}%`} tone="green" />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Hours (only when time-tracking is live) */}
        {TIME_TRACKING && (
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2"><Clock className="size-4" /> Gewerkte uren per maand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {monthly.map((m) => (
                  <BarRow key={m.key} label={m.label} value={m.hours} max={maxHours} display={`${m.hours} u`} tone="indigo" />
                ))}
              </div>
              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Payroll-export</p>
                <PayrollExportButton />
                <p className="mt-2 text-xs text-muted-foreground">
                  Exporteert alleen <span className="font-medium">goedgekeurde</span> uren als CSV (puntkomma-gescheiden, klaar voor Nmbrs/Loket/AFAS of Excel).
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top crew */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Actiefste crew (6 mnd)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topCrew.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen bevestigde shifts.</p>
              ) : (
                topCrew.map((c) => (
                  <BarRow key={c.key} label={crewName.get(c.key) ?? "Onbekend"} value={c.count} max={maxTopCrew}
                    display={`${c.count}`} tone="blue" />
                ))
              )}
            </CardContent>
          </Card>

          {/* Availability coverage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Beschikbaarheidsdekking — {nextMonthLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold tabular-nums">{coverage}%</span>
                  <span className="text-xs text-muted-foreground">{respondedCrew}/{crew.length} crew reageerde</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full", coverage >= 75 ? "bg-green-500" : coverage >= 50 ? "bg-yellow-500" : "bg-red-500")}
                    style={{ width: `${coverage}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Tally label="Beschikbaar" value={availB} cls="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" />
                <Tally label="Misschien" value={availM} cls="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" />
                <Tally label="Niet" value={availX} cls="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Crew composition */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Crew naar niveau</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {["teamlead", "senior", "sitecrew"].map((s) => (
                <BarRow key={s} label={SENIORITY_LABELS[s] ?? s} value={seniority.get(s) ?? 0}
                  max={Math.max(...[...seniority.values()], 1)} display={`${seniority.get(s) ?? 0}`} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle>Crew naar woonplaats (top 5)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {topCities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen woonplaatsgegevens.</p>
              ) : (
                topCities.map((c) => (
                  <BarRow key={c.key} label={c.key} value={c.count} max={topCities[0]?.count ?? 1} display={`${c.count}`} tone="blue" />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function Kpi({ icon, label, value, hint, valueClass }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-bold tabular-nums", valueClass)}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const TONES: Record<string, string> = {
  primary: "bg-primary",
  green: "bg-green-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
};

function BarRow({ label, value, max, display, tone = "primary" }: {
  label: string; value: number; max: number; display: string; tone?: keyof typeof TONES | string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 truncate text-muted-foreground" title={label}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", TONES[tone] ?? "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-mono tabular-nums text-xs">{display}</span>
    </div>
  );
}

function Tally({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={cn("rounded-md py-2", cls)}>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] mt-1">{label}</p>
    </div>
  );
}
