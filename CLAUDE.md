# CrewOps — Developer Notes

## Project overview
Self-hostable planning system for organisations that staff events and festivals:
crew records, availability grids, event planning, matching, time tracking, and a
crew self-service portal. No organisation-specific data lives in this repo.

## Monorepo structure

```
crew-management-system/
├── apps/
│   ├── web/          ← Next.js 15 (App Router) — the working MVP
│   └── mobile/       ← Expo scaffold (Phase 2 / future)
├── packages/
│   └── core/         ← Shared TypeScript: types, schemas, matching engine, DB queries, adapters, AI
├── supabase/
│   ├── migrations/   ← Versioned SQL (apply with: supabase db push)
│   └── seed.ts       ← Import from _reference/ CSVs (run: pnpm db:seed)
└── _reference/       ← NEVER IN GIT — personal data (crew names, phones)
```

## Critical boundary: logic vs UI
`packages/core` exports **logic only**. Never import shadcn/ui, Tailwind classes, or React components from core.
- Types, Zod schemas, matching engine, DB queries, AI service, adapter interfaces → `packages/core`
- React components, Tailwind classes, Next.js pages → `apps/web`
- Mobile: imports core logic, uses React Native UI primitives

## How to run locally
```bash
# 1. Copy env — ONLY if .env.local doesn't exist yet (don't clobber real keys).
#    -n = no-clobber. Windows: if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
cp -n .env.example .env.local  # then fill in values; edit this file directly afterwards

# 2. Install
pnpm install

# 3. Apply migrations
pnpm db:migrate  # = supabase db push (needs SUPABASE_ACCESS_TOKEN)

# 4. Seed data
pnpm db:seed     # imports _reference/crew.csv + _reference/availability.csv

# 5. Start web dev server
pnpm dev:web     # http://localhost:3000

# 6. Run tests
pnpm test
```

## Adding a new table
1. Create `supabase/migrations/<timestamp>_<name>.sql`
2. Add `CREATE TABLE` + indexes + trigger for `updated_at` + RLS policy
3. Run `supabase db push`
4. Add Row type to `packages/core/src/db/database.types.ts`
5. Add domain type to `packages/core/src/types/index.ts`
6. Add Zod schema to `packages/core/src/schemas/index.ts`
7. Add query functions to `packages/core/src/db/queries.ts`
8. Export from `packages/core/src/index.ts`
9. Build UI pages in `apps/web/src/app/(dashboard)/`

## Adding a new adapter
1. Define interface in `packages/core/src/adapters/index.ts`
2. Implement stub class with typed TODOs
3. Wire via `external_id` + `integration_sync` table
4. Document assumptions in README under "Integration adapters"

## Adding an AI feature
1. Write the function in `packages/core/src/ai/index.ts` using `AIService` interface
2. Gate behind `service.isAvailable()` — returns false when `AI_API_KEY` is missing
3. In `apps/web`: show a "Functie beschikbaar — API-key vereist" placeholder when not available

## Availability codes
| Code | Meaning | DB Enum |
|------|---------|---------|
| B | Beschikbaar | `B` |
| M | Misschien | `M` |
| X | Niet beschikbaar | `X` |
| W | Projectspecifiek | `W` |
| V | Projectspecifiek | `V` |

W and V are project-specific codes carried over verbatim from imported source
sheets so no information is lost. Do NOT assign them meaning in code — decide
per deployment what they stand for.

## Matching engine
Location: `packages/core/src/matching/index.ts`
- Pure function, no I/O, fully unit-tested
- Weights: availability 40%, skill match 25%, transport 15%, seniority 10%, workload balance 10%
- X availability → crew excluded (score = 0, shown at bottom of results)
- Conflict-aware: pass `busy_crew_ids` (crew on a time-overlapping event) → excluded with reason "Al ingepland op een overlappend event". The match API resolves overlaps and feeds them in.
- Tests: `packages/core/src/matching/matching.test.ts`

## Automatisering
Pure decisions live in `packages/core/src/automation/` (unit-tested); the DB/cron wiring lives in `apps/web`.

**Auto-bezettingsstatus** — `computeOccupancyStatus()`. After any assignment change, the event flips `planned → confirmed` once enough crew are secured (confirmed/checked_in ≥ crew_needed) and back `confirmed → planned` on drop-out. Only that pair is automated; draft/done/cancelled are never touched. Wired in `lib/automation/occupancy.ts` and called from the assignment POST/PATCH routes and the portal respond action. Flag: `AUTO_OCCUPANCY` (default on; `false` disables).

**Conflict-bewuste matching** — see Matching engine above.

**Herinneringen** — `GET/POST /api/cron/reminders` enqueues "X dagen vóór event" messages into the `notifications` outbox (requires **migratie 0011**; degrades gracefully if missing). Idempotent via subject-dedupe. Lead days: `REMINDER_LEAD_DAYS` (e.g. `7,3,1`, default `3`). Includes a 1-tik-bevestigen deep link when `NEXT_PUBLIC_APP_URL` is set and the portal is enabled. Admins can also trigger it from the Notificaties page.

