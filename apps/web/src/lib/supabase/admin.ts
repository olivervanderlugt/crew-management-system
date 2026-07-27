import { createClient } from "@supabase/supabase-js";
import type { Database } from "@crewops/core";

// Service-role Supabase client for trusted, server-only operations that must
// bypass RLS: looking up a crew record by email before sending a magic link,
// linking a crew row to its auth user on first login, and setting role
// metadata. NEVER import this into a client component — it holds the service
// role key and bypasses every row-level security policy.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
