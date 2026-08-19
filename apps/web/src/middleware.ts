import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Crew self-service portal (Phase 2). When disabled, /portaal/* does not exist.
const PORTAL_ENABLED = process.env.NEXT_PUBLIC_CREW_PORTAL_ENABLED === "true";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates with the auth server and returns current app_metadata,
  // so the role claim is reliable here even right after it is set.
  const { data: { user } } = await supabase.auth.getUser();
  const role = (user?.app_metadata?.role as string | undefined) ?? null;
  const isCrew = role === "crew";
  const isAdmin = role === "admin";

  const path = request.nextUrl.pathname;
  const isPortalPath = path === "/portaal" || path.startsWith("/portaal/");
  const isPortalPublic =
    path === "/portaal/login" ||
    path === "/portaal/dev-login" || // dev-only test login (route 404s in production)
    path.startsWith("/portaal/auth");
  const isAdminLogin = path.startsWith("/login");

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // Dev-only account switcher (/dev/*) — let it through regardless of session
  // so you can switch admin⇄crew. The route itself 404s in production.
  if (path.startsWith("/dev/")) return supabaseResponse;

  // The PWA offline fallback must be publicly cacheable (it's shown by the
  // service worker when the network is down, before any auth check can run).
  if (path === "/offline") return supabaseResponse;

  // Portal switched off → its routes are treated as non-existent.
  if (isPortalPath && !PORTAL_ENABLED) {
    return redirectTo("/login");
  }

  // The admin login screen is ALWAYS reachable so a signed-in user can switch
  // accounts. An already-signed-in admin skips it; a crew session may use it to
  // get back to admin — so a crew session is never trapped inside the portal.
  if (isAdminLogin) {
    if (user && !isCrew) return redirectTo("/dashboard");
    return supabaseResponse;
  }

  // ── Unauthenticated ──
  if (!user) {
    if (isPortalPublic) return supabaseResponse;        // crew login + magic-link callback
    if (isPortalPath) return redirectTo("/portaal/login");
    if (path === "/") return supabaseResponse;
    return redirectTo("/login");                        // protect the admin area
  }

  // ── Authenticated crew member ──
  if (isCrew) {
    // Crew live entirely inside the portal; bounce them out of the admin area
    // and off either login screen.
    if (isPortalPath && !isPortalPublic) return supabaseResponse;
    return redirectTo("/portaal");
  }

  // ── Authenticated admin ──
  // Allow-list, not fall-through. `role` is only ever "admin" or "crew"; an
  // account with neither (self-registered against the public anon key, or a
  // legacy row) previously reached the admin area and every /api/* route, and
  // was stopped only by RLS returning nothing. Defence in depth belongs here.
  if (!isAdmin) return redirectTo("/login");
  if (isPortalPath && !isPortalPublic) return redirectTo("/dashboard");
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js).*)",
  ],
};
