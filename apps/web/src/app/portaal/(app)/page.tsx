import Link from "next/link";
import { CalendarDays, ClipboardList, User, MapPin, Calendar } from "lucide-react";
import { requirePortalCrew } from "@/lib/portal/session";
import { getUpcomingCrewAssignments } from "@crewops/core";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Crew Portaal" };

const links = [
  { href: "/portaal/beschikbaarheid", icon: CalendarDays, title: "Beschikbaarheid", desc: "Geef per dag door wanneer je kunt werken" },
  { href: "/portaal/toewijzingen", icon: ClipboardList, title: "Toewijzingen", desc: "Bekijk en bevestig je shifts" },
  { href: "/portaal/profiel", icon: User, title: "Profiel", desc: "Werk je contactgegevens bij" },
];

export default async function PortalHome() {
  const { crew, supabase } = await requirePortalCrew();

  const { data: upcoming } = await getUpcomingCrewAssignments(
    supabase as unknown as Parameters<typeof getUpcomingCrewAssignments>[0],
    crew.id,
    new Date().toISOString()
  );
  const next = upcoming?.[0] as
    | { id: string; role: string | null; events: { name: string; venue: string | null; start_datetime: string } | null }
    | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Hoi {crew.first_name} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {crew.crew_code} · Welkom in je crew portaal
        </p>
      </div>

      {(crew as unknown as { prospect_status?: string }).prospect_status === "hired" && (
        <Link
          href="/portaal/onboarding"
          className="block rounded-lg border-2 border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <p className="font-semibold text-primary">Maak je onboarding af →</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Vul je gegevens aan en upload je VOG, ID-bewijs en contract.
          </p>
        </Link>
      )}

      {next?.events && (
        <Link
          href="/portaal/toewijzingen"
          className="block rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Je volgende shift
          </p>
          <p className="mt-1 font-semibold">{next.events.name}</p>
          <div className="mt-1.5 space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {formatDateTime(next.events.start_datetime)}
            </p>
            {next.events.venue && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {next.events.venue}
              </p>
            )}
          </div>
        </Link>
      )}

      <div className="grid gap-3">
        {links.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
