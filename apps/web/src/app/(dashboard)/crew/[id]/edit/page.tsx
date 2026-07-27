"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { updateCrewSchema } from "@crewops/core";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrewDocuments } from "@/components/crew/CrewDocuments";
import { useCan, NO_RIGHTS_TITLE } from "@/components/admin/perms-context";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

type FormValues = {
  first_name: string; last_name: string;
  phone: string; email: string; home_city: string; postcode: string;
  has_car: boolean; has_license: boolean;
  seniority: "sitecrew" | "senior" | "teamlead";
  status: "active" | "inactive" | "prospect";
  notes: string;
  // advanced
  street: string; address_2: string;
  address_label: string; address_2_label: string; postcode_2: string; home_city_2: string;
  date_of_birth: string; nationality: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  shirt_size: string; start_date: string;
  drivers_license_number: string; iban: string; hourly_cost: string;
  // prospect
  prospect_source: string; prospect_status: string;
  prospect_applied_on: string; prospect_next_action_on: string; prospect_notes: string;
};

const EMPTY: FormValues = {
  first_name: "", last_name: "", phone: "", email: "", home_city: "", postcode: "",
  has_car: false, has_license: false, seniority: "sitecrew", status: "active", notes: "",
  street: "", address_2: "",
  address_label: "", address_2_label: "", postcode_2: "", home_city_2: "",
  date_of_birth: "", nationality: "",
  emergency_contact_name: "", emergency_contact_phone: "", shirt_size: "", start_date: "",
  drivers_license_number: "", iban: "", hourly_cost: "",
  prospect_source: "", prospect_status: "", prospect_applied_on: "", prospect_next_action_on: "", prospect_notes: "",
};

// Second named/geocoded address (migration 0012); off until columns exist.
const SECOND_ADDRESS = process.env.NEXT_PUBLIC_CREW_SECOND_ADDRESS === "true";
// Crew hourly cost (migration 0015); off until the column exists. Gate the
// payload too so we never send an unknown column to the DB.
const COSTING = process.env.NEXT_PUBLIC_COSTING === "true";

const PROSPECT_STATUSES = [
  { value: "new", label: "Nieuw" },
  { value: "contacted", label: "Gecontacteerd" },
  { value: "intake_planned", label: "Intake gepland" },
  { value: "intake_done", label: "Intake gedaan" },
  { value: "hired", label: "Aangenomen" },
  { value: "rejected", label: "Afgewezen" },
];

