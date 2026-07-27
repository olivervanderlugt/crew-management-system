import { requirePortalCrew } from "@/lib/portal/session";
import { getUpcomingCrewAssignments } from "@crewops/core";
import { AssignmentList, type PortalAssignment } from "@/components/portal/AssignmentList";

export const metadata = { title: "Toewijzingen — Crew Portaal" };

type Row = {
  id: string;
  status: string;
  role: string | null;
  events: {
    name: string;
    venue: string | null;
    address: string | null;
    start_datetime: string;
    end_datetime: string;
  } | null;
};

export default async function PortalAssignmentsPage() {
  const { crew, supabase } = await requirePortalCrew();

  const { data } = await getUpcomingCrewAssignments(
    supabase as unknown as Parameters<typeof getUpcomingCrewAssignments>[0],
    crew.id,
    new Date().toISOString()
  );

  const assignments: PortalAssignment[] = ((data ?? []) as unknown as Row[]).map((a) => ({
    id: a.id,
    status: a.status,
    role: a.role,
    event: a.events
      ? {
          name: a.events.name,
          venue: a.events.venue,
          address: a.events.address,
          start_datetime: a.events.start_datetime,
          end_datetime: a.events.end_datetime,
        }
      : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mijn toewijzingen</h1>
        <p className="text-sm text-muted-foreground">
          Aankomende shifts. Bevestig of zeg af zodra je bent uitgenodigd.
        </p>
      </div>
      <AssignmentList assignments={assignments} />
    </div>
  );
}
