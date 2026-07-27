"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { crewCsvRowSchema, type CrewCsvRow } from "@crewops/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileUp, Loader2, Upload } from "lucide-react";

type ParsedRow = {
  raw: Record<string, string>;
  parsed: CrewCsvRow | null;
  errors: string[];
  index: number;
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function validateRows(rawRows: Record<string, string>[]): ParsedRow[] {
  return rawRows.map((raw, index) => {
    const result = crewCsvRowSchema.safeParse(raw);
    if (result.success) {
      return { raw, parsed: result.data, errors: [], index };
    }
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    return { raw, parsed: null, errors, index };
  });
}

type ImportResult = {
  inserted: number;
  errors: Array<{ crew_code: string; message: string }>;
};

export default function ImportCrewPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const validRows = rows.filter((r) => r.parsed !== null);
  const invalidRows = rows.filter((r) => r.parsed === null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResult(null);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawRows = parseCSV(text);
      const parsed = validateRows(rawRows);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    setResult(null);

    try {
      const res = await fetch("/api/crew/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows.map((r) => r.parsed) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? "Import mislukt.");
      } else {
        setResult(json as ImportResult);
      }
    } catch (err) {
      setImportError("Netwerk- of serverfout.");
    } finally {
      setImporting(false);
    }
  };

  const CSV_HEADERS = [
    "crew_code", "first_name", "last_name", "phone",
    "home_city", "has_car", "has_license", "seniority",
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/crew">
            <ArrowLeft />
            Terug
          </Link>
        </Button>
        <h1 className="text-base font-semibold flex-1">CSV importeren</h1>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-4xl">
        {/* Upload zone */}
        {rows.length === 0 && (
          <Card>
            <CardContent className="p-6">
              <div
                className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <FileUp className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Sleep een CSV-bestand hierheen</p>
                <p className="text-xs text-muted-foreground mt-1">of klik om te bladeren</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Verwachte kolommen (komma-gescheiden):</p>
                <p className="font-mono bg-secondary rounded px-2 py-1 inline-block">
                  {CSV_HEADERS.join(", ")}
                </p>
                <p className="mt-1">has_car / has_license: <code>true</code>, <code>1</code> of <code>ja</code> voor ja</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result banner */}
        {result && (
          <div className={`rounded-md border px-4 py-3 text-sm ${
            result.errors.length === 0
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
              : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
          }`}>
            <span className="font-medium">{result.inserted} rijen geïmporteerd.</span>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.crew_code}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {importError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {importError}
          </div>
        )}

        {/* File loaded state */}
        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="secondary">{rows.length} rijen</Badge>
                {validRows.length > 0 && <Badge variant="success">{validRows.length} geldig</Badge>}
                {invalidRows.length > 0 && <Badge variant="destructive">{invalidRows.length} ongeldig</Badge>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRows([]); setFileName(null); setResult(null); }}
                >
                  Ander bestand
                </Button>
                <Button
                  size="sm"
                  disabled={validRows.length === 0 || importing}
                  onClick={handleImport}
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Upload />
                  Importeer {validRows.length} rijen
                </Button>
              </div>
            </div>

            {/* Preview table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Voorbeeld</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 px-3 w-8">#</th>
                        <th className="py-2 px-3">Crew ID</th>
                        <th className="py-2 px-3">Voornaam</th>
                        <th className="py-2 px-3">Achternaam</th>
                        <th className="py-2 px-3">Telefoon</th>
                        <th className="py-2 px-3">Woonplaats</th>
                        <th className="py-2 px-3">Auto</th>
                        <th className="py-2 px-3">Rijbewijs</th>
                        <th className="py-2 px-3">Seniority</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row) => (
                        <tr
                          key={row.index}
                          className={row.errors.length > 0 ? "bg-destructive/5" : ""}
                        >
                          <td className="py-1.5 px-3 text-muted-foreground">{row.index + 1}</td>
                          <td className="py-1.5 px-3 font-mono">{row.raw.crew_code ?? "—"}</td>
                          <td className="py-1.5 px-3">{row.raw.first_name ?? "—"}</td>
                          <td className="py-1.5 px-3">{row.raw.last_name ?? "—"}</td>
                          <td className="py-1.5 px-3 text-muted-foreground">{row.raw.phone || "—"}</td>
                          <td className="py-1.5 px-3 text-muted-foreground">{row.raw.home_city || "—"}</td>
                          <td className="py-1.5 px-3">{row.raw.has_car || "—"}</td>
                          <td className="py-1.5 px-3">{row.raw.has_license || "—"}</td>
                          <td className="py-1.5 px-3">{row.raw.seniority || "—"}</td>
                          <td className="py-1.5 px-3">
                            {row.errors.length > 0 ? (
                              <Badge variant="destructive" className="whitespace-nowrap">
                                {row.errors[0]}
                              </Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
