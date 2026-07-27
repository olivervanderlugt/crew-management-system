// DEV-ONLY account switcher widget. Renders nothing in production builds, so it
// is safe to leave in. To remove entirely, delete this file + apps/web/src/app/dev/
// + the <DevSwitcher/> in app/layout.tsx + the "/dev/" line in middleware.ts.
export function DevSwitcher() {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-3 left-3 z-[9999] flex items-center gap-1 rounded-full border bg-card/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
      <span className="px-1 font-semibold text-muted-foreground">DEV</span>
      <a
        href="/dev/switch?to=admin"
        className="rounded-full px-2 py-0.5 font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Admin
      </a>
      <a
        href="/dev/switch?to=crew"
        className="rounded-full px-2 py-0.5 font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Crew
      </a>
    </div>
  );
}
