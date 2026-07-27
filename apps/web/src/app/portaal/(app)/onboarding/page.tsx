import { requirePortalCrew } from "@/lib/portal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CrewOnboardingForm, type OnboardingFields } from "@/components/portal/CrewOnboardingForm";
import type { Crew } from "@crewops/core";

export const metadata = { title: "Onboarding — Crew Portaal" };

export default async function PortalOnboardingPage() {
  const { crew } = await requirePortalCrew();
  const c = crew as unknown as Crew;

  // Crew can't read crew_documents via RLS — read their own via the service role.
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("crew_documents")
    .select("doc_type")
    .eq("crew_id", c.id);
  const hasDoc: Record<string, boolean> = {};
  for (const d of (docs ?? []) as { doc_type: string }[]) hasDoc[d.doc_type] = true;

  const initial: OnboardingFields = {
    phone: c.phone ?? "",
    street: c.street ?? "",
    postcode: c.postcode ?? "",
    home_city: c.home_city ?? "",
    date_of_birth: c.date_of_birth ?? "",
    nationality: c.nationality ?? "",
    emergency_contact_name: c.emergency_contact_name ?? "",
    emergency_contact_phone: c.emergency_contact_phone ?? "",
    iban: c.iban ?? "",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Onboarding</h1>
        <p className="text-sm text-muted-foreground">
          Vul je gegevens aan en upload je documenten. De planning controleert en rondt je onboarding daarna af.
        </p>
      </div>
      <CrewOnboardingForm initial={initial} hasDoc={hasDoc} />
    </div>
  );
}
