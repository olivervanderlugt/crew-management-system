"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Crew } from "@crewops/core";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { seniorityLabel, statusLabel, cn } from "@/lib/utils";
import {
  ArrowUp, ArrowDown, ShieldCheck, ShieldAlert, ShieldX, Loader2, Download, X,
} from "lucide-react";

type SortField = "crew_code" | "first_name" | "last_name" | "home_city" | "seniority" | "status";
type VogState = "valid" | "expired";

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

const STATUS_CHOICES = [
  { value: "active", label: "Actief" },
  { value: "inactive", label: "Inactief" },
  { value: "prospect", label: "Prospect" },
];

function toCsv(rows: Crew[]): string {
  const cols = ["crew_code", "first_name", "last_name", "phone", "email", "home_city", "postcode", "seniority", "status"] as const;
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(";");
  const body = rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(";"));
  return [header, ...body].join("\r\n");
}

export function CrewTable({
  rows,
  vog,
  canCrew,
  sort,
  dir,
  buildSortUrl,
}: {
  rows: Crew[];
  vog: Record<string, VogState>;
  canCrew: boolean;
  sort: SortField;
  dir: "asc" | "desc";
  // Server builds sort links (keeps current filters) — pass field+dir, get href.
  buildSortUrl: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  async function bulkStatus(status: string) {
    if (!canCrew || selected.size === 0) return;
    setBusy(true);
    try {
      const ids = [...selected];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (createClient().from("crew") as any).update({ status }).in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} crewleden → ${statusLabel(status)}`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error("Bijwerken mislukt", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const data = selectedRows.length ? selectedRows : rows;
    const blob = new Blob(["﻿" + toCsv(data)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crew-export-${data.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${data.length} rijen geëxporteerd`);
  }

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    const active = sort === field;
    return (
      <th className={cn("py-2 px-3 font-medium", className)}>
        <Link href={buildSortUrl[field] ?? "#"} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </Link>
      </th>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label="Selecteer alle zichtbare crew"
                  className="h-3.5 w-3.5 accent-primary"
                />
              </th>
              <SortHeader field="crew_code" label="Crew ID" className="w-28" />
              <SortHeader field="last_name" label="Naam" />
              <th className="py-2 px-3 font-medium">Telefoon</th>
              <SortHeader field="home_city" label="Woonplaats" />
              <th className="py-2 px-3 font-medium w-16 text-center">Vervoer</th>
              <th className="py-2 px-3 font-medium w-16 text-center">VOG</th>
              <SortHeader field="seniority" label="Functie" className="w-28" />
              <SortHeader field="status" label="Status" className="w-24" />
              <th className="py-2 px-3 font-medium w-16 text-right">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">Geen crewleden gevonden.</td></tr>
            )}
            {rows.map((member) => {
              const vogState = vog[member.id];
              const isSel = selected.has(member.id);
              return (
                <tr key={member.id} className={cn("hover:bg-secondary/40 transition-colors group", isSel && "bg-primary/5")}>
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(member.id)}
                      aria-label={`Selecteer ${member.first_name} ${member.last_name}`}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                  </td>
                  <td className="py-2 px-3"><span className="font-mono text-xs text-muted-foreground">{member.crew_code}</span></td>
                  <td className="py-2 px-3">
                    <Link href={`/crew/${member.id}`} className="font-medium hover:underline">
                      {member.first_name} {member.last_name}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{member.phone ?? "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{member.home_city ?? "—"}</td>
                  <td className="py-2 px-3 text-center"><span className="text-xs text-muted-foreground">{member.has_car ? "🚗" : member.has_license ? "🪪" : "—"}</span></td>
                  <td className="py-2 px-3 text-center">
                    {vogState === "valid" ? (
                      <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 inline" aria-label="VOG geldig" />
                    ) : vogState === "expired" ? (
                      <ShieldAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-400 inline" aria-label="VOG verlopen" />
                    ) : (
                      <ShieldX className="h-4 w-4 text-muted-foreground/40 inline" aria-label="Geen VOG" />
                    )}
                  </td>
                  <td className="py-2 px-3"><Badge variant={seniorityVariant(member.seniority)}>{seniorityLabel(member.seniority)}</Badge></td>
                  <td className="py-2 px-3"><Badge variant={statusVariant(member.status)}>{statusLabel(member.status)}</Badge></td>
                  <td className="py-2 px-3 text-right">
                    {canCrew && (
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100">
                        <Link href={`/crew/${member.id}/edit`}>Bewerk</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="shrink-0 border-t bg-background px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelected(new Set())}>
            <X className="h-3 w-3" /> Wis
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" onClick={exportCsv} disabled={busy}>
              <Download className="h-3 w-3" /> Exporteer CSV
            </Button>
            {canCrew && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Status →</span>
                {STATUS_CHOICES.map((c) => (
                  <Button
                    key={c.value}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => bulkStatus(c.value)}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : c.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
