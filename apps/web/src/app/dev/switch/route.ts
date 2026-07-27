import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ─── DEV-ONLY account switcher ───────────────────────────────
// One-click switch between the admin and the test-crew account. Mints a fresh
// session via the service role (no password) and lands on the right home.
//
// SAFE FOR LIVE: this whole route 404s when NODE_ENV=production, so it is inert
// on any real deployment. To remove it entirely later, delete:
//   - apps/web/src/app/dev/                (this route)
//   - apps/web/src/components/dev/         (the DevSwitcher widget)
//   - the <DevSwitcher/> line in app/layout.tsx
//   - the "/dev/" bypass line in middleware.ts
const ACCOUNTS: Record<string, { email: string; home: string }> = {
  admin: { email: "admin@example.com", home: "/dashboard" },
  crew: { email: "crew.test@example.com", home: "/portaal" },
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? "";
  const acct = ACCOUNTS[to];
  if (!acct) {
    return new NextResponse("Gebruik ?to=admin of ?to=crew", { status: 400 });
  }

  const adminApi = createAdminClient();
  const { data: link, error } = await adminApi.auth.admin.generateLink({
    type: "magiclink",
    email: acct.email,
    options: { redirectTo: `${url.origin}${acct.home}` },
  });
  if (error || !link.properties?.hashed_token) {
    return new NextResponse(
      `Kon niet inloggen als ${to}: ${error?.message ?? "geen token"}`,
      { status: 500 }
    );
  }

  // Establish the session in this browser (replaces the current one), then go home.
  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (vErr) {
    return new NextResponse(`Inloggen mislukt: ${vErr.message}`, { status: 500 });
  }

  return NextResponse.redirect(new URL(acct.home, url.origin));
}
