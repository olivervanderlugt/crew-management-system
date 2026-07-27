"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ADMIN_MODULES, type AdminModule } from "@/lib/admin/modules";
import { createSubAdmin, updateAdminPerms, deleteSubAdmin } from "@/app/(dashboard)/beheerders/actions";
import { Loader2, Plus, Trash2, ShieldCheck, Pencil } from "lucide-react";

type Admin = { user_id: string; email: string | null; is_full: boolean; perms: string[]; created_at: string };

function toggle(list: AdminModule[], m: AdminModule): AdminModule[] {
  return list.includes(m) ? list.filter((x) => x !== m) : [...list, m];
}

function PermPicker({
  isFull, perms, onFull, onToggle,
}: { isFull: boolean; perms: AdminModule[]; onFull: (v: boolean) => void; onToggle: (m: AdminModule) => void }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="h-4 w-4 rounded border-input" checked={isFull} onChange={(e) => onFull(e.target.checked)} />
        <span className="font-medium">Volledige beheerder</span>
        <span className="text-xs text-muted-foreground">(alle rechten)</span>
      </label>
      {!isFull && (
        <div className="grid sm:grid-cols-2 gap-1.5 pl-1">
          {ADMIN_MODULES.map((m) => (
            <label key={m.key} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-input mt-0.5" checked={perms.includes(m.key)} onChange={() => onToggle(m.key)} />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminRow({ admin, isSelf, setError }: { admin: Admin; isSelf: boolean; setError: (s: string | null) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [isFull, setIsFull] = useState(admin.is_full);
  const [perms, setPerms] = useState<AdminModule[]>(admin.perms as AdminModule[]);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateAdminPerms({ userId: admin.user_id, isFull, perms });
      if (!res.ok) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Beheerder ${admin.email} verwijderen?`)) return;
    setError(null);
    start(async () => {
      const res = await deleteSubAdmin(admin.user_id);
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{admin.email ?? admin.user_id}{isSelf && <span className="ml-2 text-xs text-muted-foreground">(jij)</span>}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {admin.is_full ? (
              <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Volledig</Badge>
            ) : admin.perms.length === 0 ? (
              <span className="text-xs text-muted-foreground">Geen rechten</span>
            ) : (
              ADMIN_MODULES.filter((m) => admin.perms.includes(m.key)).map((m) => (
                <Badge key={m.key} variant="secondary">{m.label}</Badge>
              ))
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setEditing((v) => !v)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" disabled={isSelf || pending} onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t pt-3 space-y-3">
          <PermPicker isFull={isFull} perms={perms} onFull={setIsFull} onToggle={(m) => setPerms((p) => toggle(p, m))} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setIsFull(admin.is_full); setPerms(admin.perms as AdminModule[]); }}>Annuleren</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminManager({ admins, currentUserId }: { admins: Admin[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isFull, setIsFull] = useState(false);
  const [perms, setPerms] = useState<AdminModule[]>([]);

  function add() {
    setError(null);
    start(async () => {
      const res = await createSubAdmin({ email, password, isFull, perms });
      if (!res.ok) { setError(res.error); return; }
      setEmail(""); setPassword(""); setIsFull(false); setPerms([]);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Beheerder toevoegen</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">E-mailadres</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Tijdelijk wachtwoord</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 8 tekens" /></div>
        </div>
        <PermPicker isFull={isFull} perms={perms} onFull={setIsFull} onToggle={(m) => setPerms((p) => toggle(p, m))} />
        <Button size="sm" disabled={pending} onClick={add}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Toevoegen</Button>
        <p className="text-xs text-muted-foreground">De nieuwe beheerder logt in op /login met dit e-mailadres + wachtwoord en kan het daarna zelf wijzigen.</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Beheerders ({admins.length})</h2>
        {admins.map((a) => (
          <AdminRow key={a.user_id} admin={a} isSelf={a.user_id === currentUserId} setError={setError} />
        ))}
      </div>
    </div>
  );
}
