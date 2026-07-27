import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ─── Permanent crew-portal test login (DEV ONLY) ─────────────
// A single, reusable link that always logs you in as the test crew
// (crew.test@example.com). Each visit mints a fresh magic-link token and
// hands it to the normal /portaal/auth/callback, so there is no expiry to worry
// about. Hard-disabled in production builds and limited to the one test account,
// so it is not a usable backdoor on a real deployment.
const TEST_EMAIL = "crew.test@example.com";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);

  // Don't silently clobber an existing ADMIN session (this footgun once logged
  // an admin into the crew portal). Use an incognito/private window to test crew
  // without losing the admin session.
  const current = await createClient();
  const { data: { user: currentUser } } = await current.auth.getUser();
  if (currentUser && (currentUser.app_metadata as { role?: string })?.role === "admin") {
    return new NextResponse(
      "Je bent momenteel ingelogd als ADMIN. Open deze crew-test-login in een incognito/privé-venster zodat je admin-sessie niet verloren gaat — of log eerst uit als admin.",
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const admin = createAdminClient();

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
    options: { redirectTo: `${url.origin}/portaal/auth/callback` },
  });

  if (error || !link.properties?.hashed_token) {
    return NextResponse.redirect(new URL("/portaal/login?reden=devlogin", url.origin));
  }

  // Reuse the normal callback (verifyOtp + crew-link + role), so behaviour is
  // identical to a real magic-link login.
  return NextResponse.redirect(
    new URL(
      `/portaal/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink`,
      url.origin
    )
  );
}
