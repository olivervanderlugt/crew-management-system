"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { hireProspect, completeOnboarding } from "@/app/(dashboard)/onboarding/actions";
import { Loader2, Check, UserCheck } from "lucide-react";

export function HireButton({ crewId, className }: { crewId: string; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await hireProspect(crewId);
          if (!res.ok) { toast.error("Aannemen mislukt", res.error); return; }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
      Aannemen
    </Button>
  );
}

/**
 * `missing` = labels of the checklist items still open. Non-empty means the
 * admin is finishing early, which needs a confirmation naming what is missing.
 */
export function FinishOnboardingButton({ crewId, missing = [] }: { crewId: string; missing?: string[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const finish = () =>
    start(async () => {
      const res = await completeOnboarding(crewId, missing);
      setOpen(false);
      if (!res.ok) { toast.error("Afronden mislukt", res.error); return; }
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant={missing.length ? "outline" : "default"}
        disabled={pending}
        onClick={() => (missing.length ? setOpen(true) : finish())}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Onboarding afronden
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Onboarding nog niet compleet</DialogTitle>
            <DialogDescription>
              De volgende punten ontbreken nog. Als je toch afrondt, wordt dit vastgelegd in het auditlogboek.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Annuleren
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" disabled={pending} onClick={finish}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Toch afronden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
