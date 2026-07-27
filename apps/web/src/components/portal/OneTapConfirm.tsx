"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Calendar, MapPin, Check, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, statusLabel } from "@/lib/utils";
import { respondToAssignmentAction } from "@/app/portaal/(app)/toewijzingen/actions";

export interface ConfirmShift {
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

// One-tap confirm landing — the target of the deep link in a reminder message.
// Shows the shift and a single big "Bevestig je komst" button. Re-confirming an
// already-confirmed shift is fine; a declined/checked_in shift shows its state.
export function OneTapConfirm({ shift }: { shift: ConfirmShift }) {
  const [status, setStatus] = useState(shift.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ev = shift.event;
  const isConfirmed = status === "confirmed" || status === "checked_in";
  const canRespond = status === "invited" || status === "proposed";

  function respond(next: "confirmed" | "declined") {
    setError(null);
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const res = await respondToAssignmentAction({ assignment_id: shift.id, status: next });
      if (!res.ok) {
        setStatus(prev);
        setError(res.error ?? "Er ging iets mis.");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{ev?.name ?? "Onbekend event"}</p>
          {shift.role && <p className="text-xs text-muted-foreground mt-0.5">Rol: {shift.role}</p>}
        </div>
        <Badge variant={isConfirmed ? "default" : "outline"}>{statusLabel(status)}</Badge>
      </div>

      {ev && (
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 shrink-0" />
            {formatDateTime(ev.start_datetime)}
          </p>
          {(ev.venue || ev.address) && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              {[ev.venue, ev.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4">
        {isConfirmed ? (
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" /> Je komst is bevestigd. Tot dan!
          </div>
        ) : status === "declined" ? (
          <p className="text-sm text-muted-foreground">Je hebt deze dienst afgezegd.</p>
        ) : canRespond ? (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending} onClick={() => respond("confirmed")}>
              <Check className="h-4 w-4 mr-1" /> Bevestig je komst
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => respond("declined")}>
              <X className="h-4 w-4 mr-1" /> Afzeggen
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Deze dienst kan niet meer bevestigd worden.</p>
        )}
      </div>

      <div className="mt-4 text-center">
        <Link href="/portaal/toewijzingen" className="text-sm text-muted-foreground underline">
          Naar al mijn toewijzingen
        </Link>
      </div>
    </div>
  );
}
