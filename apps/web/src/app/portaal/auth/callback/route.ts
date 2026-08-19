import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// `_` and `%` are legal characters in an email local part, and ilike treats
// them as wildcards — so `a_b@example.com` matches the crew row for
// `axb@example.com`. Escaping keeps the case-insensitive match (addresses are
// stored as the user typed them) without the pattern hole.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}


// Magic-link landing. Establishes the session, links the auth user to its crew
// record on first login, and stamps the `crew` role claim so the middleware
// routes them into the portal. Supports both the PKCE (`code`) and the
// token-hash (`token_hash` + `type`) email-link formats.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const fail = (reden: string) =>
    NextResponse.redirect(new URL(`/portaal/login?reden=${reden}`, url.origin));

  const supabase = await createClient();

  let userId: string | null = null;
  let email: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("ongeldig");
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("ongeldig");
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } else {
    return fail("ongeldig");
  }

  if (!userId || !email) return fail("ongeldig");

  const admin = createAdminClient();

  // Link the crew record on first login (only when not yet linked) …
  const { data: linked } = await admin
    .from("crew")
    .update({ user_id: userId })
    .ilike("email", escapeLikePattern(email))
    .is("user_id", null)
    .select("id");

  // … or detect an existing link from a previous login (re-login).
  let crewLinked = (linked?.length ?? 0) > 0;
  if (!crewLinked) {
    const { data: already } = await admin
      .from("crew")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    crewLinked = (already?.length ?? 0) > 0;
  }

  if (!crewLinked) {
    // Authenticated, but no crew record owns this email → not a crew account.
    // Drop the session so they don't get stuck in a redirect loop.
    await supabase.auth.signOut();
    return fail("niet-gekoppeld");
  }

  await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "crew" } });

  return NextResponse.redirect(new URL("/portaal", url.origin));
}
