"use client";

import { useMemo, useState, useTransition } from "react";
import { MapPin, Calendar, Search, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { requestShiftAction } from "@/app/portaal/(app)/open-diensten/actions";

export interface OpenShift {
  id: string;
  name: string;
  venue: string | null;
  address: string | null;
  start_datetime: string;
  end_datetime: string;
  open_spots: number;
  availability: string | null; // B / M / X / null for this crew on that date
  distance_km: number | null; // home → venue, null when either isn't geocoded
}

// "Dichtbij" cut-off for the default smart filter. Shifts with an unknown
// distance are never hidden (we don't penalise missing geocoding).
const NEARBY_MAX_KM = 50;

export function OpenShiftsList({ shifts }: { shifts: OpenShift[] }) {
  const [query, setQuery] = useState("");
  // Default ON: only diensten waar de crew beschikbaar én dichtbij is.
  const [smartOnly, setSmartOnly] = useState(true);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shifts.filter((s) => {
      if (smartOnly) {
        const available = s.availability === "B" || s.availability === "M" || s.availability == null;
        const nearby = s.distance_km == null || s.distance_km <= NEARBY_MAX_KM;
        if (!available || !nearby) return false;
      }
      if (!q) return true;
      return [s.name, s.venue, s.address].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [shifts, query, smartOnly]);

  if (shifts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Er zijn op dit moment geen open diensten.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op event of locatie…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={smartOnly}
            onChange={(e) => setSmartOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Beschikbaar &amp; dichtbij
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {smartOnly
            ? "Geen diensten waar je beschikbaar én dichtbij bent. Zet het filter uit om alles te zien."
            : "Geen diensten gevonden."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <OpenShiftCard
              key={s.id}
              shift={s}
              done={requested.has(s.id)}
              onRequested={() => setRequested((p) => new Set(p).add(s.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenShiftCard({
  shift,
  done,
  onRequested,
}: {
  shift: OpenShift;
  done: boolean;
  onRequested: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function request() {
    startTransition(async () => {
      const res = await requestShiftAction(shift.id);
      if (res.ok) {
        toast.success("Dienst aangevraagd", "De planning bevestigt je aanvraag.");
        onRequested();
      } else {
        toast.error("Aanvragen mislukt", res.error);
      }
    });
  }

  const availBadge =
    shift.availability === "B" ? (
      <Badge variant="default">Beschikbaar</Badge>
    ) : shift.availability === "M" ? (
      <Badge variant="secondary">Misschien</Badge>
    ) : shift.availability === "X" ? (
      <Badge variant="destructive">Niet beschikbaar</Badge>
    ) : null;

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{shift.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {shift.open_spots} plek{shift.open_spots === 1 ? "" : "ken"} open
          </p>
        </div>
        {availBadge}
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {formatDateTime(shift.start_datetime)}
        </p>
        {(shift.venue || shift.address || shift.distance_km != null) && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {[
              [shift.venue, shift.address].filter(Boolean).join(" · "),
              shift.distance_km != null ? `${shift.distance_km} km` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="mt-3">
        {done ? (
          <Button size="sm" variant="outline" className="w-full" disabled>
            <Check className="h-4 w-4 mr-1" /> Aangevraagd
          </Button>
        ) : (
          <Button size="sm" className="w-full" disabled={pending} onClick={request}>
            <Plus className="h-4 w-4 mr-1" /> Aanvragen
          </Button>
        )}
      </div>
    </li>
  );
}
