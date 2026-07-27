# CrewOps — Deploy & cross-platform

## Overal & altijd erbij: de strategie (PWA-first)

De web-app is al een **PWA** (manifest + service worker + icons). Zodra hij gehost
is, kun je hem **installeren als app op Windows, macOS, iOS én Android** vanuit
één codebase — geen aparte desktop/mobiele build nodig.

| Platform | Hoe | Status |
|---|---|---|
| Website | Vercel-URL | klaar na deploy |
| Desktop (Win/Mac) | Browser → "App installeren" (Chrome/Edge) | werkt zodra gehost |
| Mobiel (iOS/Android) | Safari/Chrome → "Zet op beginscherm" | werkt zodra gehost |

Native wrappers (echte desktop-app via Tauri/Electron, app-store-apps via Expo)
zijn optioneel en pas later nodig als je push-notificaties of app-store-distributie
wilt. De Expo-scaffold in `apps/mobile` staat klaar voor die stap.

## Deployen op Vercel

1. Push de repo naar GitHub.
2. Vercel → **New Project** → importeer de repo. De root `vercel.json` regelt de
   monorepo-build (`turbo run build --filter=@crewops/web`, output `apps/web/.next`).
3. Zet de **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; nooit in client)
   - `NEXT_PUBLIC_CREW_PORTAL_ENABLED=true`
   - Optioneel: `NEXT_PUBLIC_NOTIFICATIONS_ENABLED`, `NEXT_PUBLIC_RECURRENCE_GROUPS`,
     `NEXT_PUBLIC_CALCOM_URL`, `AI_API_KEY`
4. Voeg in **Supabase → Auth → URL Configuration** de Vercel-URL +
   `…/portaal/auth/callback` toe als redirect URL.
5. Deploy. Elke push naar `main` deployt automatisch; PR's krijgen een preview.

## CI

`.github/workflows/ci.yml` draait op elke push/PR: typecheck → unit tests → web
build, plus een Playwright-smoke-job. Gebruikt `corepack` zodat de pnpm-versie
exact die uit `packageManager` is.

## Lokale toolchain (pnpm-versie vastzetten)

```bash
corepack enable      # respecteert "packageManager": "pnpm@9.14.4" in package.json
pnpm install
```

> Let op: nieuwere pnpm leest `pnpm.overrides` in package.json niet meer; de
> `@types/react`-pin staat daarom in **`pnpm-workspace.yaml`** (nieuwe locatie).

## E2E-tests lokaal

```bash
pnpm --filter @crewops/web exec playwright install chromium
pnpm --filter @crewops/web e2e
```
