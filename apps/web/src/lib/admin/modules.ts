// Pure, client-safe admin-permission helpers (no server imports).
// Granular admin modules — must match the values used in RLS admin_has(...).
export type AdminModule = "crew" | "events" | "assignments" | "admins";

export const ADMIN_MODULES: { key: AdminModule; label: string; desc: string }[] = [
  { key: "crew", label: "Crew", desc: "Crewleden, documenten & beschikbaarheid bewerken" },
  { key: "events", label: "Events", desc: "Evenementen aanmaken en bewerken" },
  { key: "assignments", label: "Toewijzingen", desc: "Crew op shifts toewijzen" },
  { key: "admins", label: "Beheerders", desc: "Andere beheerders & rechten beheren" },
];

const MODULE_KEYS = ADMIN_MODULES.map((m) => m.key);

export type MyPerms = { isAdmin: boolean; isFull: boolean; perms: AdminModule[] };

export function cleanPerms(perms: string[]): AdminModule[] {
  return perms.filter((p): p is AdminModule => (MODULE_KEYS as string[]).includes(p));
}

export function can(p: MyPerms, module: AdminModule): boolean {
  return p.isFull || p.perms.includes(module);
}
