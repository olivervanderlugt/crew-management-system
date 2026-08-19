# TODO — next session

> **Read these three, in this order: `HANDOFF.md` → `TODO.md` → `VERBETERPLAN.md`.**
> You are on **2 of 3**. If you have not read `HANDOFF.md`, go back — it says
> what this project is, how to run it, and which ground rules must not be
> broken. `VERBETERPLAN.md` comes after this one: it carries the findings from
> seven code reviews, and it assumes you already know the goal order below.

Written 2026-08-19, after the `HANDOFF.md` first-session checklist was completed
(install, typecheck, 64 tests, web build, Playwright 3/3, gitleaks — all green).

Nothing below has been changed. This is the analysis output, ranked by goal.
Everything cites a real `file:line` that was read. Effort: **S** ≈ minutes,
**M** ≈ an hour, **L** ≈ half a day or more.

**Order matters.** Goal 1 makes the app tell the truth about money and people.
Goal 2 makes it safe to hand a login to crew. The rest is polish. If you only
have one session, do Goal 1.

---

## Goal 0 — before you touch anything

- [x] **`LICENSE` — decided 2026-08-19: deliberately none.** The repo stays
      all-rights-reserved by default. Do not add one without asking; do not
      "helpfully" drop in MIT. Revisit only if the repo is ever shared or sold.
- [ ] **Fill `.env.local` with a real Supabase project.** It currently holds
      placeholders, enough to build and typecheck but not to run. **S**
- [ ] **Check the Supabase dashboard: is email signup enabled?** It changes the
      severity of `#2.1` below from "hardening" to "urgent". **S**

---

## Goal 1 — make the planner trust the numbers

These are wrong answers, not crashes. They look fine and quietly mislead.

> **2026-08-19: the app was run against a real database for the first time**
> (local Supabase, 100 seeded crew). Two bugs surfaced immediately that no
> amount of reading had found, because neither exists on an empty database and
> neither reports an error. Both are **fixed**. They are left here because the
> pattern is the lesson: green tests and a clean typecheck said nothing about
> either.
>
> - [x] **The availability grid silently lost 53 of 80 crew.**
>       `(dashboard)/beschikbaarheid/page.tsx:47` fetched the whole month in one
>       request. PostgREST caps a response at 1000 rows; one month of one crew
>       member is ~37 rows, so it broke at roughly 27 crew — request succeeds,
>       everyone past the cap renders blank. The per-day totals under the grid
>       were wrong with it: 25/16/18 where the truth was 62/66/48. Now paged.
> - [x] **A freshly created admin could not write anything.** The role claim only
>       says "is an admin at all"; write permission per module lives in
>       `admin_permissions` (migration 0007), which backfills only the admins that
>       existed when it ran. `pnpm db:create-admin` never inserted a row, so every
>       new install produced a read-only admin. It now grants full permissions.
>
> **Go looking for more of the first one.** Every unbounded `.select()` in the
> tree has the same 1000-row ceiling. `packages/core/src/db/queries.ts` (`listCrew`,
> `listEvents`, `getMatchingPool`) and `(dashboard)/events/page.tsx:88` are the
> known candidates — `getMatchingPool` is the alarming one, because a truncated
> matching pool returns a confident ranking of the wrong shortlist.

- [ ] **Multi-day events only check day 1's availability.** `packages/core/src/matching/index.ts:46` —
      `eventDate` comes from `start_datetime` alone; `end_datetime` is never read in
      `matchCrew`. On a 3-day festival, crew marked `X` on days 2–3 rank as available.
      **Fix:** walk start→end, take the worst status (any `X` in range ⇒ exclude). **M**
- [ ] **Skill matching is dead in production.** `matching/index.ts:98` gives every
      candidate the full 25 skill points when `required_skills` is empty — and the only
      caller hardcodes `required_skills: []` (`apps/web/src/app/api/events/match/route.ts:71`).
      Ranking has never once considered skills. **Fix:** load `event_required_skills` in the
      route and pass them. **M**
- [ ] **Availability date is the UTC slice, not the local day.** `matching/index.ts:65` —
      `start_datetime.split("T")[0]` on a `timestamptz`. An Amsterdam event starting
      after 00:00 local resolves to the previous calendar day, so the availability row
      is missed and the crew silently scores "unknown" instead of their real `B`/`X`.
      **Fix:** format with a fixed `Europe/Amsterdam` `Intl.DateTimeFormat('sv-SE')`. **M**
