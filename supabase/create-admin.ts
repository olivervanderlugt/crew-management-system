/**
 * Creates (or repairs) an admin user in Supabase Auth.
 * Run: ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm db:create-admin
 * Safe to run multiple times (checks if user exists first).
 *
 * Credentials come from the environment on purpose — never hardcode them here,
 * this file is version-controlled.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "Missing ADMIN_EMAIL or ADMIN_PASSWORD.\n" +
      "Usage: ADMIN_EMAIL=jij@example.com ADMIN_PASSWORD=<sterk-wachtwoord> pnpm db:create-admin"
  );
  process.exit(1);
}

async function main() {
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users.find((u) => u.email === ADMIN_EMAIL);

  let userId: string;

  if (existingUser) {
    // Backfill the admin role claim. Phase-2 RLS requires
    // app_metadata.role = 'admin', so an account created before this change
    // must be updated or it loses access.
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      app_metadata: { role: "admin" },
    });
    if (error) {
      console.error("✗ Failed to set admin role:", error.message);
      process.exit(1);
    }
    userId = existingUser.id;
    console.log(`✓ Admin user ${ADMIN_EMAIL} already exists — role claim ensured`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
    if (error) {
      console.error("✗ Failed to create admin user:", error.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`✓ Created admin user: ${data.user.email} (id: ${data.user.id})`);
  }

  // The role claim only says "is an admin at all". Write permission per module
  // comes from admin_permissions (migration 0007), and that migration backfills
  // only the admins that existed when it ran. Without this, a freshly created
  // admin can read everything and change nothing — the UI shows
  // "Alleen-lezen — geen rechten om te bewerken" on every page.
  const { error: permError } = await admin
    .from("admin_permissions")
    .upsert(
      { user_id: userId, email: ADMIN_EMAIL, is_full: true },
      { onConflict: "user_id" }
    );

  if (permError) {
    // Migration 0007 not applied yet is a legitimate state, not a failure.
    const missingTable = /relation .*admin_permissions.* does not exist/i.test(
      permError.message
    );
    if (missingTable) {
      console.log("  ! admin_permissions not found — apply migration 0007 for write access");
    } else {
      console.error("✗ Failed to grant full admin permissions:", permError.message);
      process.exit(1);
    }
  } else {
    console.log("✓ Granted full admin permissions (all modules)");
  }

  console.log(`\nLogin at http://localhost:3000/login as ${ADMIN_EMAIL}`);
}

main().catch(console.error);
