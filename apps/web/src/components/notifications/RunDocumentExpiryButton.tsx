"use client";

import { useTransition } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

// Lets an admin run the document-expiry cron on demand (the endpoint also accepts
// an admin session, not just CRON_SECRET) — enqueues "certificaat verloopt"
// reminders for crew whose certificates are expired or expiring soon.
export function RunDocumentExpiryButton() {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/document-expiry", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Mislukt", (body as { error?: string }).error ?? "Kon certificaat-signalering niet draaien.");
          return;
        }
        if ((body as { skipped?: boolean }).skipped) {
          toast.error("Niet actief", (body as { reason?: string }).reason ?? "Overgeslagen.");
          return;
        }
        const queued = (body as { queued?: number }).queued ?? 0;
        toast.success(
          queued > 0 ? `${queued} certificaat-herinnering(en) ingepland` : "Niets in te plannen",
          queued > 0 ? "Staan nu in de wachtrij." : "Geen verlopen of bijna-verlopen certificaten."
        );
      } catch {
        toast.error("Mislukt", "Kon de certificaat-signalering niet uitvoeren.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={run}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
      Certificaten controleren
    </Button>
  );
}
