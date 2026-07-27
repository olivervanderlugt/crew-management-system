# CrewOps — Crew Management System

Zelf-hostbaar planningssysteem voor organisaties die crew inzetten op events en
festivals: crewbeheer, beschikbaarheidsgrids, eventplanning, slimme matching,
urenregistratie en een zelfservice-portaal voor crew.

Het project is generiek: er zit geen organisatie-, klant- of persoonsdata in.
Alle gegevens komen uit je eigen Supabase-project.

## Wat het doet

| Feature | Status |
|---|---|
| Admin login (Supabase Auth) + RBAC | ✅ |
| Crew-database met documentenarchief | ✅ |
| Beschikbaarheidsgrid (B/M/X/W/V) | ✅ |
| Event aanmaken + crew-matching | ✅ |
| Toewijzingen + statusflow | ✅ |
| Dashboard (heatmap, open slots) | ✅ |
| Klanten & prospects | ✅ |
| Kaartweergave + geocoding | ✅ |
| Urenregistratie + payroll-CSV-export | ✅ |
| Marge & loonkosten per event | ✅ (achter `NEXT_PUBLIC_COSTING`) |
| Crew-zelfservice-portaal (magic link) | ✅ (achter `NEXT_PUBLIC_CREW_PORTAL_ENABLED`) |
| Open diensten + 1-tik-bevestigen | ✅ |
| Cron-automatisering (herinneringen, auto-checkin, dispatch) | ✅ |
| WhatsApp-dispatch (Meta Cloud API) | ✅ (fail-closed, achter env-keys) |
| Crew CSV-import | ✅ |
| AI crew-zoeken (natural language) | ✅ (achter `AI_API_KEY`) |
| PWA (installeerbaar op desktop/Android/iOS) | ✅ |
| Native mobiel (Expo) | 🔲 scaffold |

## Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web**: Next.js 15 (App Router), Tailwind CSS, shadcn/ui, TanStack Query
- **Core**: TypeScript strict, Zod-schemas, matching engine (unit-getest), Supabase query-laag
- **Database**: Supabase (Postgres, Auth, RLS, Storage)
- **PWA**: manifest + service worker, installeerbaar op iOS/Android/desktop
- **Tests**: Vitest (unit) + Playwright (smoke)

## Snel starten

Zie [SETUP.md](SETUP.md) voor het volledige installatiepad.

```bash
pnpm install
pnpm db:migrate   # migrations toepassen op je eigen Supabase-project
pnpm dev:web      # http://localhost:3000
```

## Architectuur: monorepo

```
packages/core   ← framework-onafhankelijke logica (types, matching, DB, AI, adapters)
apps/web        ← Next.js — de werkende app
apps/mobile     ← Expo scaffold
```

Grens: `packages/core` exporteert **alleen logica**, nooit UI. Zie [CLAUDE.md](CLAUDE.md).

## Datamodel

Volledige tabelstructuur in `supabase/migrations/`. Highlights:

- `crew` — crewleden (crew-code `CREW-XXXX`)
- `availability` — B/M/X/W/V per crewlid per datum
- `events` — met vereiste skills en crew-aantallen
- `assignments` — koppeling event ↔ crew met statusflow en gewerkte uren
- `clients` — opdrachtgevers
- `crew_documents` — certificaten/contracten in een privé Storage-bucket
- `notifications` — outbox voor WhatsApp/e-mail
- `integration_sync` — voor externe koppelingen
- `audit_log` — AVG/GDPR-transparantie

## Matching engine

Pure TypeScript-functie (`packages/core/src/matching/index.ts`), volledig unit-getest.

Scoregewichten: beschikbaarheid (40%), skill-match (25%), vervoer (15%),
seniority (10%), werklastbalans (10%). Crew met status `X` of een overlappende
boeking valt af, met reden.

## AI-functie (optioneel)

Zet `AI_API_KEY` in `.env.local` om natural-language crew-zoeken te activeren.
**Zonder key: nul kosten, geen fouten** — de UI toont een placeholder.
Provider: Anthropic (Claude). Model configureerbaar in `packages/core/src/ai/index.ts`.

## Integratie-adapters

In `packages/core/src/adapters/index.ts`:

| Adapter | Status | Aanname |
|---|---|---|
| `WhatsAppAdapter` | Werkend | Meta Cloud API; goedgekeurd template vereist voor koud contact |
| `ShiftPlatformAdapter` | Stub | Generieke koppeling met een extern planningsplatform |
| `CalComAdapter` | Stub | Open-source, zelf te hosten |
| `GoogleWorkspaceAdapter` | Stub | OAuth2 consent-scherm per gebruiker vereist |

## Beschikbaarheidscodes

| Code | Betekenis |
|---|---|
| B | Beschikbaar |
| M | Misschien |
| X | Niet beschikbaar |
| W | Projectspecifiek — betekenis zelf vastleggen |
| V | Projectspecifiek — betekenis zelf vastleggen |

`W` en `V` worden als literals bewaard zodat ze bij import niet verloren gaan.

## Huisstijl

Accentkleur is `#2563EB` (blauw). Aan te passen op één plek per laag:
`--primary` in `apps/web/src/app/globals.css` en `brand` in
`apps/web/tailwind.config.ts`. Iconen genereer je opnieuw met
`node scripts/gen-ico.cjs` en `node apps/web/scripts/gen-icons.cjs`.

## AVG / Privacy

- Kies een Supabase-regio binnen de EU als je EU-persoonsgegevens verwerkt
- Persoonsdata en importbronnen horen in `_reference/` — staat in `.gitignore`
- RLS actief op alle tabellen; gevoelige velden alleen voor beheerders
- Audit log registreert wijzigingen (wie, wat, wanneer)
- Zie [docs/privacy-crew-gegevens.md](docs/privacy-crew-gegevens.md) voor de
  checklist bij BSN/IBAN en documentopslag

## Licentie

Nog niet vastgesteld. Voeg een `LICENSE` toe voordat je dit publiek deelt of hergebruikt.
