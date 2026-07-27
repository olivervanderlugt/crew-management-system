"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, CalendarPlus, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const items = [
  { href: "/portaal/beschikbaarheid", icon: CalendarDays, label: "Beschikbaarheid" },
  { href: "/portaal/open-diensten", icon: CalendarPlus, label: "Open diensten" },
  { href: "/portaal/toewijzingen", icon: ClipboardList, label: "Toewijzingen" },
  { href: "/portaal/profiel", icon: User, label: "Profiel" },
];

export function PortalNav({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/portaal/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/portaal" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white font-bold text-sm">
            F
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold">Crew Portaal</p>
            <p className="text-xs text-muted-foreground mt-0.5">{name}</p>
          </div>
        </Link>
        <button
          onClick={signOut}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Uitloggen</span>
        </button>
      </div>

      <nav className="flex gap-1 px-2 pb-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
