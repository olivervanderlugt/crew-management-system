import Link from "next/link";
import { requirePortalCrew } from "@/lib/portal/session";
import { OneTapConfirm, type ConfirmShift } from "@/components/portal/OneTapConfirm";

export const metadata = { title: "Bevestigen — Crew Portaal" };

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

// Deep-link target for one-tap confirm from a reminder. The reader's own session
// (RLS) scopes the lookup, so a crew member can only ever load their own
// assignment here. requirePortalCrew redirects to login first when needed.
export default async function ConfirmAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const { supabase } = await requirePortalCrew();

  const { data } = await supabase
    .from("assignments")
    .select("id, status, role, events(name, venue, address, start_datetime, end_datetime)")
    .eq("id", assignmentId)
    .maybeSingle();

  const row = data as unknown as Row | null;

  if (!row) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Dienst niet gevonden</h1>
        <p className="text-sm text-muted-foreground">
          Deze toewijzing bestaat niet (meer) of hoort niet bij jouw account.
        </p>
        <Link href="/portaal/toewijzingen" className="text-sm underline">
          Naar mijn toewijzingen
        </Link>
      </div>
    );
  }

  const shift: ConfirmShift = {
    id: row.id,
    status: row.status,
    role: row.role,
    event: row.events
      ? {
          name: row.events.name,
          venue: row.events.venue,
          address: row.events.address,
          start_datetime: row.events.start_datetime,
          end_datetime: row.events.end_datetime,
        }
      : null,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Bevestig je komst</h1>
        <p className="text-sm text-muted-foreground">Eén tik en de planning weet dat je er bent.</p>
      </div>
      <OneTapConfirm shift={shift} />
    </div>
  );
}
