import { hasPerm } from "@/lib/admin/perms";

// Shared helpers for the automation cron endpoints (/api/cron/*). Each endpoint
// can be driven two ways:
//   1. A scheduler (Vercel Cron, GitHub Actions, any curl) presenting the
//      CRON_SECRET as a Bearer token or ?key= query param.
//   2. A signed-in admin with the 'assignments' permission, so the same job can
//      be triggered manually from the UI (e.g. the Notificaties page button).

export type CronAuth =
  | { ok: true; via: "cron" | "admin" }
  | { ok: false; status: number; error: string };

export async function authorizeCron(request: Request): Promise<CronAuth> {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const keyParam = new URL(request.url).searchParams.get("key");
    if (bearer === secret || keyParam === secret) {
      return { ok: true, via: "cron" };
    }
  }

  // Fall back to an authenticated admin (manual trigger from the dashboard).
  if (await hasPerm("assignments")) {
    return { ok: true, via: "admin" };
  }

  return {
    ok: false,
    status: 401,
    error: secret
      ? "Ongeldige cron-sleutel en geen admin-sessie."
      : "CRON_SECRET niet ingesteld; log in als beheerder om handmatig te draaien.",
  };
}

/** Public base URL for building portal deep links in messages, or null. */
export function getAppBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

export function portalEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CREW_PORTAL_ENABLED === "true";
}

/** Pick the best delivery channel + address for a crew member (phone → WhatsApp,
 *  else email). Returns to=null when the crew has no contact details. */
export function contactFor(crew: { phone: string | null; email: string | null }): {
  channel: string;
  to: string | null;
} {
  if (crew.phone) return { channel: "whatsapp", to: crew.phone };
  if (crew.email) return { channel: "email", to: crew.email };
  return { channel: "whatsapp", to: null };
}

/** Probe whether the notifications table (migration 0011) exists yet. */
export async function notificationsTableExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<boolean> {
  try {
    const { error } = await admin.from("notifications").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

// nl-NL formatting in the venue's local time (events are stored as TIMESTAMPTZ).
const TZ = "Europe/Amsterdam";

export function formatDateNl(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short", day: "numeric", month: "short", timeZone: TZ,
  });
}

export function formatTimeNl(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit", minute: "2-digit", timeZone: TZ,
  });
}
