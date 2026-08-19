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
- **pnpm** ≥ 9 — `corepack enable` pint de juiste versie uit `package.json`
- **Git** ≥ 2.40
- **Supabase CLI** — `brew install supabase/tap/supabase` (macOS/Linux) of
  `scoop install supabase` (Windows). Kan ook zonder installatie via `npx supabase`.
  > `npm install -g supabase` werkt **niet**: de Supabase CLI weigert een globale
  > npm-installatie en breekt af met "Installing Supabase CLI as a global module
  > is not supported".
- Een eigen Supabase-project (kies een EU-regio als je EU-persoonsgegevens verwerkt)

## Supabase aanzetten — van niets naar een werkende database

Doe dit één keer. Duurt ongeveer tien minuten, waarvan de helft wachten.

### S1. Account en project aanmaken
1. Ga naar **https://supabase.com** → *Start your project* → inloggen met GitHub.
2. **New project**. Vul in:
   - **Name** — bijvoorbeeld `crewops`.
   - **Database Password** — laat Supabase er één genereren en **sla hem meteen op**
     in je wachtwoordmanager. Je krijgt hem daarna niet meer te zien, en je hebt
     hem nodig voor `SUPABASE_DB_PASSWORD`.
   - **Region** — kies **Frankfurt** of **Amsterdam**. Je verwerkt persoonsgegevens
     van crew; die horen in de EU te blijven.
   - **Pricing plan** — Free.
3. Klik **Create new project** en wacht tot de status *Setting up* → *Active* springt
   (1–3 minuten).

### S2. De drie sleutels ophalen
Open **Project Settings → API** (directe link: vervang `<ref>` door je project-ref,
`https://supabase.com/dashboard/project/<ref>/settings/api`). Je hebt drie dingen nodig:

| In het dashboard | In `.env.local` | Wat het is |
|---|---|---|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| **anon / public** (nieuwere projecten: *publishable key*) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Gaat mee naar de browser. Veilig om te delen — RLS beschermt de data. |
| **service_role / secret** | `SUPABASE_SERVICE_ROLE_KEY` | **Omzeilt alle RLS.** Alleen server-side. Zet hem nooit in een `NEXT_PUBLIC_`-variabele en commit hem nooit. |

Je **project-ref** is het stuk vóór `.supabase.co` in de Project URL, en staat ook
in de dashboard-URL zelf.

### S3. Een access token maken (voor de CLI)
De CLI logt niet in met je wachtwoord maar met een token.
**https://supabase.com/dashboard/account/tokens** → *Generate new token* → kopieer
hem direct naar `SUPABASE_ACCESS_TOKEN` in `.env.local`. Ook deze zie je maar één keer.

### S4. Koppelen en de migraties draaien
```bash
supabase login                                # of: gebruik SUPABASE_ACCESS_TOKEN
supabase link --project-ref <jouw-project-ref>
pnpm db:migrate                               # = supabase db push
```
`pnpm db:migrate` vraagt om het databasewachtwoord uit stap S1. Het draait alle
bestanden in `supabase/migrations/` in volgorde. Dit is de stap die de tabellen,
enums, RLS-policies en triggers aanmaakt.

> `supabase/migrations-pending/` wordt **niet** meegedraaid. Daar staat één migratie
> (BSN-veld) die bewust op de plank ligt tot er een juridisch besluit is — zie
> `docs/privacy-crew-gegevens.md`. Verplaats hem niet zomaar.

### S5. Beheerder aanmaken
De RLS-policies verlenen alleen toegang aan een gebruiker met
`app_metadata.role = "admin"`. Een gewoon aangemaakt account krijgt dus niets te zien.

```bash
ADMIN_EMAIL=jij@example.com ADMIN_PASSWORD=<sterk-wachtwoord> pnpm db:create-admin
```

Handmatig kan ook: **Authentication → Users → Add user**, daarna bij die gebruiker
`app_metadata` bewerken en `{"role":"admin"}` invullen.

### S6. Vullen
```bash
pnpm db:seed        # skills-catalogus + een paar demo-events
pnpm db:seed-demo   # volledige demo-dataset: 100 crewleden + skills + 90 dagen
                    # beschikbaarheid, 12 klanten, 40 events en hun toewijzingen
```
`pnpm db:seed-demo` blijft binnen zijn eigen gereserveerde reeksen en is idempotent —
je kunt hem veilig opnieuw draaien. Hij raakt echte records nooit aan: crew
CREW-9001 t/m CREW-9100, klanten met een naam die met `DEMO ` begint, en events
DEMO-EVT-9001 t/m DEMO-EVT-9040. Toewijzingen komen alleen op die events, en
niemand wordt dubbel ingepland op overlappende events. Alles wat hij genereert is
verzonnen: e-mailadressen op het niet-bestaande `.invalid`-domein, telefoonnummers
in een niet-uitgegeven reeks, en IBANs in de vorm `NL00DEMO…` die per definitie
ongeldig zijn. `--dry-run` draait de generator, controleert alle enum-waarden en
schrijft niets.

