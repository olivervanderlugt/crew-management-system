"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientRecord, updateClientRecord, deleteClientRecord, type ClientInput,
} from "@/app/(dashboard)/klanten/actions";
import { Loader2, Plus, Trash2, Pencil, MapPin, Phone, Mail } from "lucide-react";

export type Client = {
  id: string; name: string;
  contact_name: string | null; contact_phone: string | null; contact_email: string | null;
  venue: string | null; address: string | null; notes: string | null;
};

const EMPTY: ClientInput = { name: "", contact_name: "", contact_phone: "", contact_email: "", venue: "", address: "", notes: "" };

function toInput(c: Client): ClientInput {
  return {
    name: c.name, contact_name: c.contact_name ?? "", contact_phone: c.contact_phone ?? "",
    contact_email: c.contact_email ?? "", venue: c.venue ?? "", address: c.address ?? "", notes: c.notes ?? "",
  };
}

function ClientFields({ value, onChange }: { value: ClientInput; onChange: (v: ClientInput) => void }) {
  const set = (k: keyof ClientInput, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5 col-span-2"><Label className="text-xs">Naam *</Label><Input value={value.name} onChange={(e) => set("name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Contactpersoon</Label><Input value={value.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Telefoon</Label><Input value={value.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input type="email" value={value.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Standaard locatie</Label><Input value={value.venue} onChange={(e) => set("venue", e.target.value)} /></div>
      <div className="space-y-1.5 col-span-2"><Label className="text-xs">Standaard adres</Label><Input value={value.address} onChange={(e) => set("address", e.target.value)} /></div>
      <div className="space-y-1.5 col-span-2"><Label className="text-xs">Notities</Label><Textarea rows={2} className="resize-none text-sm" value={value.notes} onChange={(e) => set("notes", e.target.value)} /></div>
    </div>
  );
}

function ClientRow({ client, canWrite, setError }: { client: Client; canWrite: boolean; setError: (s: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ClientInput>(toInput(client));

  function save() {
    setError(null);
    start(async () => {
      const res = await updateClientRecord(client.id, form);
      if (!res.ok) { setError(res.error); return; }
      setEditing(false); router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Klant "${client.name}" verwijderen?`)) return;
    setError(null);
    start(async () => {
      const res = await deleteClientRecord(client.id);
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{client.name}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {client.contact_name && <span>{client.contact_name}</span>}
            {client.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.contact_phone}</span>}
            {client.contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.contact_email}</span>}
            {client.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.venue}</span>}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setEditing((v) => !v)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" disabled={pending} onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 border-t pt-3 space-y-3">
          <ClientFields value={form} onChange={setForm} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(toInput(client)); }}>Annuleren</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientManager({ clients, canWrite }: { clients: Client[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ClientInput>(EMPTY);

  function add() {
    setError(null);
    start(async () => {
      const res = await createClientRecord(form);
      if (!res.ok) { setError(res.error); return; }
      setForm(EMPTY); router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {canWrite && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Klant toevoegen</h2>
          <ClientFields value={form} onChange={setForm} />
          <Button size="sm" disabled={pending} onClick={add}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Toevoegen</Button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Klanten ({clients.length})</h2>
        {clients.length === 0 && <p className="text-sm text-muted-foreground">Nog geen klanten.</p>}
        {clients.map((c) => <ClientRow key={c.id} client={c} canWrite={canWrite} setError={setError} />)}
      </div>
    </div>
  );
}
