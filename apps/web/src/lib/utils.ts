import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AvailabilityStatus } from "@crewops/core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function availabilityLabel(status: AvailabilityStatus): string {
  const labels: Record<AvailabilityStatus, string> = {
    B: "Beschikbaar",
    M: "Misschien",
    X: "Niet beschikbaar",
    W: "Status W",
    V: "Status V",
  };
  return labels[status];
}

export function availabilityCellClass(status: AvailabilityStatus | null | undefined): string {
  if (!status) return "avail-cell avail-cell-empty";
  return `avail-cell avail-cell-${status}`;
}

export function seniorityLabel(s: string): string {
  const labels: Record<string, string> = {
    sitecrew: "Sitecrew",
    senior: "Senior",
    teamlead: "Teamleider",
  };
  return labels[s] ?? s;
}

export function statusLabel(s: string): string {
  const labels: Record<string, string> = {
    active: "Actief",
    inactive: "Inactief",
    prospect: "Prospect",
    draft: "Concept",
    planned: "Gepland",
    confirmed: "Bevestigd",
    done: "Afgerond",
    cancelled: "Geannuleerd",
    proposed: "Voorgesteld",
    invited: "Uitgenodigd",
    declined: "Afgewezen",
    checked_in: "Ingecheckt",
  };
  return labels[s] ?? s;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isoDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function prospectStatusLabel(s: string): string {
  const labels: Record<string, string> = {
    new: "Nieuw",
    contacted: "Gecontacteerd",
    intake_planned: "Intake gepland",
    intake_done: "Intake gedaan",
    hired: "Aangenomen",
    rejected: "Afgewezen",
  };
  return labels[s] ?? s;
}

export function crewDocumentTypeLabel(t: string): string {
  const labels: Record<string, string> = {
    vog: "VOG",
    vca: "VCA",
    bhv: "BHV",
    ehbo: "EHBO",
    drivers_license: "Rijbewijs",
    id_document: "ID-bewijs",
    insurance: "Verzekeringsblad",
    contract: "Contract",
    diploma: "Diploma",
    other: "Overig",
  };
  return labels[t] ?? t;
}

// Mask a sensitive account number (IBAN) for display — show only the last 4.
export function maskIban(iban: string | null | undefined): string {
  if (!iban) return "—";
  const clean = iban.replace(/\s+/g, "");
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 2)} •••• ${clean.slice(-4)}`;
}

// True when a document is expired (expires_on strictly before today).
// Compares ISO date strings (YYYY-MM-DD) — timezone-agnostic, date-only.
export function isDocumentExpired(expiresOn: string | null | undefined): boolean {
  if (!expiresOn) return false;
  return expiresOn < isoDate(new Date());
}
