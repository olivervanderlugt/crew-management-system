import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sumWorkedHours, computeWorkedHours, formatHoursClock } from "@crewops/core";
import { Topbar } from "@/components/layout/topbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getMyAdminPerms } from "@/lib/admin/perms";

export const metadata: Metadata = { title: "Uren" };

const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

type Row = {
  id: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number | null;
  hours_approved: boolean | null;
  crew: { first_name: string; last_name: string; crew_code: string } | null;
  events: { name: string; start_datetime: string } | null;
};

export default async function UrenPage({ searchParams }: PageProps) {
  const me = await getMyAdminPerms();
  if (!me.isAdmin) notFound();

  const params = await searchParams;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  ).padStart(2, "0")}`;
  const from = params.from || monthStart;
  const to = params.to || monthEnd;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Uren" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {!TIME_TRACKING ? (
          <div className="max-w-lg rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            Urenregistratie staat uit. Pas migratie{" "}
            <code className="bg-muted px-1 rounded">20240101000013</code> toe en zet{" "}
            <code className="bg-muted px-1 rounded">NEXT_PUBLIC_TIME_TRACKING=true</code> om uren te
            registreren op events en hier samen te vatten.
          </div>
        ) : (
          <UrenReport from={from} to={to} />
        )}
      </div>
    </div>
  );
}

async function UrenReport({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();

  let rows: Row[] = [];
  let tableMissing = false;
  try {
    const { data, error } = await supabase
      .from("assignments")
      .select(
        "id, clock_in, clock_out, break_minutes, hours_approved, crew(first_name, last_name, crew_code), events!inner(name, start_datetime)"
      )
      .gte("events.start_datetime", `${from}T00:00:00`)
      .lte("events.start_datetime", `${to}T23:59:59`)
      .not("clock_in", "is", null);
    if (error) tableMissing = true;
    else rows = (data ?? []) as unknown as Row[];
  } catch {
    tableMissing = true;
  }

  if (tableMissing) {
    return (
      <div className="max-w-lg rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        De uren-kolommen bestaan nog niet op deze database. Pas migratie{" "}
        <code className="bg-muted px-1 rounded">20240101000013</code> toe met{" "}
        <code className="bg-muted px-1 rounded">supabase db push</code>.
      </div>
    );
  }

  // Aggregate per crew member.
  const byCrew = new Map<
    string,
    { name: string; code: string; shifts: number; hours: number; approved: number }
  >();
  for (const r of rows) {
    if (!r.crew) continue;
    const key = r.crew.crew_code;
    const cur = byCrew.get(key) ?? {
      name: `${r.crew.first_name} ${r.crew.last_name}`,
      code: r.crew.crew_code,
      shifts: 0,
      hours: 0,
      approved: 0,
    };
    cur.shifts += 1;
    cur.hours += computeWorkedHours(r);
    if (r.hours_approved) cur.approved += 1;
    byCrew.set(key, cur);
  }
  const summary = [...byCrew.values()].sort((a, b) => b.hours - a.hours);
  const grandTotal = sumWorkedHours(rows);

  return (
    <div className="space-y-4 max-w-3xl">
      <form method="get" action="/uren" className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Van</label>
          <Input type="date" name="from" defaultValue={from} className="h-8 w-40 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tot</label>
          <Input type="date" name="to" defaultValue={to} className="h-8 w-40 text-sm" />
        </div>
        <Button type="submit" size="sm" variant="outline" className="h-8">Toon</Button>
        <span className="ml-auto text-sm">
          Totaal: <span className="font-semibold tabular-nums">{formatHoursClock(grandTotal)}</span> uur
          <span className="text-muted-foreground"> · {rows.length} shifts</span>
        </span>
      </form>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 px-3 font-medium w-28 font-mono">Crew ID</th>
              <th className="py-2 px-3 font-medium">Naam</th>
              <th className="py-2 px-3 font-medium w-20 text-center">Shifts</th>
              <th className="py-2 px-3 font-medium w-24 text-center">Akkoord</th>
              <th className="py-2 px-3 font-medium w-24 text-right">Uren</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summary.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Geen geregistreerde uren in deze periode.</td></tr>
            )}
            {summary.map((s) => (
              <tr key={s.code} className="hover:bg-secondary/30">
                <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{s.code}</td>
                <td className="py-2 px-3 font-medium">{s.name}</td>
                <td className="py-2 px-3 text-center tabular-nums">{s.shifts}</td>
                <td className="py-2 px-3 text-center tabular-nums text-muted-foreground">{s.approved}/{s.shifts}</td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">{formatHoursClock(s.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
