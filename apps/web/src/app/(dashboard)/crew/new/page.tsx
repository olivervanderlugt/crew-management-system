"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCrewSchema } from "@crewops/core";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan, NO_RIGHTS_TITLE } from "@/components/admin/perms-context";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

type FormValues = {
  crew_code: string;
  first_name: string; last_name: string;
  phone: string; email: string; home_city: string; postcode: string;
  has_car: boolean; has_license: boolean;
  seniority: "sitecrew" | "senior" | "teamlead";
  status: "active" | "inactive" | "prospect";
  notes: string;
  street: string; address_2: string;
  address_label: string; address_2_label: string; postcode_2: string; home_city_2: string;
  date_of_birth: string; nationality: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  shirt_size: string; start_date: string;
  drivers_license_number: string; iban: string;
  prospect_source: string; prospect_status: string;
  prospect_applied_on: string; prospect_next_action_on: string; prospect_notes: string;
};

const EMPTY: FormValues = {
  crew_code: "", first_name: "", last_name: "", phone: "", email: "", home_city: "", postcode: "",
  has_car: false, has_license: false, seniority: "sitecrew", status: "active", notes: "",
  street: "", address_2: "",
  address_label: "", address_2_label: "", postcode_2: "", home_city_2: "",
  date_of_birth: "", nationality: "",
  emergency_contact_name: "", emergency_contact_phone: "", shirt_size: "", start_date: "",
  drivers_license_number: "", iban: "",
  prospect_source: "", prospect_status: "", prospect_applied_on: "", prospect_next_action_on: "", prospect_notes: "",
};

// Second named/geocoded address (migration 0012). Off until the columns exist
// on the DB, so client-side saves keep working against the current schema.
const SECOND_ADDRESS = process.env.NEXT_PUBLIC_CREW_SECOND_ADDRESS === "true";

const PROSPECT_STATUSES = [
  { value: "new", label: "Nieuw" },
  { value: "contacted", label: "Gecontacteerd" },
  { value: "intake_planned", label: "Intake gepland" },
  { value: "intake_done", label: "Intake gedaan" },
  { value: "hired", label: "Aangenomen" },
  { value: "rejected", label: "Afgewezen" },
];

