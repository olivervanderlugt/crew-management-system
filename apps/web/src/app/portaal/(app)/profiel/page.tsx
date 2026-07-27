import { requirePortalCrew } from "@/lib/portal/session";
import { ProfileForm } from "@/components/portal/ProfileForm";
import { seniorityLabel } from "@/lib/utils";

export const metadata = { title: "Profiel — Crew Portaal" };

export default async function PortalProfilePage() {
  const { crew } = await requirePortalCrew();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Mijn profiel</h1>
        <p className="text-sm text-muted-foreground">
          Je contactgegevens. Naam, Crew ID en functie worden door de planning beheerd.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-1.5 text-sm">
        <p>
          <span className="text-muted-foreground">Naam: </span>
          {crew.first_name} {crew.last_name}
        </p>
        <p>
          <span className="text-muted-foreground">Crew ID: </span>
          <span className="font-mono">{crew.crew_code}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Functie: </span>
          {seniorityLabel(crew.seniority)}
        </p>
      </div>

      <ProfileForm
        initial={{
          phone: crew.phone,
          email: crew.email,
          home_city: crew.home_city,
          postcode: crew.postcode,
        }}
      />
    </div>
  );
}
