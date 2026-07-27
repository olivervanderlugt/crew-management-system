import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

// ─── Browser/server client factory ───────────────────────────
// The caller is responsible for passing appropriate credentials.
// On the server (service role): use SUPABASE_SERVICE_ROLE_KEY.
// On the browser (user session): use NEXT_PUBLIC_SUPABASE_ANON_KEY.
// Auth storage is intentionally left as an adapter point so mobile
// can swap in a platform-appropriate storage backend.

export function createSupabaseClient(
  url: string,
  key: string,
  options?: Parameters<typeof createClient>[2]
) {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    ...options,
  });
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
