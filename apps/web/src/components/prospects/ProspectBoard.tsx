"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, cn } from "@/lib/utils";
import { HireButton } from "@/components/onboarding/OnboardingButtons";
import { moveProspect, type PipelineStage } from "@/app/(dashboard)/prospects/actions";
import { CalendarClock, Phone, Mail, ExternalLink } from "lucide-react";

const COLUMNS: { key: PipelineStage; label: string; accent: string }[] = [
  { key: "new", label: "Nieuw", accent: "border-t-slate-400" },
  { key: "contacted", label: "Gecontacteerd", accent: "border-t-blue-400" },
  { key: "intake_planned", label: "Intake gepland", accent: "border-t-amber-400" },
  { key: "intake_done", label: "Intake gedaan", accent: "border-t-violet-400" },
  { key: "hired", label: "Aangenomen", accent: "border-t-green-500" },
  { key: "rejected", label: "Afgewezen", accent: "border-t-red-400" },
];

export type BoardProspect = {
  id: string;
  crew_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  prospect_source: string | null;
  prospect_next_action_on: string | null;
  prospect_status: PipelineStage;
};

function calcomLink(base: string | undefined, p: BoardProspect): string | null {
  if (!base) return null;
  const params = new URLSearchParams();
  params.set("name", `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
  if (p.email) params.set("email", p.email);
  return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
}

export function ProspectBoard({
  prospects,
  canCrew,
  calcomBase,
  today,
}: {
  prospects: BoardProspect[];
  canCrew: boolean;
  calcomBase: string | undefined;
  today: string;
}) {
  const [items, setItems] = useState(prospects);
  const [synced, setSynced] = useState(prospects);
  const [over, setOver] = useState<PipelineStage | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Re-sync when the server sends fresh rows (router.refresh, revalidate).
  if (synced !== prospects) {
    setSynced(prospects);
    setItems(prospects);
  }

  function move(id: string, stage: PipelineStage) {
    if (!canCrew) return;
    const p = items.find((x) => x.id === id);
    if (!p || p.prospect_status === stage) return;
    const rollback = items;
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();

    // Hired leaves the prospect board entirely: the action also flips status to 'active'.
    setItems(
      stage === "hired"
        ? items.filter((x) => x.id !== id)
        : items.map((x) => (x.id === id ? { ...x, prospect_status: stage } : x))
    );

    start(async () => {
      const res = await moveProspect(id, stage);
      if (!res.ok) {
        setItems(rollback);
        toast.error("Verplaatsen mislukt", res.error);
        return;
      }
      if (stage === "hired") {
        toast.success(`${name} is aangenomen`, "Nu actief crewlid — verder afhandelen bij Onboarding.");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 min-w-max">
      {COLUMNS.map((col) => {
        const cards = items.filter((p) => p.prospect_status === col.key);
        return (
          <div key={col.key} className="w-64 shrink-0">
            <div className={cn("flex items-center justify-between rounded-t-md border-t-2 bg-card px-2 py-1.5", col.accent)}>
              <span className="text-xs font-semibold">{col.label}</span>
              <span className="text-xs text-muted-foreground">{cards.length}</span>
            </div>
            <div
              data-stage={col.key}
              onDragOver={(e) => {
                if (!canCrew) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, col.key);
              }}
              className={cn(
                "space-y-2 rounded-b-md bg-muted/30 p-2 min-h-[120px] transition-colors",
                over === col.key && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
              )}
            >
              {cards.map((p) => {
                const link = calcomLink(calcomBase, p);
                const overdue = p.prospect_next_action_on && p.prospect_next_action_on < today;
                return (
                  <Card
                    key={p.id}
                    draggable={canCrew}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", p.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn("shadow-sm", canCrew && "cursor-grab active:cursor-grabbing", pending && "opacity-70")}
                  >
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
                      {/* Touch and keyboard path to the same action — HTML5 drag does neither. */}
                      <select
                        aria-label={`Fase van ${p.first_name} ${p.last_name}`}
                        value={p.prospect_status}
                        disabled={!canCrew || pending}
                        onChange={(e) => move(p.id, e.target.value as PipelineStage)}
                        className="h-7 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-50"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
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
              {cards.length === 0 && <p className="text-xs text-muted-foreground/60 text-center py-4">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
