/**
 * CrewOps crew-portal smoke-test helper.
 * Run: pnpm portal:test-link [email]   (default: crew.test@example.com)
 *
 * Produces a ready-to-use crew login URL WITHOUT needing SMTP, so the whole
 * portal flow (login → availability → assignments → profile) can be smoke-tested
 * before email delivery is configured. It:
 *   1. checks the Phase-2 migration is applied (crew.user_id must exist),
 *   2. ensures a test crew row (CREW-9999) with the given email,
 *   3. gives that crew an "invited" demo assignment on the next upcoming event,
 *   4. ensures an auth user for the email,
 *   5. generates a magic-link token and prints a direct /portaal/auth/callback
 *      URL (handled server-side by verifyOtp — no email, no PKCE verifier needed),
 *   6. makes sure NEXT_PUBLIC_CREW_PORTAL_ENABLED=true is in the root .env.local.
 *
 * Uses the service role key, so it bypasses RLS. Dev/staging use only.
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, readFileSync } from "fs";

// ─── Env (root .env.local is the single source of truth) ──────
function loadEnv(): Record<string, string> {
  try {
    const content = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
    const env: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]!] = (m[2] ?? "").trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
const SITE_URL = env["NEXT_PUBLIC_SITE_URL"] || "http://localhost:3000";
const EMAIL = (process.argv[2] || "crew.test@example.com").trim().toLowerCase();
const TEST_CREW_CODE = "CREW-9999";

class SetupError extends Error {}

async function main() {
  console.log("CrewOps Crew Portal — smoke-test link");
  console.log("=================================");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new SetupError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  console.log(`Email: ${EMAIL}`);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Migration applied? crew.user_id must exist.
  const probe = await admin.from("crew").select("user_id").limit(1);
  if (probe.error) {
    throw new SetupError(
      `The crew portal migration does not look applied (${probe.error.message}).\n` +
        `  Run:  pnpm db:migrate   (then  pnpm db:create-admin)  and try again.`
    );
  }

  // 2. Ensure the test crew row.
  const { data: crew, error: crewErr } = await admin
    .from("crew")
    .upsert(
      {
        crew_code: TEST_CREW_CODE,
        first_name: "Test",
        last_name: "Crew",
        email: EMAIL,
        home_city: "Amsterdam",
        seniority: "sitecrew",
        status: "active",
      },
      { onConflict: "crew_code" }
    )
    .select("id, crew_code")
    .single();
  if (crewErr || !crew) {
    throw new SetupError(`Could not create the test crew: ${crewErr?.message}`);
  }
  console.log(`✓ Test crew ready: ${crew.crew_code} (${crew.id})`);

  // 3. Use a dedicated, clearly-labeled demo event (never touches real events),
  //    so the test crew has something to confirm/decline. Re-used across runs and
  //    trivial to delete afterwards.
  const DEMO_EVENT_NAME = "Demo Event (smoke test)";
  let demoEvent = (
    await admin.from("events").select("id, name").eq("name", DEMO_EVENT_NAME).limit(1).maybeSingle()
  ).data;

  if (!demoEvent) {
    const start = new Date(Date.now() + 14 * 86_400_000);
    const end = new Date(start.getTime() + 8 * 3_600_000);
    const { data: created, error: evErr } = await admin
      .from("events")
      .insert({
        name: DEMO_EVENT_NAME,
        client: "CrewOps",
        venue: "Testlocatie",
        address: "Teststraat 1, Amsterdam",
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        crew_needed: 4,
        status: "planned",
      })
      .select("id, name")
      .single();
    if (evErr) console.warn(`  ! Could not create the demo event: ${evErr.message}`);
    else {
      demoEvent = created;
      console.log(`✓ Created demo event "${created!.name}"`);
    }
  } else {
    console.log(`✓ Demo event exists: "${demoEvent.name}"`);
  }

  if (demoEvent) {
    const { error: aErr } = await admin
      .from("assignments")
      .upsert(
        { event_id: demoEvent.id, crew_id: crew.id, role: "Sitecrew", status: "invited" },
        { onConflict: "event_id,crew_id" }
      );
    if (aErr) console.warn(`  ! Demo assignment skipped: ${aErr.message}`);
    else console.log(`✓ Demo assignment (invited) on "${demoEvent.name}"`);
  }

  // 4. Ensure an auth user exists for this email.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === EMAIL);
  if (!user) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      email_confirm: true,
    });
    if (cErr || !created.user) {
      throw new SetupError(`Could not create the auth user: ${cErr?.message}`);
    }
    user = created.user;
    console.log(`✓ Auth user created (${user.id})`);
  } else {
    console.log(`✓ Auth user exists (${user.id})`);
  }

  // 5. Generate a magic-link token and build a direct callback URL.
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
    options: { redirectTo: `${SITE_URL}/portaal/auth/callback` },
  });
  if (lErr || !link.properties?.hashed_token) {
    throw new SetupError(`Could not generate a login link: ${lErr?.message}`);
  }
  const loginUrl =
    `${SITE_URL}/portaal/auth/callback` +
    `?token_hash=${link.properties.hashed_token}&type=magiclink`;

  // 6. Make sure the feature flag is set in .env.local.
  ensureFlag();

  console.log("\n──────────────────────────────────────────────────────────");
  console.log("Open this URL in your browser to log in as the test crew:");
  console.log(`\n${loginUrl}\n`);
  console.log("(One-time use, expires in ~1h. Re-run this script for a fresh link.)");
  console.log("──────────────────────────────────────────────────────────");
}

function ensureFlag() {
  const FLAG = "NEXT_PUBLIC_CREW_PORTAL_ENABLED";
  // Already enabled in the active environment (e.g. via --env-file=.env.test.local)?
  // Then don't touch any file.
  if (process.env[FLAG] === "true") return;
  try {
    const content = readFileSync(".env.local", "utf8");
    if (new RegExp(`^${FLAG}=`, "m").test(content)) {
      if (!/^NEXT_PUBLIC_CREW_PORTAL_ENABLED=true\s*$/m.test(content)) {
        console.log(`  ! ${FLAG} is present but not "true" — set it to true in .env.local.`);
      }
      return;
    }
  } catch {
    /* no .env.local — fall through to append (creates it) */
  }
  // Append-only, UTF-8 without BOM (Node default) — never rewrites existing keys.
  appendFileSync(".env.local", `\n${FLAG}=true\n`, "utf8");
  console.log(`✓ Added ${FLAG}=true to .env.local (restart the dev server to pick it up)`);
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