- [ ] **Costing and payroll bill different hours for the same event.** Costing feeds raw
      `hours_worked` (`packages/core/src/costing/index.ts:97`, used at
      `events/[id]/page.tsx:393`); payroll export skips rows where `!hours_approved`
      (`api/payroll/export/route.ts:83`). Margin card and CSV will not reconcile.
      **Fix:** add `hours_approved?: boolean` to `CostingLineInput`, fall back to
      `planned_hours` when unapproved. **M**
- [ ] **An invalid event date silently produces a €0 wage bill.** `costing/index.ts:23` —
      `eventDurationHours` returns `0` for an unparseable or inverted range, indistinguishable
      from a genuinely free event. **Fix:** return `null`, render "onbekend". **S**
- [ ] **`getMatchingPool` throws away every Supabase error and reports success.**
      `packages/core/src/db/queries.ts:302,307,309,314` — returns `{data: [], error: null}`
      on failure, so the route's `if (poolError)` can never fire. A DB outage renders as
      "no crew available". **Fix:** capture and return each query's `error`. **S**
- [ ] **`createEvent` reports success after a partial write.** `db/queries.ts:204` — the
      `event_required_skills` insert error is dropped; the event comes back "created" with
      its skills missing. Compounds the skill bug above. **Fix:** return that error, or move
      to an RPC so it is one transaction. **M**
- [ ] **Month bucketing mixes UTC and local.** `packages/core/src/analytics/index.ts:52`
      slices UTC, `:72` builds keys with local getters. A `+02:00` event at 00:30 on the 1st
      lands in the previous month's column. **Fix:** use one zone on both sides. **S**
- [ ] **Add the missing tests, specifically.** No test anywhere passes a non-empty
      `required_skills` (all 9 `matchCrew` calls use `[]`), so the whole skill branch and its
      "1/2 vereiste skills" label are uncovered. Costing never tests `charge_rate: 0`, a
      negative margin, or `hours_worked: 0`. **Fix:** one test each — 4 tests total. **M**

---

## Goal 2 — close the gaps before crew get logins

Ranked by what actually bites. Two things that *look* alarming are not, and are
labelled as such — do not panic-fix them out of order.

- [ ] **2.1 Middleware fails open for accounts with no role claim.**
      `apps/web/src/middleware.ts:88` — the last branch is "authenticated admin *or a legacy
      account without a role claim*" and returns `supabaseResponse`. Anyone holding a
      Supabase session that is not `role: "crew"` passes into `/dashboard` and every `/api/*`.
      **Not currently a data leak:** `is_admin()` (`migrations/20240101000004:25`) requires
      `role = 'admin'` explicitly, so RLS returns nothing to a role-less user — they get an
      empty, erroring dashboard. It is a defence-in-depth hole, and it is the *only* thing
      standing between "email signup is on in Supabase" and a stranger inside the admin shell.
      **Fix:** invert it — require `role === "admin"` to continue, redirect everything else. **S**
- [ ] **2.2 `/api/events/match` has no permission check at all.**
      `apps/web/src/app/api/events/match/route.ts:5` — no session check, no `hasPerm`, and the
      response embeds full `crew` rows (`getMatchingPool` does `select("*")` → phone, email,
      street, `date_of_birth`, `iban`, `hourly_cost`). It is saved today only by the accident
      in 2.3. **Fix:** `if (!(await hasPerm("assignments"))) return 403;` — one line, matching
      the sibling assignment routes. Also trim the `select("*")`. **S**
- [ ] **2.3 `createServiceClient()` is not a service-role client.**
      `apps/web/src/lib/supabase/server.ts:30` — it passes the service-role key *and* the cookie
      store, and supabase-js prefers the session token, so all ~10 call sites silently run as the
      signed-in user. Today this accidentally *reduces* privilege and is what saves 2.2. That is
      exactly the danger: the next person "fixes the bug" and opens 2.2 and `/api/availability`
      in the same commit. **Fix:** delete it, route call sites through the cookieless
      `createAdminClient()`, and give each one its own `hasPerm` gate first. **M**
