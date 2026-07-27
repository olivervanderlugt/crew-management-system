"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { hireProspect, completeOnboarding } from "@/app/(dashboard)/onboarding/actions";
import { Loader2, Check, UserCheck } from "lucide-react";

export function HireButton({ crewId, className }: { crewId: string; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      className={className}
      disabled={pending}
      onClick={() => start(async () => { await hireProspect(crewId); router.refresh(); })}
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
      Aannemen
    </Button>
  );
}

export function FinishOnboardingButton({ crewId, disabled }: { crewId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={disabled ? "outline" : "default"}
      disabled={pending || disabled}
      onClick={() => start(async () => { await completeOnboarding(crewId); router.refresh(); })}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      Onboarding afronden
    </Button>
  );
}
