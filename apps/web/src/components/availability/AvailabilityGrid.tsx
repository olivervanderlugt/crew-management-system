"use client";

import { useState, useCallback, useMemo } from "react";
import type { Crew, AvailabilityStatus } from "@crewops/core";
import { availabilityCellClass, getDaysInMonth } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/admin/perms-context";

// Cycle order: null → B → M → X → null
const CYCLE: (AvailabilityStatus | null)[] = [null, "B", "M", "X", null];
function nextStatus(current: AvailabilityStatus | null): AvailabilityStatus | null {
  const idx = CYCLE.indexOf(current);
  if (idx === -1 || idx === CYCLE.length - 1) return "B";
  return CYCLE[idx + 1] ?? null;
}

// Day of week names (NL), starting Monday
const WEEKDAY_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
function getDayOfWeek(year: number, month: number, day: number): number {
  // JS: 0=Sun … 6=Sat; convert to 0=Mon … 6=Sun
  const d = new Date(year, month - 1, day).getDay();
  return (d + 6) % 7;
}
export interface AvailabilityGridProps {
  crew: Pick<Crew, "id" | "crew_code" | "first_name" | "last_name">[];
  availMap: Record<string, Record<string, string>>; // crew_id → date → status
  year: number;
  month: number;
}

export function AvailabilityGrid({ crew, availMap: initialAvailMap, year, month }: AvailabilityGridProps) {
  const [localMap, setLocalMap] = useState<Record<string, Record<string, string>>>(initialAvailMap);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const canEdit = useCan("crew");

  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" }),
    [year, month]
  );

  // Visible columns: the last 3 days of the previous month, the full current
  // month, and the first 3 days of the next month — so a multi-day job that
  // crosses a month boundary stays readable.
  type DayCell = { iso: string; day: number; year: number; month: number; dow: number; weekend: boolean; current: boolean };
  const dates = useMemo<DayCell[]>(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const mk = (y: number, m: number, d: number, current: boolean): DayCell => {
      const dow = getDayOfWeek(y, m, d);
      return { iso: `${y}-${pad(m)}-${pad(d)}`, day: d, year: y, month: m, dow, weekend: dow >= 5, current };
    };
    const out: DayCell[] = [];
    const prevLast = new Date(year, month - 1, 0); // last day of previous month
    const py = prevLast.getFullYear(), pm = prevLast.getMonth() + 1, pld = prevLast.getDate();
    for (let d = pld - 2; d <= pld; d++) out.push(mk(py, pm, d, false));
    const dim = getDaysInMonth(year, month);
    for (let d = 1; d <= dim; d++) out.push(mk(year, month, d, true));
    const nf = new Date(year, month, 1); // first day of next month
    const ny = nf.getFullYear(), nm = nf.getMonth() + 1;
    for (let d = 1; d <= 3; d++) out.push(mk(ny, nm, d, false));
    return out;
  }, [year, month]);

  // ISO dates of the current month only (the adjacent-month tail/head are
  // context, never touched by bulk fills).
  const monthDates = useMemo(() => dates.filter((d) => d.current).map((d) => d.iso), [dates]);

  const filteredCrew = useMemo(() => {
    if (!search.trim()) return crew;
    const q = search.toLowerCase();
    return crew.filter(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.crew_code.toLowerCase().includes(q)
    );
  }, [crew, search]);

  const handleCellClick = useCallback(
    async (crewId: string, dk: string) => {
      const cellKey = `${crewId}:${dk}`;
      if (pending.has(cellKey)) return;

      const current = (localMap[crewId]?.[dk] ?? null) as AvailabilityStatus | null;
      const next = nextStatus(current);

      // Optimistic update
      setLocalMap((prev) => {
        const crewEntries = { ...(prev[crewId] ?? {}) };
        if (next === null) {
          delete crewEntries[dk];
        } else {
          crewEntries[dk] = next;
        }
        return { ...prev, [crewId]: crewEntries };
      });

      setPending((p) => new Set(p).add(cellKey));

      try {
        if (next === null) {
          await fetch("/api/availability", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ crew_id: crewId, date: dk }),
          });
        } else {
          await fetch("/api/availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ crew_id: crewId, date: dk, status: next }),
          });
        }
      } catch {
        // Revert optimistic update on error
        setLocalMap((prev) => {
          const crewEntries = { ...(prev[crewId] ?? {}) };
          if (current === null) {
            delete crewEntries[dk];
          } else {
            crewEntries[dk] = current;
          }
          return { ...prev, [crewId]: crewEntries };
        });
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(cellKey);
          return next;
        });
      }
    },
    [localMap, pending]
  );

  // Bulk fill/clear the current month for a set of crew in one request.
  // status null clears. Used by both the per-row quick-fill and the toolbar
  // "vul getoonde crew" action.
  const applyBulk = useCallback(
    async (crewIds: string[], status: AvailabilityStatus | null, confirmMsg?: string) => {
      if (!canEdit || bulkBusy || crewIds.length === 0) return;
      if (confirmMsg && !window.confirm(confirmMsg)) return;

      let snapshot: Record<string, Record<string, string>> = {};
      setBulkBusy(true);
      setLocalMap((prev) => {
        snapshot = {};
        const next = { ...prev };
        for (const id of crewIds) {
          snapshot[id] = { ...(prev[id] ?? {}) };
          const entries = { ...(prev[id] ?? {}) };
          for (const iso of monthDates) {
            if (status === null) delete entries[iso];
            else entries[iso] = status;
          }
          next[id] = entries;
        }
        return next;
      });

      try {
        const res = await fetch("/api/availability", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crew_ids: crewIds, dates: monthDates, status }),
        });
        if (!res.ok) throw new Error("bulk failed");
      } catch {
        // Revert the affected crew to their pre-bulk state.
        setLocalMap((prev) => {
          const next = { ...prev };
          for (const id of crewIds) next[id] = snapshot[id] ?? {};
          return next;
        });
      } finally {
        setBulkBusy(false);
      }
    },
    [canEdit, bulkBusy, monthDates]
  );

  // Summary row: count of available (B) crew per day, over the crew currently
  // shown (so it tracks the search filter instead of always counting everyone).
  const bCountPerDate = useMemo(() => {
    return dates.map((dc) => {
      let count = 0;
      for (const c of filteredCrew) {
        if (localMap[c.id]?.[dc.iso] === "B") count++;
      }
      return count;
    });
  }, [dates, filteredCrew, localMap]);

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* Search + legend */}
      <div className="flex items-center gap-4 px-4 pt-3 flex-wrap shrink-0">
        <input
          type="search"
          placeholder="Zoek crew..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{filteredCrew.length} crew</span>
          {!canEdit && <span className="font-medium text-amber-600 dark:text-amber-400">Alleen-lezen — geen rechten om te bewerken</span>}
          <span className="flex items-center gap-1"><span className="avail-cell avail-cell-B w-5 h-5 text-[10px]">B</span> Beschikbaar</span>
          <span className="flex items-center gap-1"><span className="avail-cell avail-cell-M w-5 h-5 text-[10px]">M</span> Misschien</span>
          <span className="flex items-center gap-1"><span className="avail-cell avail-cell-X w-5 h-5 text-[10px]">X</span> Niet beschikbaar</span>
          <span className="flex items-center gap-1"><span className="avail-cell avail-cell-W w-5 h-5 text-[10px]">W</span> W</span>
          <span className="flex items-center gap-1"><span className="avail-cell avail-cell-V w-5 h-5 text-[10px]">V</span> V</span>
        </div>
      </div>

      {/* Bulk fill toolbar — applies to the crew currently shown (so it composes
          with the search box: filter a team, then fill them all at once). */}
      {canEdit && (
        <div className="flex items-center gap-2 px-4 flex-wrap shrink-0 text-xs">
          <span className="text-muted-foreground">
            Vul <span className="font-semibold text-foreground">{filteredCrew.length}</span> getoonde crew voor {monthLabel}:
          </span>
          {(["B", "M", "X"] as const).map((s) => (
            <button
              key={s}
              disabled={bulkBusy || filteredCrew.length === 0}
              onClick={() =>
                applyBulk(
                  filteredCrew.map((c) => c.id),
                  s,
                  `Zeker weten? Dit zet ${monthLabel} op "${s}" voor ${filteredCrew.length} crew. Bestaande waardes worden overschreven.`
                )
              }
              className={cn(
                "rounded-md border px-2 py-1 font-medium transition-colors disabled:opacity-40",
                "hover:bg-secondary"
              )}
              title={`Hele maand op ${s} voor de getoonde crew`}
            >
              Alles {s}
            </button>
          ))}
          <button
            disabled={bulkBusy || filteredCrew.length === 0}
            onClick={() =>
              applyBulk(
                filteredCrew.map((c) => c.id),
                null,
                `Zeker weten? Dit WIST ${monthLabel} voor ${filteredCrew.length} crew.`
              )
            }
            className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-secondary disabled:opacity-40"
            title="Hele maand wissen voor de getoonde crew"
          >
            Wis maand
          </button>
          {bulkBusy && <span className="text-muted-foreground">Bezig…</span>}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              {/* Sticky name column header */}
              <th className="sticky left-0 z-30 bg-background border-b border-r border-border text-left px-2 py-1 font-medium text-muted-foreground min-w-[160px] whitespace-nowrap">
                Crew
              </th>
              {dates.map((dc) => (
                <th
                  key={dc.iso}
                  className={cn(
                    "border-b border-border px-0.5 py-1 font-medium text-center min-w-[28px] w-7",
                    dc.weekend ? "bg-muted/60" : "bg-background",
                    !dc.current && "opacity-50",
                    dc.day === 1 && "border-l-2 border-l-border"
                  )}
                  title={!dc.current ? "Aangrenzende maand" : undefined}
                >
                  <div className="text-[10px] text-muted-foreground leading-none">{WEEKDAY_SHORT[dc.dow]}</div>
                  <div className="leading-none mt-0.5">{dc.day}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCrew.map((c) => (
              <tr key={c.id} className="group hover:bg-muted/30">
                {/* Sticky name cell */}
                <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/30 border-b border-r border-border px-2 py-0.5 whitespace-nowrap">
                  <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{c.crew_code}</span>
                  <span className="font-medium">{c.last_name}</span>
                  <span className="text-muted-foreground ml-1">{c.first_name}</span>
                  {canEdit && (
                    <span className="ml-2 inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity align-middle">
                      {(["B", "M", "X"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={bulkBusy}
                          onClick={() => applyBulk([c.id], s)}
                          className="rounded border px-1 text-[10px] font-medium leading-none hover:bg-secondary disabled:opacity-40"
                          title={`Hele maand op ${s} voor ${c.first_name} ${c.last_name}`}
                        >
                          {s}
                        </button>
                      ))}
                      <button
                        disabled={bulkBusy}
                        onClick={() => applyBulk([c.id], null)}
                        className="rounded border px-1 text-[10px] font-medium leading-none hover:bg-secondary disabled:opacity-40"
                        title="Hele maand wissen"
                      >
                        ⌫
                      </button>
                    </span>
                  )}
                </td>
                {dates.map((dc) => {
                  const dk = dc.iso;
                  const status = (localMap[c.id]?.[dk] ?? null) as AvailabilityStatus | null;
                  const cellKey = `${c.id}:${dk}`;
                  const isPending = pending.has(cellKey);

                  return (
                    <td
                      key={dk}
                      className={cn(
                        "border-b border-border px-0.5 py-0.5 text-center",
                        dc.weekend && !status && "bg-muted/40",
                        !dc.current && "opacity-50",
                        dc.day === 1 && "border-l-2 border-l-border"
                      )}
                    >
                      <button
                        onClick={() => handleCellClick(c.id, dc.iso)}
                        disabled={isPending || !canEdit}
                        className={cn(
                          availabilityCellClass(status),
                          isPending && "opacity-50 cursor-wait",
                          !canEdit && "cursor-not-allowed"
                        )}
                        title={`${c.first_name} ${c.last_name} — ${dk}`}
                        aria-label={`${c.first_name} ${c.last_name} ${dk}: ${status ?? "leeg"}`}
                      >
                        {status ?? ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Summary row */}
            <tr className="sticky bottom-0 z-20">
              <td className="sticky left-0 z-30 bg-background border-t-2 border-border px-2 py-1 font-semibold text-xs">
                Beschikbaar (B)
              </td>
              {dates.map((dc, i) => {
                const count = bCountPerDate[i] ?? 0;
                return (
                  <td
                    key={dc.iso}
                    className={cn(
                      "border-t-2 border-border px-0.5 py-1 text-center font-semibold",
                      dc.weekend ? "bg-muted/60" : "bg-background",
                      !dc.current && "opacity-50",
                      dc.day === 1 && "border-l-2 border-l-border",
                      count > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                    )}
                  >
                    {count > 0 ? count : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