export default function NewCrewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormValues>(EMPTY);
  const canCrew = useCan("crew");

  const set = (field: keyof FormValues, value: FormValues[keyof FormValues]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({}); setServerError(null);
    const nz = (v: string) => (v.trim() === "" ? null : v.trim());

    const payload = {
      crew_code: form.crew_code, first_name: form.first_name, last_name: form.last_name,
      phone: nz(form.phone), email: nz(form.email), home_city: nz(form.home_city), postcode: nz(form.postcode),
      has_car: form.has_car, has_license: form.has_license,
      seniority: form.seniority, status: form.status, notes: nz(form.notes),
      street: nz(form.street), address_2: nz(form.address_2),
      ...(SECOND_ADDRESS ? {
        address_label: nz(form.address_label),
        address_2_label: nz(form.address_2_label),
        postcode_2: nz(form.postcode_2),
        home_city_2: nz(form.home_city_2),
      } : {}),
      date_of_birth: nz(form.date_of_birth), nationality: nz(form.nationality),
      emergency_contact_name: nz(form.emergency_contact_name), emergency_contact_phone: nz(form.emergency_contact_phone),
      shirt_size: nz(form.shirt_size), start_date: nz(form.start_date),
      drivers_license_number: nz(form.drivers_license_number), iban: nz(form.iban),
      prospect_source: nz(form.prospect_source),
      prospect_status: form.prospect_status === "" ? null : form.prospect_status,
      prospect_applied_on: nz(form.prospect_applied_on), prospect_next_action_on: nz(form.prospect_next_action_on),
      prospect_notes: nz(form.prospect_notes),
    };

    const result = createCrewSchema.safeParse(payload);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: created, error } = await (supabase.from("crew") as any).insert(result.data).select().single();
    setSaving(false);
    if (error || !created) { setServerError(error?.message ?? "Er is een fout opgetreden."); return; }
    toast.success("Crewlid aangemaakt");
    // Geocode on save (fire-and-forget; updates lat/lng for the map in the background).
    void fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "crew", id: created.id }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.latitude) toast.success("Locatie op de kaart bijgewerkt"); })
      .catch(() => {});
    router.push(`/crew/${created.id}`);
  };

  const err = (k: string) => fieldErrors[k] && <p className="text-xs text-destructive">{fieldErrors[k]}</p>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/crew"><ArrowLeft /> Terug</Link></Button>
        <h1 className="text-base font-semibold flex-1">Nieuw crewlid</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          {serverError && <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</div>}
          {!canCrew && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Je hebt geen rechten om crew toe te voegen.
            </div>
          )}

          <Tabs defaultValue="basis">
            <TabsList>
              <TabsTrigger value="basis">Basis</TabsTrigger>
              <TabsTrigger value="advanced">Geavanceerd</TabsTrigger>
            </TabsList>

            <TabsContent value="basis" className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Identificatie</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-w-xs">
                    <Label className="text-xs">Crew ID</Label>
                    <Input placeholder="CREW-0001" className="font-mono" value={form.crew_code} onChange={(e) => set("crew_code", e.target.value.toUpperCase())} />
                    {fieldErrors.crew_code ? <p className="text-xs text-destructive">{fieldErrors.crew_code}</p> : <p className="text-xs text-muted-foreground">Formaat: CREW-XXXX (vier cijfers)</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Naam</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Voornaam</Label><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />{err("first_name")}</div>
                  <div className="space-y-1.5"><Label className="text-xs">Achternaam</Label><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />{err("last_name")}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Telefoon</Label><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />{err("phone")}</div>
                  <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />{err("email")}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Locatie</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Postcode</Label><Input value={form.postcode} onChange={(e) => set("postcode", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Woonplaats</Label><Input value={form.home_city} onChange={(e) => set("home_city", e.target.value)} /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Vervoer</CardTitle></CardHeader>
                <CardContent className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 rounded border-input" checked={form.has_license} onChange={(e) => set("has_license", e.target.checked)} /> Rijbewijs</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 rounded border-input" checked={form.has_car} onChange={(e) => set("has_car", e.target.checked)} /> Eigen auto</label>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Functie & Status</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Functie</Label>
                    <Select value={form.seniority} onValueChange={(v) => set("seniority", v as FormValues["seniority"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sitecrew">Sitecrew</SelectItem>
                        <SelectItem value="senior">Senior</SelectItem>
                        <SelectItem value="teamlead">Teamleider</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => set("status", v as FormValues["status"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Actief</SelectItem>
                        <SelectItem value="inactive">Inactief</SelectItem>
                        <SelectItem value="prospect">Prospect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Notities</CardTitle></CardHeader>
                <CardContent><Textarea rows={3} className="text-sm resize-none" placeholder="Interne notities…" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Adres</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {SECOND_ADDRESS && (
                    <div className="space-y-1.5"><Label className="text-xs">Naam van dit adres</Label><Input placeholder="bv. Thuis" value={form.address_label} onChange={(e) => set("address_label", e.target.value)} /></div>
                  )}
                  <div className="space-y-1.5"><Label className="text-xs">Straat + huisnummer</Label><Input value={form.street} onChange={(e) => set("street", e.target.value)} /></div>
                  {!SECOND_ADDRESS && (
                    <div className="space-y-1.5"><Label className="text-xs">Tweede adres</Label><Textarea rows={2} className="text-sm resize-none" value={form.address_2} onChange={(e) => set("address_2", e.target.value)} /></div>
                  )}
                </CardContent>
              </Card>
              {SECOND_ADDRESS && (
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-sm">Tweede adres (optioneel)</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5"><Label className="text-xs">Naam van dit adres</Label><Input placeholder="bv. Studentenkamer" value={form.address_2_label} onChange={(e) => set("address_2_label", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Straat + huisnummer</Label><Input value={form.address_2} onChange={(e) => set("address_2", e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-xs">Postcode</Label><Input value={form.postcode_2} onChange={(e) => set("postcode_2", e.target.value)} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Woonplaats</Label><Input value={form.home_city_2} onChange={(e) => set("home_city_2", e.target.value)} /></div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Persoonlijk</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Geboortedatum</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Nationaliteit</Label><Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Kledingmaat</Label><Input value={form.shirt_size} onChange={(e) => set("shirt_size", e.target.value)} placeholder="S / M / L / XL…" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Startdatum</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Noodcontact</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Naam</Label><Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Telefoon</Label><Input type="tel" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Rijbewijs & financieel</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Rijbewijsnummer</Label><Input value={form.drivers_license_number} onChange={(e) => set("drivers_license_number", e.target.value)} /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input value={form.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} placeholder="NL00 BANK 0000 0000 00" />
                    {err("iban")}
                    <p className="text-[11px] text-muted-foreground">Gevoelig — alleen voor uitbetaling. BSN volgt na juridische sign-off.</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Prospect</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Bron</Label><Input value={form.prospect_source} onChange={(e) => set("prospect_source", e.target.value)} placeholder="Instagram, referral…" /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pijplijn-status</Label>
                    <Select value={form.prospect_status || "none"} onValueChange={(v) => set("prospect_status", v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {PROSPECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">Aangemeld op</Label><Input type="date" value={form.prospect_applied_on} onChange={(e) => set("prospect_applied_on", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Volgende actie</Label><Input type="date" value={form.prospect_next_action_on} onChange={(e) => set("prospect_next_action_on", e.target.value)} /></div>
                  <div className="space-y-1.5 col-span-2"><Label className="text-xs">Prospect-notities</Label><Textarea rows={2} className="text-sm resize-none" value={form.prospect_notes} onChange={(e) => set("prospect_notes", e.target.value)} /></div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2 justify-end pb-4">
            <Button asChild variant="outline" type="button"><Link href="/crew">Annuleren</Link></Button>
            <Button type="submit" disabled={saving || !canCrew} title={!canCrew ? NO_RIGHTS_TITLE : undefined}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Toevoegen</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
