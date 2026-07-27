import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FinishOnboardingButton } from "@/components/onboarding/OnboardingButtons";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { cn } from "@/lib/utils";
import type { Crew } from "@crewops/core";
import { Check, X, Pencil } from "lucide-react";

export const metadata = { title: "Onboarding" };

type ChecklistItem = { label: string; done: boolean };

function checklist(c: Crew, docTypes: Set<string>): ChecklistItem[] {
  return [
    { label: "Adres compleet", done: !!(c.street && c.postcode && c.home_city) },
    { label: "Noodcontact", done: !!(c.emergency_contact_name && c.emergency_contact_phone) },
    { label: "IBAN", done: !!c.iban },
    { label: "ID-bewijs", done: docTypes.has("id_document") },
    { label: "VOG", done: docTypes.has("vog") },
    { label: "Contract", done: docTypes.has("contract") },
  ];
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const canCrew = can(await getMyAdminPerms(), "crew");

  // Onboarding queue = active crew still flagged as freshly hired.
  const { data: crewData } = await supabase
    .from("crew")
    .select("*")
    .eq("status", "active")
    .eq("prospect_status", "hired")
    .order("start_date", { ascending: false, nullsFirst: false });
  const crew = (crewData ?? []) as Crew[];

  const ids = crew.map((c) => c.id);
  const docsByCrew = new Map<string, Set<string>>();
  if (ids.length) {
    const { data: docs } = await supabase
      .from("crew_documents")
      .select("crew_id, doc_type")
      .in("crew_id", ids);
    for (const d of (docs ?? []) as { crew_id: string; doc_type: string }[]) {
      if (!docsByCrew.has(d.crew_id)) docsByCrew.set(d.crew_id, new Set());
      docsByCrew.get(d.crew_id)!.add(d.doc_type);
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title={`Onboarding${crew.length > 0 ? ` (${crew.length})` : ""}`} />

      <div className="flex-1 overflow-auto p-4">
        {crew.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            Geen crew in onboarding. Neem een prospect aan via de Prospects-pagina om te starten.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 max-w-4xl">
            {crew.map((c) => {
              const items = checklist(c, docsByCrew.get(c.id) ?? new Set());
              const done = items.filter((i) => i.done).length;
              const complete = done === items.length;
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/crew/${c.id}`} className="font-semibold hover:underline">
                          {c.first_name} {c.last_name}
                        </Link>
                        <p className="font-mono text-[10px] text-muted-foreground">{c.crew_code}</p>
                      </div>
                      <span className={cn("text-xs font-medium", complete ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                        {done}/{items.length}
                      </span>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", complete ? "bg-green-500" : "bg-primary")} style={{ width: `${(done / items.length) * 100}%` }} />
                    </div>

                    <ul className="space-y-1">
                      {items.map((i) => (
                        <li key={i.label} className="flex items-center gap-2 text-sm">
                          {i.done ? (
                            <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          )}
                          <span className={i.done ? "" : "text-muted-foreground"}>{i.label}</span>
                        </li>
                      ))}
                    </ul>

                    {canCrew && (
                      <div className="flex gap-2 pt-1">
                        <Button asChild variant="outline" size="sm" className="flex-1">
                          <Link href={`/crew/${c.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Aanvullen</Link>
                        </Button>
                        <FinishOnboardingButton crewId={c.id} disabled={!complete} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
