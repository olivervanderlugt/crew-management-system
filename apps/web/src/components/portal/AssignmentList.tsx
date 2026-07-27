"use client";

import { useMemo, useState, useTransition } from "react";
import { MapPin, Calendar, Check, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime, statusLabel } from "@/lib/utils";
import { respondToAssignmentAction } from "@/app/portaal/(app)/toewijzingen/actions";

export interface PortalAssignment {
  id: string;
  status: string;
  role: string | null;
  event: {
    name: string;
    venue: string | null;
    address: string | null;
    start_datetime: string;
    end_datetime: string;
  } | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  checked_in: "default",
  declined: "destructive",
  invited: "secondary",
  proposed: "outline",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Te beantwoorden" },
  { value: "confirmed", label: "Bevestigd" },
];

export function AssignmentList({ assignments }: { assignments: PortalAssignment[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) => {
      if (filter === "open" && !(a.status === "invited" || a.status === "proposed")) return false;
      if (filter === "confirmed" && !(a.status === "confirmed" || a.status === "checked_in")) return false;
      if (!q) return true;
      const ev = a.event;
      const hay = [ev?.name, ev?.venue, ev?.address, a.role].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [assignments, query, filter]);

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Je hebt op dit moment geen aankomende toewijzingen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op event, locatie of rol…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Geen shifts gevonden.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((a) => (
            <AssignmentCard key={a.id} assignment={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: PortalAssignment }) {
  const [status, setStatus] = useState(assignment.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canRespond = status === "invited" || status === "proposed";
  const ev = assignment.event;

  function respond(next: "confirmed" | "declined") {
    setError(null);
    const prev = status;
    setStatus(next); // optimistic
    startTransition(async () => {
      const res = await respondToAssignmentAction({ assignment_id: assignment.id, status: next });
      if (!res.ok) {
        setStatus(prev);
        setError(res.error ?? "Er ging iets mis.");
      }
    });
  }

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{ev?.name ?? "Onbekend event"}</p>
          {assignment.role && (
            <p className="text-xs text-muted-foreground mt-0.5">Rol: {assignment.role}</p>
          )}
        </div>
        <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{statusLabel(status)}</Badge>
      </div>

      {ev && (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {formatDateTime(ev.start_datetime)}
          </p>
          {(ev.venue || ev.address) && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[ev.venue, ev.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {canRespond && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" disabled={pending} onClick={() => respond("confirmed")}>
            <Check className="h-4 w-4 mr-1" /> Bevestigen
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("flex-1")}
            disabled={pending}
            onClick={() => respond("declined")}
          >
            <X className="h-4 w-4 mr-1" /> Afzeggen
          </Button>
        </div>
      )}
    </li>
  );
}
