import { notFound } from "next/navigation";

// Phase-2 feature gate. With NEXT_PUBLIC_CREW_PORTAL_ENABLED unset, the whole
// /portaal/* tree behaves as if it does not exist. The middleware enforces the
// same flag for redirects; this is the defense-in-depth render-time guard.
export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_CREW_PORTAL_ENABLED !== "true") notFound();
  return <div className="min-h-screen bg-muted/30">{children}</div>;
}
