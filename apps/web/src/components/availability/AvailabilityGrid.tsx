"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Crew, AvailabilityStatus } from "@crewops/core";
import { availabilityCellClass, getDaysInMonth } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/admin/perms-context";
import { toast } from "@/components/ui/use-toast";

// Cycle order: leeg → B → M → X → leeg.
const CYCLE: (AvailabilityStatus | null)[] = [null, "B", "M", "X"];

/**
 * The next status for a plain click, or `current` when the cycle must not
 * touch it. W and V are deliberately outside the cycle: the migration that
 * defines them says their meaning is per-deployment and undecided, so a stray
 * click must not silently rewrite one to "beschikbaar". Use the picker to set
 * or clear them.
 */
function nextStatus(current: AvailabilityStatus | null): AvailabilityStatus | null {
  if (current === "W" || current === "V") return current;
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length] ?? null;
}

// How a click on a cell behaves.
//   "cycle" — click steps through leeg → B → M → X → leeg. Fast for a run of
//             cells, but W and V are unreachable and overshooting means going
//             round again.
//   "pick"  — click opens a small menu with every status, including W and V.
// The choice is a personal working preference, so it lives in localStorage
// rather than in the database.
type EditMode = "cycle" | "pick";
const EDIT_MODE_KEY = "crewops.availability.editMode";

const PICKER_OPTIONS: { value: AvailabilityStatus | null; label: string }[] = [
  { value: "B", label: "Beschikbaar" },
  { value: "M", label: "Misschien" },
  { value: "X", label: "Niet beschikbaar" },
  { value: "W", label: "W" },
  { value: "V", label: "V" },
  { value: null, label: "Leeg" },
];