**Auto checked-in** — `GET/POST /api/cron/auto-checkin` flips `confirmed → checked_in` after shift end, bounded to `AUTO_CHECKIN_LOOKBACK_HOURS` (default 48) so it never back-fills old no-shows. Flag: `AUTO_CHECKIN`.

**Maandelijkse beschikbaarheid-herinnering** — `GET/POST /api/cron/availability-reminder` asks all active crew to fill in next month's availability (subject embeds the month → once per crew per month). Requires migratie 0011.

**Certificaat-vervaldatum-signalering** — `GET/POST /api/cron/document-expiry` flags `crew_documents` (migratie 0005) that are expired or expiring within `DOCUMENT_EXPIRY_WARN_DAYS` (default 30) for **active** crew, and enqueues a "certificaat verloopt/is verlopen" message into the `notifications` outbox (requires migratie 0011). Idempotent: the subject embeds the document title + its expiry date, so a renewed certificate (new `expires_on`) gets a fresh reminder while an unchanged one is deduped. Pure decisions live in `packages/core/src/automation/` (`documentExpiryStatus`, `documentExpirySubject`, `documentExpiryMessage`, `parseWarnDays`). The Inzichten-tab surfaces the same list ("Certificaten die aandacht nodig hebben"), and admins can trigger the cron from the Notificaties page.

**Marge & loonkosten** — `computeEventCosting()` + `eventDurationHours()` in `packages/core/src/costing/` (pure, unit-tested) turn `crew.hourly_cost` (wage cost) and `events.charge_rate` (client rate per crew-hour) into revenue/cost/margin per event, counting only secured crew. Crew without an explicit `hourly_cost` fall back to `DEFAULT_HOURLY_COST_BY_SENIORITY` (flagged as an estimate). Backed by **migratie 0015** and gated by `NEXT_PUBLIC_COSTING` (off until applied): the event-detail page shows a "Marge & loonkosten" card, and the event/crew edit forms expose the rate inputs only when the flag is on (so no unknown column is ever sent to the DB).

**WhatsApp-dispatch** — `WhatsAppAdapter` (Meta Cloud API) in `packages/core/src/adapters/` now has a real `sendMessage`/`sendBulk` (text by default; sends an approved template when `message.template` is set, required for cold outbound past the 24h window). `GET/POST /api/cron/dispatch` drains the `notifications` outbox: queued rows → send → mark `sent`/`failed` (+`sent_at`/`error`). **Fail-closed** via `lib/automation/dispatch.ts` → `getDispatcher()`: sends NOTHING unless `NEXT_PUBLIC_NOTIFICATIONS_ENABLED=true` AND `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` are set (optional `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE_NAME`). Scheduled every 10 min in `vercel.json`; admins can also trigger it from the Notificaties page ("Verzend wachtrij nu", shown only when dispatch is enabled). Email channel is recognised but not yet wired (reported, never crashes).

**Payroll-export** — `buildPayrollCsv()` + `payrollLineAmount()` in `packages/core/src/payroll/` (pure, unit-tested) format approved worked-hours rows into a semicolon-delimited CSV (Crew-ID;Naam;IBAN;Event;Datum;Uren;Uurtarief;Bedrag) for Nmbrs/Loket/AFAS/Excel. `GET /api/payroll/export?from=&to=` streams it (admin-only, requires migratie 0013; UTF-8 BOM for Excel; `Uurtarief`/`Bedrag` filled only when `NEXT_PUBLIC_COSTING` is on). The Inzichten-tab hours card hosts the date-range export button (behind `NEXT_PUBLIC_TIME_TRACKING`). Only `hours_approved` rows are exported.

**Slimme open-diensten** — `open-diensten` sorts by availability then distance (`distanceKm`, haversine on geocoded coords) and defaults the list filter to "beschikbaar & dichtbij" (≤ 50 km; unknown distance never hidden).

Cron auth (`lib/automation/cron.ts`): a scheduler presents `CRON_SECRET` as a Bearer token (or `?key=`), or a signed-in admin with the `assignments` permission triggers manually. Schedules are declared in `vercel.json` → `crons`. Any external scheduler hitting the same URLs works too.

## Do NOT touch without a reason
- `supabase/migrations/` — once applied, do not edit. Add new migrations instead.
- `packages/core/src/db/database.types.ts` — auto-generated; update by regenerating types after migration
- `_reference/` — personal data; never commit, never log

## Not built yet
- Email dispatch channel (recognised in the outbox, not wired to a provider)
- ShiftPlatform / Cal.com live adapter wiring (stubs only)
- Native mobile app (`apps/mobile` is an Expo scaffold)

The crew self-service portal and WhatsApp dispatch **are** built; both sit behind
flags (`NEXT_PUBLIC_CREW_PORTAL_ENABLED`, `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`).

## Credential safety
- `.env.local`, `.env`, `.env.*.local` in `.gitignore`
- `_reference/` in `.gitignore`
- Service role key: server-side only, never client bundle
- Audit log in DB for AVG/GDPR transparency
