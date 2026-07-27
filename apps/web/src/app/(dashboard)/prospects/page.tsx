import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, isoDate, cn } from "@/lib/utils";
import type { Crew } from "@crewops/core";
import { HireButton } from "@/components/onboarding/OnboardingButtons";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { CalendarClock, Phone, Mail, ExternalLink, UserPlus } from "lucide-react";

export const metadata = { title: "Prospects" };

type PipelineStatus = "new" | "contacted" | "intake_planned" | "intake_done" | "hired" | "rejected";

const COLUMNS: { key: PipelineStatus; label: string; accent: string }[] = [
  { key: "new", label: "Nieuw", accent: "border-t-slate-400" },
  { key: "contacted", label: "Gecontacteerd", accent: "border-t-blue-400" },
  { key: "intake_planned", label: "Intake gepland", accent: "border-t-amber-400" },
  { key: "intake_done", label: "Intake gedaan", accent: "border-t-violet-400" },
  { key: "hired", label: "Aangenomen", accent: "border-t-green-500" },
  { key: "rejected", label: "Afgewezen", accent: "border-t-red-400" },
];

function calcomLink(base: string | undefined, c: Crew): string | null {
  if (!base) return null;
  const params = new URLSearchParams();
  params.set("name", `${c.first_name} ${c.last_name}`.trim());
  if (c.email) params.set("email", c.email);
  return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
}

export default async function ProspectsPage() {
  const supabase = await createClient();
  const canCrew = can(await getMyAdminPerms(), "crew");
  const calcomBase = process.env.NEXT_PUBLIC_CALCOM_URL;

  const { data } = await supabase
    .from("crew")
    .select("*")
    .eq("status", "prospect")
    .order("prospect_applied_on", { ascending: false, nullsFirst: false });

  const prospects = (data ?? []) as Crew[];
  const today = isoDate(new Date());

  const byStatus = new Map<PipelineStatus, Crew[]>();
  for (const col of COLUMNS) byStatus.set(col.key, []);
  for (const p of prospects) {
    const key = (p.prospect_status ?? "new") as PipelineStatus;
    (byStatus.get(key) ?? byStatus.get("new")!).push(p);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title={`Prospects${prospects.length > 0 ? ` (${prospects.length})` : ""}`}
        actions={
          canCrew ? (
            <Button asChild size="sm">
              <Link href="/crew/new"><UserPlus /> Nieuwe prospect</Link>
            </Button>
          ) : undefined
        }
      />

      {!calcomBase && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
          Tip: stel <code className="bg-muted px-1 rounded">NEXT_PUBLIC_CALCOM_URL</code> in (root <code className="bg-muted px-1 rounded">.env.local</code>) om intakegesprekken via Cal.com in te plannen.
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {prospects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Geen prospects. Voeg er een toe of zet een crewlid op status “Prospect”.</p>
        ) : (
          <div className="flex gap-3 min-w-max">
            {COLUMNS.map((col) => {
              const items = byStatus.get(col.key) ?? [];
              return (
                <div key={col.key} className="w-64 shrink-0">
                  <div className={cn("flex items-center justify-between rounded-t-md border-t-2 bg-card px-2 py-1.5", col.accent)}>
                    <span className="text-xs font-semibold">{col.label}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="space-y-2 rounded-b-md bg-muted/30 p-2 min-h-[120px]">
                    {items.map((p) => {
                      const link = calcomLink(calcomBase, p);
                      const overdue = p.prospect_next_action_on && p.prospect_next_action_on < today;
                      return (
                        <Card key={p.id} className="shadow-sm">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <Link href={`/crew/${p.id}`} className="font-medium text-sm hover:underline leading-tight">
                                {p.first_name} {p.last_name}
                              </Link>
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.crew_code}</span>
                            </div>
                            {p.prospect_source && <p className="text-xs text-muted-foreground">Bron: {p.prospect_source}</p>}
                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                              {p.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{p.phone}</span>}
                              {p.email && <span className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" />{p.email}</span>}
                              {p.prospect_next_action_on && (
                                <span className={cn("flex items-center gap-1.5", overdue && "text-destructive font-medium")}>
                                  <CalendarClock className="h-3 w-3" /> {formatDate(p.prospect_next_action_on)}{overdue && " (te laat)"}
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5 pt-1">
                              <div className="flex gap-1.5">
                                {canCrew && (
                                  <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs flex-1">
                                    <Link href={`/crew/${p.id}/edit`}>Bewerk</Link>
                                  </Button>
                                )}
                                {link ? (
                                  <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs flex-1">
                                    <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /> Intake</a>
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="secondary" className="h-7 px-2 text-xs flex-1" disabled title="Stel NEXT_PUBLIC_CALCOM_URL in">
                                    Intake
                                  </Button>
                                )}
                              </div>
                              {canCrew && <HireButton crewId={p.id} className="h-7 w-full text-xs" />}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {items.length === 0 && <p className="text-xs text-muted-foreground/60 text-center py-4">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
