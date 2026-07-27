import { redirect } from "next/navigation";
import { getCrewByUserId } from "@crewops/core";
import { createClient } from "@/lib/supabase/server";

// Resolves the crew record for the signed-in portal user. Redirects to the
// portal login when there is no session, or when the auth user is not (yet)
// linked to a crew record. Call at the top of every portal page that needs
// the crew context. Reads run through the user's own session, so RLS scopes
// every query to this crew member.
export async function requirePortalCrew() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/portaal/login");

  const { data: crew } = await getCrewByUserId(
    supabase as unknown as Parameters<typeof getCrewByUserId>[0],
    user.id
  );

  if (!crew) redirect("/portaal/login?reden=niet-gekoppeld");

  return { user, crew, supabase };
}

export type PortalCrew = Awaited<ReturnType<typeof requirePortalCrew>>["crew"];
