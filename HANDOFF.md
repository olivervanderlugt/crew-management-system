# Handoff — start here

You are picking up a working codebase on a fresh machine. This file tells you
what it is, how to get it running, what the ground rules are, and what is left.

Read this first, then `CLAUDE.md` (developer conventions), then `README.md`
(feature overview) and `SETUP.md` (installation detail).

---

## 1. What this is

A self-hostable planning system for organisations that staff events and
festivals. Admin side: crew records, availability grids, events, a matching
engine, assignments, hours, costing and payroll export. Crew side: a magic-link
self-service portal with availability, assignments and open shifts.

Turborepo monorepo, pnpm workspaces:

```
packages/core   framework-agnostic logic — types, Zod schemas, matching,
                costing, payroll, analytics, automation decisions, adapters
apps/web        Next.js 15 App Router — the app that actually runs
apps/mobile     Expo scaffold, proves core logic imports in React Native
supabase/       migrations, seed script, one-off admin/geocode helpers
docs/           deploy notes + privacy checklist
```

Backend is Supabase: Postgres, Auth, RLS, Storage. There is no separate API
server; Next.js route handlers and server actions talk to Supabase directly.

UI language is Dutch. Code comments and these developer docs are English.
Keep it that way — do not translate the UI.

---

## 2. Ground rule: this repo stays generic

This codebase was deliberately de-identified. It contains **no** organisation
name, client name, real person, real address, real project reference or
credential. Sample data is fictional ("Demostad", "Demo Producties", "Zomerfestival").

When you work on it:

- Never commit real crew data, client names, phone numbers, IBANs or BSNs.
- Never commit a Supabase project reference, URL or key. `.env.local` is
  gitignored and must stay that way.
- Import sources belong in `_reference/` — gitignored, never logged.
- If you add sample or test data, invent it.

---

## 3. Getting it running on this device

Prerequisites: Node >= 20, pnpm >= 9 (`corepack enable` pins the version from
`packageManager`), Git, and the Supabase CLI if you intend to run migrations.

```bash
pnpm install
cp -n .env.example .env.local   # PowerShell: if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill `.env.local` with your own Supabase project values — see the table in
`SETUP.md` for where each one lives in the Supabase dashboard. Then:

```bash
supabase link --project-ref <your-project-ref>
pnpm db:migrate        # supabase db push — applies supabase/migrations/
pnpm dev:web           # http://localhost:3000
```

Create an admin login (RLS requires `app_metadata.role = "admin"`):

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=<strong-password> pnpm db:create-admin
```

On Windows there is a double-click path: `Start App.bat` (self-healing launcher)
and `Stop App.bat`. `scripts/setup-shortcuts.ps1` puts shortcuts on the desktop.

### Verify before you trust the checkout

```bash
pnpm typecheck    # tsc --noEmit across core + web
pnpm test         # vitest, 64 unit tests in packages/core
```

Both were green at the time this repo was created. If either fails on a fresh
clone, fix that before starting feature work.

---

## 3a. First-session checklist

Work through this once, on the first machine that picks the project up. Tick
each line off before starting feature work.

- [ ] `pnpm install` completes without errors
- [ ] `pnpm typecheck` is clean
- [ ] `pnpm test` is green (64 unit tests in `packages/core`)
- [ ] `pnpm turbo run build --filter=@crewops/web` succeeds — this is what a
      deploy runs; placeholder Supabase env values are enough for it
- [ ] `pnpm --filter @crewops/web exec playwright install chromium` then
      `pnpm --filter @crewops/web e2e` — the Playwright smoke suite has not been
      exercised locally, only in the CI workflow definition
- [ ] `.env.local` exists, is filled with **your own** Supabase project, and is
      not tracked by git (`git check-ignore -v .env.local` should match)
- [ ] Decide on a `LICENSE` (see Open items)
- [ ] Before widening access to this repo, run an independent secret scanner
      over the full history as a second opinion, e.g.
      `gitleaks detect --no-git=false` or `trufflehog git file://.`

## 4. Conventions you must not break

- **`packages/core` exports logic only.** No React, no Tailwind classes, no
  shadcn/ui imports. Pure functions, types, schemas, query helpers. This is what
  lets `apps/mobile` reuse the matching engine.
- **Migrations are append-only.** Never edit a file in `supabase/migrations/`
  once it has been applied anywhere — add a new timestamped migration instead.
  `supabase/migrations-pending/` holds one migration deliberately not applied
  (BSN column) pending a legal decision; see `docs/privacy-crew-gegevens.md`.