- [ ] **2.4 `/api/availability` takes `crew_id` from the body with no auth check.**
      `apps/web/src/app/api/availability/route.ts:6` — POST/PUT/DELETE rely entirely on RLS, and
      return raw `error.message` to the caller (`:22`, `:61`, `:92`). **Fix:** add
      `hasPerm("crew")` to all three; return a generic message. **S**
- [ ] **2.5 Cron endpoints are CSRF-able via GET.** `lib/automation/cron.ts:27` accepts a plain
      admin session, and all five routes export `GET` (e.g. `api/cron/dispatch/route.ts:96`).
      An `<img>` an admin loads drains the WhatsApp outbox or mass-flips assignment statuses;
      SameSite=Lax still sends the cookie on a top-level GET. **Fix:** drop the `GET` exports, or
      restrict GET to the `CRON_SECRET` branch only. **S**
- [ ] **2.6 Magic-link callback matches email with `ilike`, not `eq`.**
      `apps/web/src/app/portaal/auth/callback/route.ts:45` — the verified address is used as a
      LIKE *pattern*, and `_`/`%` are legal in an email local part. Someone at `a_b@example.com`
      links themselves to the unlinked crew row for `axb@example.com`. **Fix:** `.eq("email", email)`
      with normalised lowercase. **S**
- [ ] **2.7 Callback overwrites all of `app_metadata`, demoting admins.** Same file, `:68` —
      `updateUserById(id, { app_metadata: { role: "crew" } })` *replaces* the object. Any admin
      whose email also sits on a crew row loses admin permanently. **Fix:** read first, refuse to
      stamp `crew` over `admin`. **S**
- [ ] **2.8 Magic-link redirect origin falls back to the `Host` header.**
      `apps/web/src/app/portaal/login/actions.ts:45` — with `NEXT_PUBLIC_SITE_URL` unset, a forged
      Host points the emailed link at an attacker domain carrying the `token_hash`. Only the
      Supabase redirect allowlist stops it. **Fix:** require the env var, fail closed. **S**
- [ ] **2.9 Any admin can rewrite or delete the AVG audit trail.**
      `migrations/20240101000004_crew_portal.sql:148` — `admin_all_audit_log FOR ALL USING (is_admin())`
      grants UPDATE/DELETE to the admin being audited, which defeats the point of the log.
      **Fix:** new migration — SELECT-only for `is_admin()`, no write policy (writes already go
      through the service role). **S**
- [ ] **2.10 Crew document upload validates size only.**
      `apps/web/src/app/portaal/(app)/onboarding/actions.ts:40` — no content-type or extension check,
      so `.html`/`.svg` lands in the `crew-documents` bucket and an admin later opens it from a
      signed URL. Stored XSS on the storage origin. **Fix:** allow-list `application/pdf` and
      `image/jpeg|png`, pass `contentType` explicitly on `.upload()`. **S**
- [ ] **2.11 Two small trust bugs in the assignment routes.** `events/[id]/assignments/[assignmentId]/route.ts:66`
      updates on `assignmentId` alone — add `.eq("event_id", eventId)` so a mismatched pair cannot
      edit another event's assignment. `events/[id]/assignments/route.ts:39` writes `a.status` raw —
      a crafted request creates assignments already `checked_in`. **Fix:** Zod-validate both. **S**
- [ ] **2.12 Smaller, still worth doing.** Notification recipients are unvalidated and
      `to_address` is trusted from the body (`api/notifications/route.ts:29`) — resolve it
      server-side from `crew`. `hireProspect`/`completeOnboarding` are the only dashboard actions
      with no `hasPerm` call (`(dashboard)/onboarding/actions.ts:10,24`). `CRON_SECRET` is accepted
      in the query string and compared non-constant-time (`lib/automation/cron.ts:20`) — drop
      `?key=`, use `timingSafeEqual`. The `/dev/` middleware bypass runs *before* every auth check
      (`middleware.ts:53`) — both routes behind it do 404 in production, so this is inert on a real
      deploy, but wrap the bypass in a `NODE_ENV !== "production"` check anyway. **M** total

---

## Goal 3 — make failures visible

Right now several failure paths look exactly like success.

- [ ] **No `error.tsx`, `loading.tsx` or `not-found.tsx` anywhere.** Every dashboard page awaits
      Supabase and three call `notFound()` (`kaart/page.tsx:19`, `uren/page.tsx:30`,
      `inzichten/page.tsx:55`). One thrown query blanks the app. **Fix:** one `error.tsx` +
      `loading.tsx` in `(dashboard)/` and `portaal/(app)/`, one root `not-found.tsx`. **S**
