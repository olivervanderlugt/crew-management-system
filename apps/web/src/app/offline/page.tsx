import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline — CrewOps" };

// Static fallback shown by the service worker when a navigation fails offline.
// Kept dependency-free so it's always precached and renders without network.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Je bent offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Er is geen internetverbinding. De app heeft een verbinding nodig om planninggegevens te laden.
        Probeer het opnieuw zodra je weer online bent.
      </p>
    </div>
  );
}
