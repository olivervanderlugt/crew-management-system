"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "@/app/portaal/(app)/profiel/actions";

export interface ProfileFormProps {
  initial: {
    phone: string | null;
    email: string | null;
    home_city: string | null;
    postcode: string | null;
  };
}

export function ProfileForm({ initial }: ProfileFormProps) {
  const [form, setForm] = useState({
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    home_city: initial.home_city ?? "",
    postcode: initial.postcode ?? "",
  });
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await updateProfileAction({
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        home_city: form.home_city.trim() || null,
        postcode: form.postcode.trim() || null,
      });
      setFeedback(
        res.ok
          ? { ok: true, msg: "Profiel bijgewerkt." }
          : { ok: false, msg: res.error ?? "Opslaan mislukt." }
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="phone">Telefoonnummer</Label>
        <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06…" autoComplete="tel" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mailadres</Label>
        <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
        <p className="text-xs text-muted-foreground">
          Let op: je inloglink wordt naar dit adres gestuurd.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="home_city">Woonplaats</Label>
          <Input id="home_city" value={form.home_city} onChange={(e) => set("home_city", e.target.value)} autoComplete="address-level2" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postcode">Postcode</Label>
          <Input id="postcode" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} autoComplete="postal-code" />
        </div>
      </div>

      {feedback && (
        <p className={feedback.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}>
          {feedback.msg}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Opslaan…" : "Opslaan"}
      </Button>
    </form>
  );
}
