"use client";

import { useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

// Lets an admin run the reminder cron on demand (the endpoint also accepts an
// admin session, not just CRON_SECRET) — handy for testing and for sending the
// day's reminders without waiting for the scheduled run.
export function RunRemindersButton() {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/reminders", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Mislukt", (body as { error?: string }).error ?? "Kon herinneringen niet inplannen.");
          return;
        }
        if ((body as { skipped?: boolean }).skipped) {
          toast.error("Niet actief", (body as { reason?: string }).reason ?? "Overgeslagen.");
          return;
        }
        const queued = (body as { queued?: number }).queued ?? 0;
        toast.success(
          queued > 0 ? `${queued} herinnering(en) ingepland` : "Niets in te plannen",
          queued > 0 ? "Staan nu in de wachtrij." : "Geen events binnen het herinneringsvenster."
        );
      } catch {
        toast.error("Mislukt", "Kon de herinneringen-taak niet uitvoeren.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={run}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
      Herinneringen nu inplannen
    </Button>
  );
}