type PickerState = { crewId: string; date: string; label: string; x: number; y: number };

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
  const [editMode, setEditMode] = useState<EditMode>("cycle");
  const [picker, setPicker] = useState<PickerState | null>(null);
  const canEdit = useCan("crew");

  // Read the stored preference after mount — localStorage does not exist during
  // the server render, and reading it in useState would break hydration.
  useEffect(() => {
    const stored = window.localStorage.getItem(EDIT_MODE_KEY);
    if (stored === "cycle" || stored === "pick") setEditMode(stored);
  }, []);

  const chooseEditMode = useCallback((mode: EditMode) => {
    setEditMode(mode);
    setPicker(null);
    try {
      window.localStorage.setItem(EDIT_MODE_KEY, mode);
    } catch {
      // Private mode or a full quota: the preference just does not persist.
    }
  }, []);

  // Close the picker on Escape or on any scroll — it is positioned against the
  // viewport, so it would otherwise drift away from its cell.
  useEffect(() => {
    if (!picker) return;
    const close = () => setPicker(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [picker]);

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

  // Write one cell. Shared by the click-to-cycle path and the picker menu.
  const setCell = useCallback(
    async (crewId: string, dk: string, next: AvailabilityStatus | null) => {
      const cellKey = `${crewId}:${dk}`;
      if (pending.has(cellKey)) return;

      const current = (localMap[crewId]?.[dk] ?? null) as AvailabilityStatus | null;
      if (current === next) return;

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
        const res =
          next === null
            ? await fetch("/api/availability", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ crew_id: crewId, date: dk }),
              })
            : await fetch("/api/availability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ crew_id: crewId, date: dk, status: next }),
              });
        // Without this an RLS rejection (403) resolves like a success and the
        // cell keeps showing a value the database never stored.
        if (!res.ok) throw new Error(`availability write failed: ${res.status}`);
      } catch {
        toast.error(
          "Opslaan mislukt",
          "De cel is teruggezet. Controleer je rechten of probeer opnieuw."
        );
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
          const nextPending = new Set(p);
          nextPending.delete(cellKey);
          return nextPending;
        });
      }
    },
    [localMap, pending]
  );

  // A click either steps to the next status or opens the picker, depending on
  // the mode the user chose in the toolbar.
  const handleCellClick = useCallback(
    (crewId: string, dk: string, label: string, el: HTMLElement) => {
      if (!canEdit) return;
      if (editMode === "pick") {
        const r = el.getBoundingClientRect();
        setPicker({ crewId, date: dk, label, x: r.left, y: r.bottom + 4 });
        return;
      }
      void setCell(crewId, dk, nextStatus((localMap[crewId]?.[dk] ?? null) as AvailabilityStatus | null));
    },
    [canEdit, editMode, localMap, setCell]
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
        toast.error("Bulkactie mislukt", "Er is niets gewijzigd.");
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

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-muted-foreground">Klikken:</span>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Wat een klik op een cel doet">
              <button
                type="button"
                aria-pressed={editMode === "cycle"}
                onClick={() => chooseEditMode("cycle")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  editMode === "cycle" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
                )}
                title="Klik loopt door leeg → B → M → X"
              >
                Doorlopen
              </button>
              <button
                type="button"
                aria-pressed={editMode === "pick"}
                onClick={() => chooseEditMode("pick")}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  editMode === "pick" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60"
                )}
                title="Klik opent een keuzelijst met alle statussen, inclusief W en V"
              >
                Kiezen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              {/* Sticky name column header */}
              <th className="sticky left-0 z-30 bg-background border-b border-r border-border text-left px-2 py-1 font-medium text-muted-foreground w-[220px] min-w-[220px] max-w-[220px] whitespace-nowrap">
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
                <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/30 border-b border-r border-border px-2 py-0.5 whitespace-nowrap w-[220px] min-w-[220px] max-w-[220px] relative overflow-hidden">
                  <Link
                    href={`/crew/${c.id}`}
                    className="block truncate hover:underline"
                    title={`${c.first_name} ${c.last_name} — open crewdossier`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{c.crew_code}</span>
                    <span className="font-medium">{c.last_name}</span>
                    <span className="text-muted-foreground ml-1">{c.first_name}</span>
                  </Link>
                  {canEdit && (
                    /* Overlaid, not inline: as an inline element these buttons
                       reserved their width in every row, which pushed the name
                       column out to ~730px and squeezed the date columns. */
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 rounded bg-background/95 pl-1.5 shadow-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
                        onClick={(e) =>
                          handleCellClick(c.id, dc.iso, `${c.first_name} ${c.last_name} — ${dk}`, e.currentTarget)
                        }
                        disabled={isPending || !canEdit}
                        aria-haspopup={editMode === "pick" ? "menu" : undefined}
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

      {/* One picker for the whole grid, moved to the clicked cell. Rendering a
          menu per cell would mean thousands of them. */}
      {picker && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setPicker(null)}
          />
          <div
            role="menu"
            aria-label={`Status kiezen voor ${picker.label}`}
            className="fixed z-50 min-w-[190px] rounded-md border bg-popover p-1 shadow-md"
            style={{
              left: Math.min(picker.x, (typeof window !== "undefined" ? window.innerWidth : 0) - 210),
              top: picker.y,
            }}
          >
            <p className="px-2 py-1 text-[10px] text-muted-foreground">{picker.label}</p>
            {PICKER_OPTIONS.map((opt) => {
              const active = (localMap[picker.crewId]?.[picker.date] ?? null) === opt.value;
              return (
                <button
                  key={opt.label}
                  role="menuitem"
                  autoFocus={opt.value === "B"}
                  onClick={() => {
                    void setCell(picker.crewId, picker.date, opt.value);
                    setPicker(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent",
                    active && "bg-accent/60 font-medium"
                  )}
                >
                  {/* aria-hidden: the letter is a visual echo of the label
                      next to it, and without this a reader says "B Beschikbaar". */}
                  <span aria-hidden="true" className={cn(availabilityCellClass(opt.value), "w-5 h-5 text-[10px]")}>
                    {opt.value ?? ""}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
