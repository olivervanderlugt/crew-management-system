"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "@/app/portaal/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { ok: false, message: "" };

export function LoginForm({ notLinked }: { notLinked?: boolean }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mailadres</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="jouw@email.nl"
          required
          autoComplete="email"
          autoFocus
        />
      </div>

      {notLinked && !state.message && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Je inloglink is verlopen of dit account is nog niet aan een crewprofiel
          gekoppeld. Vraag hieronder een nieuwe link aan.
        </p>
      )}

      {state.message && (
        <p className={state.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}>
          {state.message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Bezig…" : "Stuur inloglink"}
      </Button>
    </form>
  );
}