- [ ] **Optimistic availability write never rolls back.** `components/availability/AvailabilityGrid.tsx:103` —
      the `fetch` result is never checked for `res.ok`, so a 401/403/500 resolves normally and the
      cell keeps showing a status the database does not have. `applyBulk` at `:168` and the portal
      editor already check. **Fix:** `if (!res.ok) throw` in that branch. **S**
- [ ] **Hire / onboarding failures are silent.** `components/onboarding/OnboardingButtons.tsx:17,33` —
      the `{ok, error}` result from `onboarding/actions.ts:16` is discarded and `router.refresh()`
      runs unconditionally. A failed hire is indistinguishable from a successful one. **Fix:** check
      `res.ok`, toast the error. **S**
- [ ] **Timestamps round-trip through Zod and fail.** `packages/core/src/schemas/index.ts:126` —
      `.datetime()` defaults to `offset: false` and accepts only `…Z`, but PostgREST returns
      `…+00:00`. Feed a fetched event row back into `updateEventSchema` and it rejects.
      **Fix:** `.datetime({ offset: true })`. **S**
- [ ] **`updateEventSchema` lost the end-after-start rule.** `schemas/index.ts:158` — `.partial()`
      is applied to the *base* schema, not the refined one, so an inverted range validates in the
      app and 500s at the DB constraint instead of showing a field error. **Fix:** re-apply the
      refine after `.partial()`. **S**
- [ ] **Type/schema drift with the database.** `packages/core/src/types/index.ts:172` — `Assignment`
      is missing all six timesheet/costing columns (`clock_in`, `clock_out`, `break_minutes`,
      `hours_worked`, `hours_approved`, `distance_km`), so `apps/web` re-declares local row types.
      `Crew`/`Event` (`:21`, `:138`) are missing the geo and recurrence columns. `createCrewSchema`
      (`schemas/index.ts:85`) declares `latitude_2`/`longitude_2` but *not* `latitude`/`longitude`,
      so geocoding the primary address can never persist. **Fix:** derive these interfaces from
      `Database["public"]["Tables"][…]["Row"]` so drift becomes impossible. **M**

---

## Goal 4 — actually usable on a phone

It is a PWA sold as installable on iOS/Android. The admin side is not.

- [ ] **The dashboard has no mobile layout at all.** `(dashboard)/layout.tsx:21` — `flex h-screen`
      with a permanent `w-56` sidebar and not one `sm:`/`md:`/`lg:` breakpoint in the layout,
      sidebar, or topbar. On a 375px phone the sidebar eats 60% of the screen. `topbar.tsx:3`
      imports the `Menu` icon and never renders it — the hamburger was started and abandoned.
      **Fix:** `hidden md:flex` on the `<aside>`, render it in a drawer from that Menu button. **M**
- [ ] **Pinch-zoom is disabled app-wide.** `app/layout.tsx:24` — `maximumScale: 1` on a UI with
      10–11px text (`AvailabilityGrid.tsx:282`). **Fix:** delete the line. **S**
- [ ] **Two unbounded lists.** Events (`(dashboard)/events/page.tsx:88`) has no `.range()`/`.limit()`,
      so the "Alles" tab selects every event ever created — the crew list next door is already
      paginated at 50, copy it. The availability grid (`AvailabilityGrid.tsx:289`) renders a
      `<button>` per crew per day (200 crew ≈ 7,400 nodes) and `bCountPerDate` at `:185` rescans all
      of them on every search keystroke. **Fix:** paginate both. **M**
- [ ] **Hours table is clipped, not scrollable.** `(dashboard)/uren/page.tsx:131` — `overflow-hidden`
      around a 5-column table cuts off the Uren column on a phone. **Fix:** `overflow-x-auto`. **S**
- [ ] **Accessibility basics.** Labels not associated with inputs in `ClientManager.tsx:33` (7 fields),
      `AdminManager.tsx:135,136`, `uren/page.tsx:117,121` — `ProfileForm.tsx:53` shows the correct
      pattern. Icon-only edit/delete buttons with no accessible name in `AdminManager.tsx:91,92` and
      `ClientManager.tsx:82,83`. Unlabelled event `<select>` at `CrewMap.tsx:222`. Colour-only status
      dots at `CrewMap.tsx:272`. **Fix:** `htmlFor`/`id` pairs and `aria-label`s. **S**
