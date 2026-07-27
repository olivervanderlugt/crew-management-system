"use client";

import { useCallback, useMemo, useState } from "react";
import type { AvailabilityStatus } from "@crewops/core";
import { cn } from "@/lib/utils";

// Tap cycle: empty → B → M → X → empty
const CYCLE: (AvailabilityStatus | null)[] = [null, "B", "M", "X"];
function nextStatus(current: AvailabilityStatus | null): AvailabilityStatus | null {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length] ?? null;
}

const CELL_COLOR: Record<AvailabilityStatus, string> = {
  B: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100",
  M: "bg-yellow-200 text-yellow-900 dark:bg-yellow-800 dark:text-yellow-100",
  X: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100",
  W: "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100",
  V: "bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100",
};

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

export interface CrewAvailabilityEditorProps {
  year: number;
  month: number; // 1-12
  initial: Record<string, AvailabilityStatus>; // "YYYY-MM-DD" → status
}

export function CrewAvailabilityEditor({ year, month, initial }: CrewAvailabilityEditorProps) {
  const [map, setMap] = useState<Record<string, AvailabilityStatus | undefined>>(initial);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  // Leading blanks so day 1 lands under the correct weekday (Monday-first).
  const leadingBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const dateKey = useCallback(
    (day: number) =>
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    [year, month]
  );

  const handleClick = useCallback(
    async (day: number) => {
      const dk = dateKey(day);
      if (pending.has(dk)) return;
      setError(null);

      const current = map[dk] ?? null;
      const next = nextStatus(current);

      // Optimistic update
      setMap((prev) => {
        const copy = { ...prev };
        if (next === null) delete copy[dk];
        else copy[dk] = next;
        return copy;
      });
      setPending((p) => new Set(p).add(dk));

      try {
        const res =
          next === null
            ? await fetch("/api/portal/availability", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: dk }),
              })
            : await fetch("/api/portal/availability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: dk, status: next }),
              });
        if (!res.ok) throw new Error();
      } catch {
        // Revert
        setMap((prev) => {
          const copy = { ...prev };
          if (current === null) delete copy[dk];
          else copy[dk] = current;
          return copy;
        });
        setError("Opslaan mislukt. Probeer het opnieuw.");
      } finally {
        setPending((p) => {
          const n = new Set(p);
          n.delete(dk);
          return n;
        });
      }
    },
    [dateKey, map, pending]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className={cn("h-4 w-4 rounded", CELL_COLOR.B)} /> Beschikbaar</span>
        <span className="flex items-center gap-1"><span className={cn("h-4 w-4 rounded", CELL_COLOR.M)} /> Misschien</span>
        <span className="flex items-center gap-1"><span className={cn("h-4 w-4 rounded", CELL_COLOR.X)} /> Niet</span>
        <span className="ml-auto">Tik om te wisselen</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-medium text-muted-foreground pb-1">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const dk = dateKey(day);
          const status = map[dk] ?? null;
          const weekend = ((new Date(year, month - 1, day).getDay() + 6) % 7) >= 5;
          const isPending = pending.has(dk);
          return (
            <button
              key={day}
              onClick={() => handleClick(day)}
              disabled={isPending}
              aria-label={`${dk}: ${status ?? "leeg"}`}
              className={cn(
                "aspect-square rounded-md border text-sm font-medium flex flex-col items-center justify-center transition-colors",
                status ? CELL_COLOR[status] + " border-transparent" : "border-border hover:bg-accent",
                !status && weekend && "bg-muted/50",
                isPending && "opacity-50 cursor-wait"
              )}
            >
              <span className={cn("leading-none", status ? "" : "text-foreground")}>{day}</span>
              {status && <span className="text-[10px] leading-none mt-0.5">{status}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
