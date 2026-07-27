import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { crewCsvRowSchema, type CrewCsvRow } from "@crewops/core";
import { hasPerm } from "@/lib/admin/perms";
import { z } from "zod";

const bodySchema = z.object({
  rows: z.array(z.unknown()),
});

export async function POST(req: NextRequest) {
  if (!(await hasPerm("crew"))) {
    return NextResponse.json({ error: "Geen rechten voor crew" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Verwacht { rows: [...] }." }, { status: 400 });
  }

  // Validate each row
  const validatedRows: CrewCsvRow[] = [];
  const parseErrors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const result = crewCsvRowSchema.safeParse(parsed.data.rows[i]);
    if (result.success) {
      validatedRows.push(result.data);
    } else {
      parseErrors.push({
        index: i,
        message: result.error.errors.map((e) => e.message).join(", "),
      });
    }
  }

  if (validatedRows.length === 0) {
    return NextResponse.json(
      { error: "Geen geldige rijen om te importeren.", parseErrors },
      { status: 422 }
    );
  }

  const supabase = await createServiceClient();

  // Upsert on crew_code
  const { data, error } = await (supabase.from("crew") as any)
    .upsert(
      validatedRows.map((row) => ({
        crew_code: row.crew_code,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone ?? null,
        home_city: row.home_city ?? null,
        has_car: row.has_car ?? false,
        has_license: row.has_license ?? false,
        seniority: row.seniority ?? "sitecrew",
        // Default status for new imports
        status: "active" as const,
      })),
      { onConflict: "crew_code" }
    )
    .select("id, crew_code");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inserted = data?.length ?? 0;
  const importErrors = parseErrors.map((e) => ({
    crew_code: `rij ${e.index + 1}`,
    message: e.message,
  }));

  return NextResponse.json({ inserted, errors: importErrors });
}
