"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardCheck,
  CalendarDays,
  Zap,
  Map,
  BarChart3,
  Clock,
  Building2,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const baseNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/crew", icon: Users, label: "Crew" },
  { href: "/prospects", icon: UserPlus, label: "Prospects" },
  { href: "/onboarding", icon: ClipboardCheck, label: "Onboarding" },
  { href: "/beschikbaarheid", icon: CalendarDays, label: "Beschikbaarheid" },
  { href: "/events", icon: Zap, label: "Events" },
  { href: "/kaart", icon: Map, label: "Kaart" },
  { href: "/inzichten", icon: BarChart3, label: "Inzichten" },
];

// Time-tracking (worked hours) is gated behind this flag until migration 0013
// is applied. NEXT_PUBLIC_* is inlined at build time, so this is safe here.
const TIME_TRACKING = process.env.NEXT_PUBLIC_TIME_TRACKING === "true";

const STORAGE_KEY = "crewops-sidebar-collapsed";

export function Sidebar({
  canManageAdmins = false,
  canEvents = false,
}: {
  canManageAdmins?: boolean;
  canEvents?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Collapsed state, persisted across navigations/sessions. We start from the
  // server-rendered default (expanded) and sync from localStorage after mount
  // to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const nav = [
    ...baseNav,
    ...(TIME_TRACKING ? [{ href: "/uren", icon: Clock, label: "Uren" }] : []),
    ...(canEvents ? [{ href: "/klanten", icon: Building2, label: "Klanten" }] : []),
    ...(canManageAdmins ? [{ href: "/beheerders", icon: Shield, label: "Beheerders" }] : []),
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo / Brand + collapse toggle */}
      <div
        className={cn(
          "flex h-14 items-center border-b",
          collapsed ? "justify-center px-2" : "gap-2 px-4"
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand text-white font-bold text-sm">
          F
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">CrewOps</p>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">Crew &amp; eventplanning</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Menu inklappen"
            aria-label="Menu inklappen"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <ul className="space-y-0.5">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-2" : "gap-2.5 px-3",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t px-2 py-3 space-y-0.5">
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Menu uitklappen"
            aria-label="Menu uitklappen"
            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          </button>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? "Uitloggen" : undefined}
          className={cn(
            "flex w-full items-center rounded-md py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed ? "justify-center px-2" : "gap-2.5 px-3"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Uitloggen"}
        </button>
      </div>
    </aside>
  );
}
