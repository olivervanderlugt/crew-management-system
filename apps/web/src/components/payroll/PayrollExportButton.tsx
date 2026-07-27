"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Downloads the approved-hours CSV for a date range. Defaults to the current
// month. The endpoint enforces admin rights + the time-tracking flag.
export function PayrollExportButton() {
  const now = new Date();
  const [from, setFrom] = useState(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(isoDay(now));
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const res = await fetch(`/api/payroll/export?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Export mislukt", (body as { error?: string }).error ?? "Kon de uren niet exporteren.");
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `uren-${from}_tot_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success("Export gestart", "Het CSV-bestand wordt gedownload.");
    } catch {
      toast.error("Export mislukt", "Kon de payroll-export niet uitvoeren.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="payroll-from" className="text-xs">Van</Label>
        <Input id="payroll-from" type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="payroll-to" className="text-xs">Tot en met</Label>
        <Input id="payroll-to" type="date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={run}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Uren exporteren (CSV)
      </Button>
    </div>
  );
}
