import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cn,
  formatDate,
  formatDateTime,
  availabilityCellClass,
  seniorityLabel,
  statusLabel,
  prospectStatusLabel,
  maskIban,
  getDaysInMonth,
  isoDate,
} from "@/lib/utils";
import type { Crew, Availability, AvailabilityStatus } from "@crewops/core";
import { CrewDocuments } from "@/components/crew/CrewDocuments";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { ArrowLeft, Car, IdCard, Mail, MapPin, Phone, CreditCard, Cake, Shirt, CalendarPlus, LifeBuoy } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const DAYS_NL = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function statusVariant(s: string): "success" | "muted" | "warning" | "secondary" {
  if (s === "active") return "success";
  if (s === "inactive") return "muted";
  if (s === "prospect") return "warning";
  return "secondary";
}

function seniorityVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "teamlead") return "default";
  if (s === "senior") return "secondary";
  return "outline";
}

function assignmentStatusVariant(s: string): "success" | "muted" | "warning" | "destructive" | "secondary" {
  if (s === "confirmed" || s === "checked_in") return "success";
  if (s === "declined") return "destructive";
  if (s === "invited") return "warning";
  if (s === "proposed") return "secondary";
  return "muted";
}

function buildAvailGrid(
  availability: Availability[],
  year: number,
  month: number
) {
  const days = getDaysInMonth(year, month);
  const availMap = new Map(availability.map((a) => [a.date, a.status]));

  // Build array of {date, status, dayOfWeek}
  const cells = Array.from({ length: days }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    const dateStr = isoDate(d);
    // getDay(): 0=Sun, 1=Mon ... 6=Sat → convert to Mon-first index
    const dow = (d.getDay() + 6) % 7; // Mon=0, Sun=6
    return { date: dateStr, day: i + 1, dow, status: availMap.get(dateStr) ?? null };
  });

  // Group into weeks (Mon-Sun rows)
  const weeks: typeof cells[] = [];
  let week: typeof cells = [];
  // Pad start
  const firstDow = cells[0]!.dow;
  for (let i = 0; i < firstDow; i++) week.push({ date: "", day: 0, dow: i, status: null });
  for (const cell of cells) {
    week.push(cell);
    if (cell.dow === 6) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ date: "", day: 0, dow: week.length, status: null });
    weeks.push(week);
  }
  return weeks;
}