- [ ] **Event detail is a 699-line client component that fetches its own data.**
      `(dashboard)/events/[id]/page.tsx:1` — `'use client'` + `useEffect` → `fetch("/api/events/…")`
      at `:145` means download bundle, hydrate, *then* round-trip before anything renders.
      `crew/[id]/page.tsx:119` already does it right with `Promise.all`. **Fix:** server component
      for the data, client island for the assignment mutations. **L**
- [ ] **Dutch UI is inconsistent and leaks English.** "shifts" (`portal/AssignmentList.tsx:92`,
      `portaal/(app)/page.tsx:11`) vs "diensten" (`OpenShiftsList.tsx:82`) for the same thing; and
      `events/new/page.tsx:24` labels the match factors "Skills", "Transport", "Seniority" where the
      rest of the app says "Vervoer"/"Functie". **Fix:** pick "dienst" for the occurrence and
      "toewijzing" for the record; translate the three factor labels. **S**

---

## Goal 5 — stop the docs lying to the next session

Every one of these cost time this session or would have.

- [ ] **Five live env flags are missing from `.env.example`.** `NEXT_PUBLIC_TIME_TRACKING` is read by
      six files (`uren/page.tsx:12`, `api/payroll/export/route.ts:13`, `sidebar.tsx:39`, …) and
      documented in `HANDOFF.md:146`, but is absent from the template — so a fresh clone silently has
      hours and payroll export switched off with no hint why. Same for `NEXT_PUBLIC_RECURRENCE_GROUPS`,
      `NEXT_PUBLIC_CREW_SECOND_ADDRESS`, `NEXT_PUBLIC_CALCOM_URL`, `NEXT_PUBLIC_SITE_URL`.
      `HANDOFF.md:138` claims "everything is documented inline in `.env.example`" — it is not.
      **Fix:** add all five (or delete the unused ones from source). **S** ← *highest value here*
- [ ] **Turbo serves stale builds when a flag changes.** `turbo.json` declares no `globalDependencies`
      and no `globalEnv`, while `apps/web/next.config.ts:15` reads the root `.env.local` itself.
      Flip `NEXT_PUBLIC_COSTING` and `pnpm build` replays a cached `.next` with the old inlined value.
      **Fix:** `"globalDependencies": [".env.local"]` plus a `globalEnv` list. **S**
- [ ] **Two turbo tasks are misconfigured.** `test` declares `"outputs": ["coverage/**"]` but no
      coverage provider is enabled — that is the `no output files found` warning on every `pnpm test`.
      And `lint`/`typecheck`/`test`/`build` all `dependsOn: ["^build"]` while `packages/core` has no
      `build` script, so it is a no-op and the `dist/**` glob matches nothing. **Fix:** drop both. **S**
- [ ] **`pnpm lint` cannot pass.** `apps/web` is the only implementer (`next lint`) and there is no
      `.eslintrc*` or `eslint.config.*` anywhere, despite `eslint` + `eslint-config-next` being
      installed. CI never runs it either. **Fix:** add `apps/web/eslint.config.mjs` extending
      `next/core-web-vitals`, then wire `- run: pnpm lint` into CI. **S**
- [x] **CI hang — found and fixed 2026-08-19.** Opening PR #1 exposed it live: the `E2E smoke`
      job ran for 40+ minutes and never finished, stuck on `playwright install --with-deps chromium`,
      which shells out to `apt-get`. With no `timeout-minutes` it would have burned the 6-hour
      default. Fixed by dropping `--with-deps` (the ubuntu-latest image already ships Chromium's
      system libs), adding `timeout-minutes: 15` to both jobs, and a `concurrency` group so a new
      push cancels the previous run. **Note:** the `corepack enable` *before* `setup-node` ordering
      was flagged as a likely "Unable to locate executable file: pnpm" failure — it is **not**
      breaking anything; the build job passes in 1m6s. Left as-is; do not go chasing it.
