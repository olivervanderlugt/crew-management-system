import { NextResponse } from "next/server";
import type { AssignmentStatus } from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";
import { writeAudit, clientIp } from "@/lib/audit";
import { syncEventOccupancy } from "@/lib/automation/occupancy";

interface Assignment {
  crew_id: string;
  role?: string | null;
  status?: AssignmentStatus;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await hasPerm("assignments"))) {
      return NextResponse.json({ error: "Geen rechten om toe te wijzen" }, { status: 403 });
    }
    const { id: event_id } = await params;
    const body = await request.json();
    const { assignments } = body as { assignments: Assignment[] };

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json(
        { error: "assignments array is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const rows = assignments.map((a) => ({
      event_id,
      crew_id: a.crew_id,
      role: a.role ?? null,
      status: (a.status ?? "proposed") as AssignmentStatus,
    }));

    const { data, error } = await supabase
      .from("assignments")
      .insert(rows as never[])
      .select();

    if (error) {
      console.error("assignments insert error:", error);
      return NextResponse.json(
        { error: "Kon toewijzingen niet aanmaken" },
        { status: 500 }
      );
    }

    await writeAudit({
      action: "INSERT",
      table_name: "assignments",
      record_id: event_id,
      new_data: { event_id, assignments: rows },
      ip: clientIp(request),
    });

    // Auto-occupancy: newly added crew may push the event over its threshold.
    await syncEventOccupancy(supabase, event_id);

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("assignments POST error:", err);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
