"use client";

import { useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

// Lets an admin drain the outbox on demand (sends queued WhatsApp messages). The
// endpoint is fail-closed: if dispatch isn't fully configured it returns a
// "skipped" reason instead of sending.
export function RunDispatchButton() {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cron/dispatch", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Mislukt", (body as { error?: string }).error ?? "Kon de wachtrij niet verzenden.");
          return;
        }
        if ((body as { skipped?: boolean }).skipped) {
          toast.error("Niet verzonden", (body as { reason?: string }).reason ?? "Verzending niet geconfigureerd.");
          return;
        }
        const { sent = 0, failed = 0 } = body as { sent?: number; failed?: number };
        if (sent === 0 && failed === 0) {
          toast.success("Niets te verzenden", "De wachtrij is leeg.");
        } else {
          toast.success(`${sent} verzonden`, failed > 0 ? `${failed} mislukt — zie de wachtrijstatus.` : "Alle berichten verstuurd.");
        }
      } catch {
        toast.error("Mislukt", "Kon de verzendtaak niet uitvoeren.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={run}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Verzend wachtrij nu
    </Button>
  );
}