- [ ] **Vercel deploy gotchas, undocumented.** `vercel.json:8-12` declares five crons including
      `*/10 * * * *` — the Hobby plan caps at 2 crons, daily. And there is no `maxDuration` anywhere,
      so `/api/cron/dispatch` (one Meta API call per queued row) truncates a backlog at the 10s
      default. **Fix:** note "requires Vercel Pro" in `docs/DEPLOY.md`, add a `functions` block with
      `maxDuration: 60` for `api/cron/**`. **S**
- [ ] **Migrations issue no `GRANT` statements.** They create tables and rely entirely on
      the platform's default privileges to give `anon`/`authenticated`/`service_role` their
      DML. On the Supabase CLI version used on 2026-08-19 that is not enough: a fresh local
      stack gave those roles only `REFERENCES, TRIGGER, TRUNCATE`, and every seed failed with
      `permission denied for table crew` — using the service-role key. Worked around locally
      with a manual `GRANT ALL ON ALL TABLES IN SCHEMA public`. **Watch for this on the first
      cloud `pnpm db:migrate`:** if seeding fails the same way, the fix is one new migration
      granting the three roles explicitly plus `ALTER DEFAULT PRIVILEGES` for future tables.
      Do not assume the cloud behaves like the CLI — check, then write the migration only if
      it is actually needed. **S** ← *verify on first real deploy*
- [ ] **Smaller doc drift.** Both BSN migrations point at `docs/AVG-crew-gegevens.md`; the file is
      `docs/privacy-crew-gegevens.md` (fix the *pending* one only — applied migrations are
      append-only). `SETUP.md:24` says `npm install -g supabase`, which the Supabase CLI explicitly
      refuses — use `brew install supabase/tap/supabase`. `README.md:24` marks time tracking `✅` with
      no flag note, unlike the rows around it. `CLAUDE.md:17` omits `migrations-pending/` from the
      tree even though `HANDOFF.md:123` treats it as a hard rule. **S**

---

## Goal 6 — delete weight

Nothing here adds a feature. All of it removes something that can rot.

- [ ] **TanStack Query has zero consumers.** `app/providers.tsx:8` wraps the whole app;
      `grep -r "useQuery\|useMutation" src` returns nothing. It ships react-query to every client
      bundle for no benefit, and the module-level `let queryClient` in `lib/query-client.ts:3` would
      be shared across SSR requests the moment anyone did use it. **Fix:** delete both, keep
      `<Toaster/>`, drop the dep. **S**
- [x] **`apps/mobile` — decided 2026-08-19: keep as-is, do not delete.** The problems below
      are known and accepted; they are recorded so nobody rediscovers them as bugs.
      `app.json:7,19,25` references
      `./assets/icon.png` and two others; `apps/mobile/assets/` does not exist, so `expo start` fails
      on config resolution. It is three source files whose only job is proving core imports in RN.
      It also forces the `@types/react` 19 override onto a React 18 app (`pnpm-workspace.yaml:10`
      vs `apps/mobile/package.json:16`), a conflict hidden by `--filter=!@crewops/mobile` in the root
      typecheck script. Its README (`:29`) claims it is excluded from Turbo, which is false, and its
      commands (`expo-cli`, `expo build:ios`) were removed from Expo years ago.
      **Accepted cost of keeping it:** four Expo/RN dep trees in the lockfile, one permanently
      untypechecked workspace, and the `@types/react` 18/19 conflict staying hidden behind the
      `--filter=!@crewops/mobile` in `package.json:10`. If a native app ever becomes real, the
      first job is fixing the assets and putting it back into typecheck.
- [ ] **Three adapter stubs and seven query helpers are dead.** `ShiftPlatformAdapter`,
      `CalComAdapter`, `GoogleWorkspaceAdapter` (`packages/core/src/adapters/index.ts:73`) throw
      "not implemented" from every method with zero importers — the interfaces already document the
      contract. `listCrew`, `getCrewById`, `deactivateCrew`, `listSkills`, `getMonthAvailabilityMatrix`,
      `getDashboardStats`, `createSupabaseClient` are exported and referenced nowhere in `apps/`.
      **Fix:** delete; they are currently maintained against schema drift for nothing. **S**
