"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { crewDocumentTypeLabel, formatDate, isDocumentExpired, cn } from "@/lib/utils";
import type { CrewDocument, CrewDocumentType } from "@crewops/core";
import { Download, Trash2, FileText, Plus, Loader2, Paperclip } from "lucide-react";

const DOC_TYPES: CrewDocumentType[] = [
  "vog", "vca", "bhv", "ehbo", "drivers_license", "id_document", "insurance", "contract", "diploma", "other",
];

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export function CrewDocuments({ crewId, readOnly = false }: { crewId: string; readOnly?: boolean }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<CrewDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // add-form state
  const [adding, setAdding] = useState(false);
  const [docType, setDocType] = useState<CrewDocumentType>("vog");
  const [title, setTitle] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("crew_documents")
      .select("*")
      .eq("crew_id", crewId)
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as CrewDocument[]);
    setLoading(false);
  }, [crewId, supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError("Titel is verplicht."); return; }
    if (file && file.size > 10_000_000) { setError("Bestand is te groot (max 10 MB)."); return; }
    setAdding(true);
    let filePath: string | null = null;
    try {
      if (file) {
        filePath = `${crewId}/${crypto.randomUUID()}-${sanitizeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("crew-documents")
          .upload(filePath, file, { upsert: false });
        if (upErr) throw upErr;
      }
      const { error: insErr } = await supabase
        .from("crew_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          crew_id: crewId,
          doc_type: docType,
          title: title.trim(),
          file_path: filePath,
          issued_on: issuedOn || null,
          expires_on: expiresOn || null,
        } as any);
      if (insErr) throw insErr;
      // reset
      setTitle(""); setIssuedOn(""); setExpiresOn(""); setFile(null); setDocType("vog");
      await load();
    } catch (err) {
      // Roll back an uploaded file if the insert failed, to avoid orphaned blobs.
      if (filePath) await supabase.storage.from("crew-documents").remove([filePath]).catch(() => {});
      setError(err instanceof Error ? err.message : "Toevoegen mislukt.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDownload(doc: CrewDocument) {
    if (!doc.file_path) return;
    setBusyId(doc.id);
    const { data } = await supabase.storage.from("crew-documents").createSignedUrl(doc.file_path, 60);
    setBusyId(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function handleDelete(doc: CrewDocument) {
    if (!confirm(`"${doc.title}" verwijderen?`)) return;
    setBusyId(doc.id);
    setError(null);
    try {
      // Delete the record first (source of truth); a row delete failure is reported.
      const { error: delErr } = await supabase.from("crew_documents").delete().eq("id", doc.id);
      if (delErr) throw delErr;
      // Then remove the file best-effort — a leftover blob is harmless.
      if (doc.file_path) await supabase.storage.from("crew-documents").remove([doc.file_path]).catch(() => {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nog geen documenten of certificaten.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((doc) => {
            const expired = isDocumentExpired(doc.expires_on);
            return (
              <li key={doc.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{doc.title}</span>
                    <span className="text-xs rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">
                      {crewDocumentTypeLabel(doc.doc_type)}
                    </span>
                    {doc.file_path && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    {expired && <span className="text-xs text-destructive font-medium">verlopen</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {doc.issued_on && `Uitgereikt ${formatDate(doc.issued_on)}`}
                    {doc.issued_on && doc.expires_on && " · "}
                    {doc.expires_on && (
                      <span className={cn(expired && "text-destructive")}>Verloopt {formatDate(doc.expires_on)}</span>
                    )}
                  </p>
                </div>
                {doc.file_path && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" aria-label="Document downloaden" disabled={busyId === doc.id} onClick={() => handleDownload(doc)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!readOnly && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" aria-label="Document verwijderen" disabled={busyId === doc.id} onClick={() => handleDelete(doc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <form onSubmit={handleAdd} className="rounded-md border bg-secondary/30 p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document toevoegen</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as CrewDocumentType)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{crewDocumentTypeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs">Titel</Label>
              <Input id="doc-title" className="h-8" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="bijv. VOG 2026" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-issued" className="text-xs">Uitgereikt op</Label>
              <Input id="doc-issued" type="date" className="h-8" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-expires" className="text-xs">Verloopt op</Label>
              <Input id="doc-expires" type="date" className="h-8" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-file" className="text-xs">Bestand (optioneel — verzekeringsblad, VOG-verklaring…)</Label>
            <Input id="doc-file" type="file" className="h-8 text-xs file:mr-2 file:text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Toevoegen
          </Button>
        </form>
      )}
    </div>
  );
}
