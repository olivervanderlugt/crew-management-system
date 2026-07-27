import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { MonthNav } from "@/components/availability/MonthNav";
import type { AvailabilityStatus, Crew } from "@crewops/core";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function BeschikbaarheidPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Default to current month
  const now = new Date();
  const year = parseInt(params.year ?? String(now.getFullYear()), 10);
  const month = parseInt(params.month ?? String(now.getMonth() + 1), 10);

  const supabase = await createClient();

  // 1. All active crew ordered by last name
  const { data: crewData, error: crewError } = await supabase
    .from("crew")
    .select("id, crew_code, first_name, last_name")
    .eq("status", "active")
    .order("last_name");

  if (crewError) {
    return (
      <div className="flex flex-col h-full">
        <Topbar title="Beschikbaarheid" />
        <div className="p-6 text-destructive text-sm">Fout bij laden crew: {crewError.message}</div>
      </div>
    );
  }

  const crew = (crewData ?? []) as Pick<Crew, "id" | "crew_code" | "first_name" | "last_name">[];

  // 2. Availability for the selected month PLUS 3 days either side, so the grid
  //    can show the tail of the previous month and the head of the next month
  //    (handy for multi-day jobs that straddle a month boundary).
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rangeStart = iso(new Date(year, month - 1, 1 - 3));
  const rangeEnd = iso(new Date(year, month - 1, new Date(year, month, 0).getDate() + 3));

  const { data: availData, error: availError } = await supabase
    .from("availability")
    .select("crew_id, date, status")
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

  if (availError) {
    return (
      <div className="flex flex-col h-full">
        <Topbar title="Beschikbaarheid" />
        <div className="p-6 text-destructive text-sm">Fout bij laden beschikbaarheid: {availError.message}</div>
      </div>
    );
  }

  // 3. Build availMap: crew_id → date → status
  const availMap: Record<string, Record<string, string>> = {};
  const rows = availData as { crew_id: string; date: string; status: AvailabilityStatus }[];
  for (const row of rows) {
    if (!availMap[row.crew_id]) availMap[row.crew_id] = {};
    availMap[row.crew_id]![row.date] = row.status;
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Beschikbaarheid"
        actions={<MonthNav year={year} month={month} label={monthLabel} />}
      />

      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Laden…</div>}>
        <AvailabilityGrid
          crew={crew}
          availMap={availMap}
          year={year}
          month={month}
        />
      </Suspense>
    </div>
  );
}