- [ ] **Three copy-paste clusters worth collapsing.** `RunDispatchButton` / `RunRemindersButton` /
      `RunDocumentExpiryButton` are byte-identical apart from URL and copy → one `<RunCronButton>`.
      `AdminManager.tsx:46` and `ClientManager.tsx:44` are the same CRUD list twice. `crew/new/page.tsx:19`
      and `crew/[id]/edit/page.tsx:20` duplicate 683 lines of form (same `FormValues`, `EMPTY`, `set()`,
      `nz()`, zod-issue mapping); events repeat the pattern. **Fix:** one shared component each.
      Do this *after* Goal 1 — it touches the same files. **M**
- [ ] **Two small duplicates in core.** `isSecured` (`automation/index.ts:22`) is byte-identical to
      `isSecuredStatus` (`analytics/index.ts:8`) and inlined a third time at `events/[id]/page.tsx:394`.
      `documentExpiryStatus` (`automation/index.ts:174`) reduces "today" with UTC getters while
      `daysBetween` (`:224`) uses local ones despite a comment claiming UTC — one day apart between
      local midnight and the offset. **Fix:** one shared helper, one timezone. **S**
- [ ] **Repo basics.** No `LICENSE` (Goal 0), no `.github/dependabot.yml`, no `.prettierrc` so the
      `format` script silently uses defaults. CI has no `concurrency` group, no `timeout-minutes`, and
      never uploads the Playwright traces it is configured to produce. The e2e job also runs a full
      `pnpm build` a second time inside `playwright.config.ts:18`. **S**

---

---

## Goal 7 — a live demo you can show someone

Requested 2026-08-19. One constraint decides the whole approach:

> **GitHub Pages cannot host this app.** Pages serves static files only. This is a
> Next.js App Router app whose value is entirely server-side — server components,
> route handlers, server actions, middleware auth and a Supabase connection. There is
> no `output: "export"` path that keeps any of it working. Pages is the wrong tool
> for the app itself; it is the right tool for a page *about* the app.

Two separate things, worth doing in this order:

- [ ] **7.1 A real demo instance — Vercel, not Pages.** `docs/DEPLOY.md` already covers the
      import; what is missing is a *demo* configuration: a throwaway Supabase project, seeded
      only with the fictional data (`Demostad`, `Demo Producties`, `Zomerfestival` — see
      `supabase/seed.ts`), a demo admin created via `pnpm db:create-admin`, and every feature
      flag deliberately set. **Never point a demo at the real project.** Turn `AUTO_CHECKIN` and
      the notification flags off so a visitor clicking around cannot dispatch WhatsApp messages
      or mutate assignment statuses. Vercel preview deployments per PR give you the same thing
      per branch for free. **M**
- [x] **7.2 A GitHub Pages landing page — done 2026-08-19.** `docs/index.html` plus
      `docs/.nojekyll`, served from `main` at path `/docs`, live at
      **https://olivervanderlugt.github.io/crew-management-system/**. Pages had been enabled
      on the repo but had never built, because there was nothing at the configured path to
      serve. The page is documentation, not a demo, and says so. Still open: it links to the
      repo, not to a running instance — that link is what 7.1 adds. Screenshots of the real UI
      are also still missing; add them once 7.1 exists to screenshot.
- [ ] **7.3 Decide what a demo visitor may touch.** Before 7.1 goes public: read-only demo user,
      or a nightly reset that re-seeds the demo database? A demo anyone can write to becomes
      unusable within a week. A `pnpm db:reset && pnpm db:seed` on a schedule is the cheap answer.
      Note this also needs Goal 2 done first — a public demo is exactly the case where
      `#2.1` (middleware fails open for role-less accounts) stops being theoretical. **S to decide**

---

## Suggested next session

**Decided 2026-08-19: start with Goal 1.**

1. Goal 0 — only the two open lines (real `.env.local`, check Supabase signup).
2. Goal 1 in full — it is nine items, mostly small, and it is the difference
   between a planner you can trust and one you cannot. Land the four tests with it.
3. Goal 2.1 + 2.2 + 2.4 + 2.5 (four one-liners, ~30 min) before anyone else logs in.
   The rest of Goal 2 can wait for a dedicated pass.
4. `.env.example` (Goal 5, first item) — five minutes, saves the next session an hour.

Goal 7 (live demo) depends on Goal 2 being done — do not put a public demo up
before the auth gaps are closed.

Goals 3–6 are a good second session. Goal 4's event-detail rewrite and Goal 6's
form deduplication touch the same files as Goal 1, so do them after, never during.