export default function EditCrewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormValues>(EMPTY);
  const canCrew = useCan("crew");

  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("crew") as any)
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }: { data: Record<string, any> | null; error: unknown }) => {
        if (error || !data) { setServerError("Crewlid niet gevonden."); setLoading(false); return; }
        setForm({
          first_name: data.first_name ?? "", last_name: data.last_name ?? "",
          phone: data.phone ?? "", email: data.email ?? "", home_city: data.home_city ?? "", postcode: data.postcode ?? "",
          has_car: data.has_car ?? false, has_license: data.has_license ?? false,
          seniority: data.seniority ?? "sitecrew", status: data.status ?? "active", notes: data.notes ?? "",
          street: data.street ?? "", address_2: data.address_2 ?? "",
          address_label: data.address_label ?? "", address_2_label: data.address_2_label ?? "",
          postcode_2: data.postcode_2 ?? "", home_city_2: data.home_city_2 ?? "",
          date_of_birth: data.date_of_birth ?? "", nationality: data.nationality ?? "",
          emergency_contact_name: data.emergency_contact_name ?? "", emergency_contact_phone: data.emergency_contact_phone ?? "",
          shirt_size: data.shirt_size ?? "", start_date: data.start_date ?? "",
          drivers_license_number: data.drivers_license_number ?? "", iban: data.iban ?? "",
          hourly_cost: data.hourly_cost != null ? String(data.hourly_cost) : "",
          prospect_source: data.prospect_source ?? "", prospect_status: data.prospect_status ?? "",
          prospect_applied_on: data.prospect_applied_on ?? "", prospect_next_action_on: data.prospect_next_action_on ?? "",
          prospect_notes: data.prospect_notes ?? "",
        });
        setLoading(false);
      });
  }, [id]);

  const set = (field: keyof FormValues, value: FormValues[keyof FormValues]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({}); setServerError(null);

    const nz = (v: string) => (v.trim() === "" ? null : v.trim());
    const payload = {
      first_name: form.first_name || undefined,
      last_name: form.last_name || undefined,
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
      ...(COSTING ? { hourly_cost: form.hourly_cost.trim() === "" ? null : Number(form.hourly_cost) } : {}),
      prospect_source: nz(form.prospect_source),
      prospect_status: form.prospect_status === "" ? null : form.prospect_status,
      prospect_applied_on: nz(form.prospect_applied_on), prospect_next_action_on: nz(form.prospect_next_action_on),
      prospect_notes: nz(form.prospect_notes),
    };

    const result = updateCrewSchema.safeParse(payload);
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
    const { error } = await (supabase.from("crew") as any).update(result.data).eq("id", id);
    setSaving(false);
    if (error) { setServerError(error.message); return; }
    toast.success("Wijzigingen opgeslagen");
    // Re-geocode on save (fire-and-forget; address may have changed).
    void fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "crew", id }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.latitude) toast.success("Locatie op de kaart bijgewerkt"); })
      .catch(() => {});
    router.push(`/crew/${id}`);
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const err = (k: string) => fieldErrors[k] && <p className="text-xs text-destructive">{fieldErrors[k]}</p>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href={`/crew/${id}`}><ArrowLeft /> Terug</Link></Button>
        <h1 className="text-base font-semibold flex-1">Crewlid bewerken</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
          {serverError && <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</div>}
          {!canCrew && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Je hebt geen rechten om crew te bewerken — wijzigingen worden niet opgeslagen.
            </div>
          )}

          <Tabs defaultValue="basis">
            <TabsList>
              <TabsTrigger value="basis">Basis</TabsTrigger>
              <TabsTrigger value="advanced">Geavanceerd</TabsTrigger>
              <TabsTrigger value="documents">Documenten</TabsTrigger>
            </TabsList>

            {/* ── BASIS ── */}
            <TabsContent value="basis" className="space-y-4">
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

            {/* ── GEAVANCEERD ── */}
            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Adres</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {SECOND_ADDRESS && (
                    <div className="space-y-1.5"><Label className="text-xs">Naam van dit adres</Label><Input placeholder="bv. Thuis" value={form.address_label} onChange={(e) => set("address_label", e.target.value)} /></div>
                  )}
                  <div className="space-y-1.5"><Label className="text-xs">Straat + huisnummer</Label><Input value={form.street} onChange={(e) => set("street", e.target.value)} /></div>
                  {!SECOND_ADDRESS && (
                    <div className="space-y-1.5"><Label className="text-xs">Tweede adres</Label><Textarea rows={2} className="text-sm resize-none" placeholder="Bijv. postadres of tweede verblijf…" value={form.address_2} onChange={(e) => set("address_2", e.target.value)} /></div>
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
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Rijbewijs & financieel</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Rijbewijsnummer</Label><Input value={form.drivers_license_number} onChange={(e) => set("drivers_license_number", e.target.value)} /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input value={form.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} placeholder="NL00 BANK 0000 0000 00" />
                    {err("iban")}
                    <p className="text-[11px] text-muted-foreground">Gevoelig — alleen voor uitbetaling. BSN volgt na juridische sign-off.</p>
                  </div>
                  {COSTING && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Uurtarief (€/uur)</Label>
                      <Input type="number" min={0} step="0.01" value={form.hourly_cost} onChange={(e) => set("hourly_cost", e.target.value)} placeholder="bijv. 18" />
                      {err("hourly_cost")}
                      <p className="text-[11px] text-muted-foreground">Loonkosten per uur — voedt de margeberekening per event. Leeg = schatting op niveau.</p>
                    </div>
                  )}
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

            {/* ── DOCUMENTEN ── */}
            <TabsContent value="documents">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Documenten & certificaten</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    VOG, VCA, verzekeringsblad, contract… Wijzigingen hier worden direct opgeslagen.
                  </p>
                  <CrewDocuments crewId={id} readOnly={!canCrew} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Actions (apply to Basis + Geavanceerd; Documenten saves itself) */}
          <div className="flex gap-2 justify-end pb-4">
            <Button asChild variant="outline" type="button"><Link href={`/crew/${id}`}>Annuleren</Link></Button>
            <Button type="submit" disabled={saving || !canCrew} title={!canCrew ? NO_RIGHTS_TITLE : undefined}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