export default async function CrewDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab = "beschikbaarheid" } = await searchParams;

  const supabase = await createClient();

  const { data: crew, error } = await supabase
    .from("crew")
    .select("*, crew_skills(*, skills(*))")
    .eq("id", id)
    .single();

  if (error || !crew) notFound();

  const canCrew = can(await getMyAdminPerms(), "crew");

  const member = crew as Crew & {
    crew_skills: Array<{ skill_id: string; level: string; certified: boolean; skills: { name: string } | null }>;
  };

  // Current month availability
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [availResult, assignResult] = await Promise.all([
    supabase
      .from("availability")
      .select("id, crew_id, date, status, created_at, updated_at")
      .eq("crew_id", id)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date"),
    supabase
      .from("assignments")
      .select("*, events(*)")
      .eq("crew_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const availability = (availResult.data ?? []) as Availability[];
  const assignments = assignResult.data ?? [];

  const weeks = buildAvailGrid(availability, year, month);

  const monthNl = now.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  const tabs = [
    { key: "beschikbaarheid", label: "Beschikbaarheid" },
    { key: "toewijzingen", label: "Toewijzingen" },
    { key: "documenten", label: "Documenten" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title={`${member.first_name} ${member.last_name}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/crew">
                <ArrowLeft />
                Terug
              </Link>
            </Button>
            {canCrew && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/crew/${id}/edit`}>Bewerk</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Profile header */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">
                {member.first_name} {member.last_name}
              </h2>
              <Badge variant="outline" className="font-mono text-xs">
                {member.crew_code}
              </Badge>
              <Badge variant={statusVariant(member.status)}>
                {statusLabel(member.status)}
              </Badge>
              <Badge variant={seniorityVariant(member.seniority)}>
                {seniorityLabel(member.seniority)}
              </Badge>
            </div>
            {member.notes && (
              <p className="mt-1 text-sm text-muted-foreground">{member.notes}</p>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Contact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {member.phone ? (
                  <a href={`tel:${member.phone}`} className="hover:underline">
                    {member.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {member.email ? (
                  <a href={`mailto:${member.email}`} className="hover:underline truncate">
                    {member.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Locatie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Locatie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  {member.street && <div>{member.street}</div>}
                  <div>
                    {[member.postcode, member.home_city].filter(Boolean).join(" ") || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  {member.address_2 && (
                    <div className="text-xs text-muted-foreground whitespace-pre-line">
                      2e adres: {member.address_2}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vervoer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Vervoer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={member.has_car ? "text-foreground" : "text-muted-foreground"}>
                  {member.has_car ? "Heeft auto" : "Geen auto"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <IdCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={member.has_license ? "text-foreground" : "text-muted-foreground"}>
                  {member.has_license ? "Heeft rijbewijs" : "Geen rijbewijs"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Persoonlijk */}
          {(member.date_of_birth || member.nationality || member.shirt_size || member.start_date) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Persoonlijk</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {member.date_of_birth && <div className="flex items-center gap-2"><Cake className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {formatDate(member.date_of_birth)}</div>}
                {member.nationality && <div className="flex items-center gap-2"><span className="w-3.5 text-center text-xs">🌐</span> {member.nationality}</div>}
                {member.shirt_size && <div className="flex items-center gap-2"><Shirt className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Maat {member.shirt_size}</div>}
                {member.start_date && <div className="flex items-center gap-2"><CalendarPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> Sinds {formatDate(member.start_date)}</div>}
              </CardContent>
            </Card>
          )}

          {/* Noodcontact */}
          {(member.emergency_contact_name || member.emergency_contact_phone) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Noodcontact</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {member.emergency_contact_name && <div className="flex items-center gap-2"><LifeBuoy className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {member.emergency_contact_name}</div>}
                {member.emergency_contact_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><a href={`tel:${member.emergency_contact_phone}`} className="hover:underline">{member.emergency_contact_phone}</a></div>}
              </CardContent>
            </Card>
          )}

          {/* Financieel & rijbewijs */}
          {(member.iban || member.drivers_license_number) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Financieel & rijbewijs</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {member.iban && <div className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-mono">{maskIban(member.iban)}</span><span className="text-[10px] text-muted-foreground">gemaskeerd</span></div>}
                {member.drivers_license_number && <div className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> {member.drivers_license_number}</div>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Prospect info */}
        {member.status === "prospect" && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Prospect</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Status</p>{member.prospect_status ? prospectStatusLabel(member.prospect_status) : "—"}</div>
              <div><p className="text-xs text-muted-foreground">Bron</p>{member.prospect_source ?? "—"}</div>
              <div><p className="text-xs text-muted-foreground">Aangemeld</p>{member.prospect_applied_on ? formatDate(member.prospect_applied_on) : "—"}</div>
              <div><p className="text-xs text-muted-foreground">Volgende actie</p>{member.prospect_next_action_on ? formatDate(member.prospect_next_action_on) : "—"}</div>
              {member.prospect_notes && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-muted-foreground">Notities</p>{member.prospect_notes}</div>}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div>
          <div className="flex border-b mb-4">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={`/crew/${id}?tab=${t.key}`}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {tab === "beschikbaarheid" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize">{monthNl}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Day header */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DAYS_NL.map((d) => (
                    <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Weeks */}
                <div className="space-y-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {week.map((cell, ci) => (
                        <div key={ci} className="flex flex-col items-center gap-0.5">
                          {cell.day > 0 ? (
                            <>
                              <span className="text-[10px] text-muted-foreground">{cell.day}</span>
                              <div
                                className={availabilityCellClass(
                                  cell.status as AvailabilityStatus | null
                                )}
                                title={cell.status ?? "Onbekend"}
                              >
                                {cell.status ?? ""}
                              </div>
                            </>
                          ) : (
                            <div className="w-7 h-7" />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  {(["B", "M", "X", "W", "V"] as AvailabilityStatus[]).map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={availabilityCellClass(s)} style={{ cursor: "default" }}>{s}</div>
                      <span className="text-xs text-muted-foreground">
                        {s === "B" ? "Beschikbaar" : s === "M" ? "Misschien" : s === "X" ? "Niet beschikbaar" : s === "W" ? "Status W" : "Status V"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "toewijzingen" && (
            <Card>
              <CardContent className="p-0">
                {assignments.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Geen toewijzingen gevonden.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground text-left">
                        <th className="py-2 px-4 font-medium">Evenement</th>
                        <th className="py-2 px-4 font-medium">Datum</th>
                        <th className="py-2 px-4 font-medium">Rol</th>
                        <th className="py-2 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {assignments.map((a: Record<string, unknown>) => {
                        const event = a.events as Record<string, unknown> | null;
                        return (
                          <tr key={a.id as string} className="hover:bg-secondary/40">
                            <td className="py-2 px-4 font-medium">
                              {event ? (
                                <Link href={`/events/${event.id as string}`} className="hover:underline">
                                  {event.name as string}
                                </Link>
                              ) : "—"}
                            </td>
                            <td className="py-2 px-4 text-muted-foreground text-xs">
                              {event?.start_datetime
                                ? formatDate(event.start_datetime as string)
                                : "—"}
                            </td>
                            <td className="py-2 px-4 text-muted-foreground">
                              {(a.role as string | null) ?? "—"}
                            </td>
                            <td className="py-2 px-4">
                              <Badge variant={assignmentStatusVariant(a.status as string)}>
                                {statusLabel(a.status as string)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "documenten" && (
            <Card>
              <CardContent className="pt-6">
                <CrewDocuments crewId={id} readOnly />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
