import { createClient, createServiceClient } from "@/lib/supabase/server";

// Write an AVG/GDPR audit entry. Best-effort: an audit failure must never break
// the underlying operation, so this swallows its own errors. Uses the service
// role to insert (bypassing RLS) but records the *signed-in* user as the actor.
//
// Note: this covers mutations that go through our service-role API routes
// (events, assignments). Crew create/edit currently save client-side via RLS
// and are not captured here — see the audit notes in docs for that gap.

// EXPORT covers read-only exports of personal/financial data (e.g. the payroll
// CSV) — logged for AVG transparency even though no row is mutated.
export type AuditAction = "INSERT" | "UPDATE" | "DELETE" | "EXPORT";

export async function writeAudit(entry: {
  action: AuditAction;
  table_name: string;
  record_id?: string | null;
  old_data?: unknown;
  new_data?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    const svc = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (svc.from("audit_log") as any).insert({
      user_id: user?.id ?? null,
      action: entry.action,
      table_name: entry.table_name,
      record_id: entry.record_id ?? null,
      old_data: entry.old_data ?? null,
      new_data: entry.new_data ?? null,
      ip_address: entry.ip ?? null,
    });
  } catch (err) {
    console.error("audit write failed:", err);
  }
}

/** Extract the client IP from a request's forwarding headers. */
export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}