- **`packages/core/src/db/database.types.ts` is generated.** Regenerate it after
  a migration rather than hand-editing.
- **Adding a table** has a 9-step checklist in `CLAUDE.md` — follow it, it keeps
  types, schemas, queries and exports in sync.
- **Feature flags gate anything that needs a migration or a paid key**, so the
  app never sends an unknown column or an unset credential. Default to off.

---

## 5. Feature flags and env

Everything is documented inline in `.env.example`. The ones that change what you
see in the UI:

| Flag | Effect |
|---|---|
| `NEXT_PUBLIC_CREW_PORTAL_ENABLED` | crew self-service portal at `/portaal` |
| `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` | notification composer + dispatch |
| `NEXT_PUBLIC_COSTING` | margin/wage-cost card and rate inputs (needs migration 0015) |
| `NEXT_PUBLIC_TIME_TRACKING` | hours registration + payroll export button |
| `AI_API_KEY` | natural-language crew search (Anthropic); empty = placeholder UI, zero cost |

Automation flags (`AUTO_OCCUPANCY`, `AUTO_CHECKIN`, `REMINDER_LEAD_DAYS`,
`DOCUMENT_EXPIRY_WARN_DAYS`) are described in `CLAUDE.md` under "Automatisering".

WhatsApp dispatch is **fail-closed**: it sends nothing unless
`NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true` *and* both `WHATSAPP_ACCESS_TOKEN` and
`WHATSAPP_PHONE_NUMBER_ID` are set. Leave it that way — do not "helpfully"
relax that check.

---

## 6. Cron endpoints

`/api/cron/reminders`, `/auto-checkin`, `/availability-reminder`,
`/document-expiry`, `/dispatch`. Schedules live in `vercel.json`; any external
scheduler hitting the same URLs works. Auth (`lib/automation/cron.ts`): a
scheduler presents `CRON_SECRET` as a Bearer token or `?key=`, or a signed-in
admin with the `assignments` permission triggers it manually from the
Notificaties page. All of them are idempotent via subject-dedupe.

---

## 7. Open items

Ranked, most useful first.

1. **No `LICENSE` file.** Without one the default is all-rights-reserved. Decide
   before sharing or reusing this.
2. **Email dispatch channel is unwired.** The outbox recognises `email` as a
   channel and reports it, but no provider (Resend/Postmark/…) is connected.
   It never crashes; it just does not send.
3. **`ShiftPlatformAdapter` and `CalComAdapter` are stubs** in
   `packages/core/src/adapters/index.ts` — typed interfaces, `not implemented`
   throws. Wire them via `external_id` + the `integration_sync` table.
4. **`apps/mobile` is a scaffold**, not an app. It renders matching-engine
   output to prove core is importable in React Native. No navigation, no auth.
5. **Migration 0006 (BSN) is held** in `supabase/migrations-pending/`. Do not
   apply it without a legal decision — see `docs/privacy-crew-gegevens.md`.
6. **Enum drift warning.** Migration 0001 defines the integration provider enum
   value as `shift_platform`. An older database may still carry a different
   value for that slot; a fresh database gets `shift_platform`. If you connect
   to a pre-existing database, check the enum before relying on it.
7. **Dev-only account switcher** at `apps/web/src/app/dev/` 404s when
   `NODE_ENV=production`, so it is inert on a real deploy. To remove it fully,
   delete `app/dev/`, `components/dev/`, the `<DevSwitcher/>` line in
   `app/layout.tsx` and the `/dev/` bypass in `middleware.ts`.

8. **The Playwright smoke suite has never been run on a real machine** — only
   declared in `.github/workflows/ci.yml`. Expect to fix small things the first
   time you run it.
9. **No independent secret scan has been run.** The tree was checked by hand and
   by pattern search and came back clean, but a dedicated scanner
   (gitleaks/trufflehog) has not been run over it. Worth doing before this repo
   is shared more widely — see the first-session checklist.

---

## 8. Deploying

`docs/DEPLOY.md` covers Vercel: import the repo, set the environment variables,
add the Vercel URL plus `/portaal/auth/callback` as a Supabase redirect URL.
The PWA manifest and service worker are already in place, so once hosted the app
installs on Windows, macOS, iOS and Android from one codebase — no separate
native build needed.