### S7. Aanzetten wat je wilt gebruiken
Zet in `.env.local` de vlaggen aan waarvan je de migratie hebt gedraaid:

```bash
NEXT_PUBLIC_CREW_PORTAL_ENABLED=true   # crew-zelfservice op /portaal
NEXT_PUBLIC_TIME_TRACKING=true         # urenregistratie + payroll-export (migratie 0013)
NEXT_PUBLIC_COSTING=true               # marge & loonkosten (migratie 0015)
```

Laat `NEXT_PUBLIC_NOTIFICATIONS_ENABLED` op `false` tot je écht berichten wilt
versturen. De WhatsApp-dispatch is fail-closed en verstuurt niets zonder die vlag
plus twee ingevulde sleutels — houd dat zo.

### S8. Controleren
```bash
pnpm dev:web    # http://localhost:3000 → inloggen met het account uit S5
```
Als `/crew` honderd mensen laat zien en `/beschikbaarheid` een gevuld grid, staat alles.

---

## Wat kost dit

Alles wat je nodig hebt om dit te draaien en te demonstreren zit in gratis lagen.
Twee dingen zijn het waard om vooraf te weten.

| Onderdeel | Gratis? | Waar je tegenaan loopt |
|---|---|---|
| **Supabase** | Ja — Free-plan | 500 MB database, 1 GB opslag, ruim voldoende voor honderden crewleden. **Let op:** een gratis project dat een week niet gebruikt wordt, wordt gepauzeerd en moet je met één klik in het dashboard weer activeren. Vervelend voor een demo-link die je uitdeelt. |
| **Vercel** | Ja — Hobby-plan | Hosting en preview-deploys zijn gratis. **Maar:** `vercel.json` declareert vijf cron-jobs waarvan één elke 10 minuten. Hobby staat een beperkt aantal crons toe die hooguit dagelijks draaien. De app werkt prima; de automatisering draait niet vanzelf. Trigger de `/api/cron/*`-endpoints zolang handmatig vanaf de Notificaties-pagina, of hang er een externe scheduler aan met `CRON_SECRET`. |
| **GitHub** | Ja | Publieke repo, Actions en Pages zijn gratis. |
| **Geocoding** | Ja | PDOK (Nederlandse overheid) en Nominatim, beide zonder sleutel. Nominatim heeft een fair-use-limiet van ongeveer één verzoek per seconde. |
| **Kaarttegels** | Ja | OpenStreetMap, fair use. |
| **AI crew-zoeken** | Optioneel, betaald | `AI_API_KEY` leeg laten = de functie is uit en kost niets. De UI toont dan een placeholder. |
| **WhatsApp-dispatch** | Optioneel | Meta Cloud API. Vereist een geverifieerd bedrijfsaccount; buiten het gratis servicevenster zijn berichten betaald. Standaard volledig uit. |

Kort: **ja, je kunt dit volledig gratis draaien.** De enige twee dingen die je
tegenkomt zijn het pauzeren van een ongebruikt Supabase-project en dat de
cron-automatisering een betaald Vercel-plan of een eigen scheduler nodig heeft.

---

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

### 5. Data erin
Er zijn drie manieren, die je kunt combineren:

```bash
pnpm db:seed        # skills-catalogus + demo-events (altijd veilig)
pnpm db:seed-demo   # crew, klanten, events en toewijzingen — zie S6 hierboven
```

Voor je **eigen** data leest `pnpm db:seed` daarnaast CSV's uit `_reference/`. Die
map staat in `.gitignore` en is bedoeld voor jouw bronbestanden:

- `_reference/crew.csv` — crewleden
- `_reference/availability.csv` — beschikbaarheid per crewlid per datum

Ontbreken die bestanden, dan slaat de seed dat deel over — dat is normaal bij een
verse clone. Je kunt crew ook via de UI aanmaken of via **Crew → Importeren** een
CSV uploaden.

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

**Seed doet niets**: `_reference/crew.csv` ontbreekt — dat is normaal bij een verse
clone. Gebruik `pnpm db:seed-demo` voor een volledige fictieve dataset.

**Supabase-project reageert niet meer**: een gratis project pauzeert na een week
zonder gebruik. Open het dashboard en klik op *Restore project*.

**`Installing Supabase CLI as a global module is not supported`**: je gebruikte
`npm install -g supabase`. Installeer via Homebrew/Scoop of draai `npx supabase`.
