"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOnboarding, uploadOnboardingDoc } from "@/app/portaal/(app)/onboarding/actions";
import { Loader2, Check, Upload } from "lucide-react";

export type OnboardingFields = {
  phone: string; street: string; postcode: string; home_city: string;
  date_of_birth: string; nationality: string;
  emergency_contact_name: string; emergency_contact_phone: string; iban: string;
};

const DOCS = [
  { type: "vog", label: "VOG-verklaring" },
  { type: "id_document", label: "ID-bewijs (kopie)" },
  { type: "contract", label: "Getekend contract" },
];

function DocUpload({ type, label, done }: { type: string; label: string; done: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function upload(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("doc_type", type);
    start(async () => {
      const res = await uploadOnboardingDoc(fd);
      if (!res.ok) setErr(res.error);
      else router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      {done ? <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" /> : <Upload className="h-4 w-4 text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {done ? (
          <p className="text-xs text-green-700 dark:text-green-400">Geüpload — je mag een nieuwe versie toevoegen</p>
        ) : err ? (
          <p className="text-xs text-destructive">{err}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Nog niet geüpload</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
      <Button variant="outline" size="sm" className="shrink-0" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {done ? "Vervangen" : "Uploaden"}
      </Button>
    </div>
  );
}

export function CrewOnboardingForm({ initial, hasDoc }: { initial: OnboardingFields; hasDoc: Record<string, boolean> }) {
  const router = useRouter();
  const [form, setForm] = useState<OnboardingFields>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof OnboardingFields, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveOnboarding(form);
      setMsg(res.ok ? { ok: true, text: "Gegevens opgeslagen." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Je gegevens</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Telefoon</Label><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">IBAN</Label><Input value={form.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} placeholder="NL.." /></div>
          <div className="space-y-1.5 col-span-2"><Label className="text-xs">Straat + huisnummer</Label><Input value={form.street} onChange={(e) => set("street", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Postcode</Label><Input value={form.postcode} onChange={(e) => set("postcode", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Woonplaats</Label><Input value={form.home_city} onChange={(e) => set("home_city", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Geboortedatum</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Nationaliteit</Label><Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Noodcontact — naam</Label><Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Noodcontact — telefoon</Label><Input type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></div>
        </div>
        {msg && <p className={msg.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}>{msg.text}</p>}
        <Button size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan</Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Documenten</h2>
        {DOCS.map((d) => <DocUpload key={d.type} type={d.type} label={d.label} done={!!hasDoc[d.type]} />)}
      </div>
    </div>
  );
}
