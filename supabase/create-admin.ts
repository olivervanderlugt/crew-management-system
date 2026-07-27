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
    console.log(`✓ Created admin user: ${data.user.email} (id: ${data.user.id})`);
  }

  console.log(`\nLogin at http://localhost:3000/login as ${ADMIN_EMAIL}`);
}

main().catch(console.error);
