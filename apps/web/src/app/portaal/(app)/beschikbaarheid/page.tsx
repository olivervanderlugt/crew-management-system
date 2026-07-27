import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePortalCrew } from "@/lib/portal/session";
import { CrewAvailabilityEditor } from "@/components/portal/CrewAvailabilityEditor";
import type { AvailabilityStatus } from "@crewops/core";

export const metadata = { title: "Beschikbaarheid — Crew Portaal" };

export default async function PortalAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { crew, supabase } = await requirePortalCrew();
  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // RLS already scopes availability to this crew member; the explicit filter
  // keeps the query tight and the result small.
  const { data: rows } = await supabase
    .from("availability")
    .select("date, status")
    .eq("crew_id", crew.id)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  const initial: Record<string, AvailabilityStatus> = {};
  for (const r of (rows ?? []) as { date: string; status: AvailabilityStatus }[]) {
    initial[r.date] = r.status;
  }

  const label = new Date(year, month - 1, 1).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const navBtn = "flex h-8 w-8 items-center justify-center rounded-md border hover:bg-accent transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mijn beschikbaarheid</h1>
        <p className="text-sm text-muted-foreground">
          Tik op een dag om door beschikbaar / misschien / niet te wisselen.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Link href={`/portaal/beschikbaarheid?year=${prev.y}&month=${prev.m}`} className={navBtn} aria-label="Vorige maand">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="font-medium capitalize">{label}</span>
        <Link href={`/portaal/beschikbaarheid?year=${nextMonth.y}&month=${nextMonth.m}`} className={navBtn} aria-label="Volgende maand">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <CrewAvailabilityEditor year={year} month={month} initial={initial} />
    </div>
  );
}
