import { NextRequest, NextResponse } from "next/server";
import { getCrewByUserId } from "@crewops/core";
import type { AvailabilityStatus } from "@crewops/core";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: AvailabilityStatus[] = ["B", "M", "X", "W", "V"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Resolves the caller's own crew_id from their session. The crew_id is NEVER
// taken from the request body, so a crew member can only ever touch their own
// availability (RLS enforces the same as a second line of defense).
async function resolveCrewId(supabase: ServerClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: crew } = await getCrewByUserId(
    supabase as unknown as Parameters<typeof getCrewByUserId>[0],
    user.id
  );
  return crew?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const crewId = await resolveCrewId(supabase);
  if (!crewId) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { date, status } = (await req.json()) as { date?: string; status?: AvailabilityStatus };
  if (!date || !DATE_RE.test(date) || !status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { error } = await supabase
    .from("availability")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ crew_id: crewId, date, status } as any, { onConflict: "crew_id,date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const crewId = await resolveCrewId(supabase);
  if (!crewId) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { date } = (await req.json()) as { date?: string };
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Ongeldige invoer" }, { status: 400 });
  }

  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("crew_id", crewId)
    .eq("date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
