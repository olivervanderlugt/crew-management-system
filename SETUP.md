# CrewOps — Lokale setup

## ⚡ Snelste manier — dubbelklik (na eenmalige installatie)
Als de dependencies en `.env.local` eenmaal staan, hoef je verder niets in de
terminal te doen:

- **Starten:** dubbelklik `Start App.bat` in de projectmap (of de snelkoppeling
  op je bureaublad). Het script controleert alles, start de server, en opent je
  browser op http://localhost:3000. Gaat er iets mis bij het starten, dan legt
  het venster uit wat er aan de hand is en probeert het zichzelf te herstellen.
- **Stoppen:** sluit het venster (of druk Ctrl+C). Alle achtergrondprocessen
  worden automatisch afgesloten.
- **Geforceerd stoppen:** dubbelklik `Stop App.bat` als er iets blijft hangen.

> Snelkoppelingen aanmaken/herstellen: voer eenmalig
> `scripts\setup-shortcuts.ps1` uit (rechtsklik → "Run with PowerShell").

De rest van deze handleiding is alleen nodig voor de allereerste installatie.

## Vereisten
- **Node.js** ≥ 20 (LTS aanbevolen)
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Git** ≥ 2.40
- **Supabase CLI** (`npm install -g supabase`)
- Een eigen Supabase-project (kies een EU-regio als je EU-persoonsgegevens verwerkt)

## Stap-voor-stap installatie

### 1. Repository klonen
```bash
git clone <repo-url>
cd crew-management-system
```

### 2. Omgevingsvariabelen instellen
> ⚠️ Kopieer het template **alleen als `.env.local` nog niet bestaat** — anders
> overschrijf je je echte sleutels met placeholders.
```bash
# Bash / macOS / Linux (-n = niet overschrijven):
cp -n .env.example .env.local
# Windows PowerShell:
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```
Vul daarna `.env.local` in (en bewerk dit bestand voortaan direct, niet opnieuw kopiëren):

| Variabele | Waar te vinden |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role secret |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Settings → Database → Password |
| `AI_API_KEY` | Optioneel — Anthropic Console → API Keys (leeg = AI uitgeschakeld) |

`.env.local` staat in `.gitignore` en hoort daar te blijven. Commit nooit sleutels.

### 3. Dependencies installeren
```bash
pnpm install
```

### 4. Supabase-project koppelen en migrations toepassen
```bash
supabase link --project-ref <jouw-project-ref>
pnpm db:migrate   # = supabase db push
```
Migrations staan in `supabase/migrations/` en worden toegepast op het remote project.

### 5. (Optioneel) eigen data importeren
De seed leest CSV's uit `_reference/` — die map staat in `.gitignore` en is
bedoeld voor jouw eigen bronbestanden:

- `_reference/crew.csv` — crewleden
- `_reference/availability.csv` — beschikbaarheid per crewlid per datum

```bash
pnpm db:seed
```
Zonder die bestanden slaat de seed het importdeel over; je kunt crew ook via de
UI aanmaken of via **Crew → Importeren** een CSV uploaden.

### 6. Dev-server starten
```bash
pnpm dev:web    # start Next.js op http://localhost:3000
```

### 7. Admin-account aanmaken
1. Supabase Dashboard → Authentication → Users → **Add user** (e-mail + wachtwoord)
2. Zet bij die gebruiker `app_metadata.role = "admin"` — de RLS-policies vereisen dat
3. Log in via http://localhost:3000/login

Alternatief, met `.env.local` ingevuld:
```bash
ADMIN_EMAIL=jij@example.com ADMIN_PASSWORD=<sterk-wachtwoord> pnpm db:create-admin
```

---

## Tests uitvoeren
```bash
pnpm test                          # alle tests in alle workspaces
pnpm --filter @crewops/core test   # alleen core tests (matching engine)
```

---

## Mobiel
De `apps/mobile/` scaffold is voorbereid maar niet uitgebouwd. Zie
`apps/mobile/README.md` voor het init-pad.

Snel testen als PWA:
1. `pnpm dev:web`
2. Open Chrome op het netwerk-IP: `http://<ip>:3000`
3. Chrome: "Toevoegen aan startscherm" (Android) of Safari: "Deel → Zet op beginscherm" (iOS)

---

## Veelgestelde problemen

**`Missing NEXT_PUBLIC_SUPABASE_URL`**: `.env.local` ontbreekt of heeft lege waarden.

**`Cannot find module '@crewops/core'`**: `pnpm install` niet uitgevoerd, of `tsconfig.json` paths kloppen niet.

**`Error: supabase link`**: Koppel het project: `supabase link --project-ref <jouw-project-ref>`

**Seed doet niets**: `_reference/crew.csv` ontbreekt — dat is normaal bij een verse clone.
