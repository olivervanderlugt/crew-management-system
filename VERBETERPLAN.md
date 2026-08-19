# Verbeterplan — 2026-08-19

> **Lees deze drie, in deze volgorde: `HANDOFF.md` → `TODO.md` → `VERBETERPLAN.md`.**
> Je bent bij **3 van 3**. Heb je de eerste twee niet gelezen, ga terug:
> `HANDOFF.md` zegt wat dit project is en hoe je het draait, `TODO.md` zet de
> doelen op volgorde. Dit bestand veronderstelt beide bekend — los gelezen is
> het een lijst klusjes zonder rangorde.
>
> Let vooral op de secties **"Wat de reviews mis hadden"** en **"Bewust NIET
> doen"**. Twee reviewbevindingen waren onjuist, en een aantal adviezen is na
> afweging bewust verworpen. Voer niets uit zonder die twee secties te lezen.

Uit zeven onafhankelijke reviews (correctheid, security, over-engineering,
conventies, simplificatie, aannames, diff-review), naast elkaar gelegd.
Alles hieronder is **zelf nagelopen in de code**, niet overgenomen op gezag.

## Wat de reviews mis hadden

Twee claims gingen niet door de verificatie:

- **"`dk` is undefined, runtime crash"** — onjuist. `dk` staat op regel 433,
  gebruikt op 450, zelfde scope. De reviewer las diff-regelnummers als
  bestandsregels.
- **"De demo-seed is niet idempotent"** — empirisch weerlegd: 321 rijen vóór,
  321 ná, 0 dubbelboekingen. Wel een kern: als de skills-catalogus leeg is
  verschuift de PRNG-stroom. Randgeval, geen prioriteit.

## Wat drie of meer reviews onafhankelijk vonden

Dat maakt ze betrouwbaar.

1. Het 1000-rijenplafond is op één plek gefixt en op vijf plekken blijven staan
2. `createServiceClient()` doet niet wat zijn naam zegt
3. `/api/events/match` heeft geen enkele rechtencheck
4. Enums staan drie tot vier keer los overgeschreven

---

# Tier 1 — stille verkeerde antwoorden

Geen crashes. De app toont een getal, het getal klopt niet, niemand merkt het.
Dit is de klasse die vandaag vier keer heeft toegeslagen.

- [ ] **Openstaande plekken tellen afzegging als bezetting.**
      `dashboard/page.tsx:106,142` — `assignments(count)` telt élke rij:
      proposed, invited, declined. De comment ernaast zegt "confirmed
      assignments". Een event waar iedereen afzegt leest als vol bezet, 0
      openstaande plekken. De juiste definitie bestaat al en is unit-getest:
      `isSecured` in `packages/core/src/automation/index.ts:22`.
      **Dit is het primaire tekortsignaal van de planner.**

- [ ] **Het 1000-rijenplafond staat nog op vijf plekken.**
      `inzichten/page.tsx:81` (nu al fout: dekking toont ~33% waar het 100% is),
      `dashboard/page.tsx:112` (breekt rond 143 crew), `kaart/page.tsx:28,34`,
      `uren/page.tsx:68`, en `beschikbaarheid/page.tsx:23` — de crewlijst boven
      de gepagineerde query. Eén gedeelde `fetchAllRows()` in
      `packages/core/src/db/queries.ts`, overal doorheen.

- [ ] **De paginatielus die ik schreef herintroduceert de bug bij een lagere
      servercap.** `beschikbaarheid/page.tsx:52,72` — `PAGE = 1000` matcht
      `max_rows` per toeval; de lus stopt op `batch.length < PAGE`. Zet de cap
      op 500 en de eerste batch stopt de lus. Stoppen op `length === 0`.

- [ ] **`getMatchingPool` kan niet falen.** `queries.ts:302,309,314` — geeft
      hardcoded `error: null`, dus de foutafhandeling in de matchroute is
      onbereikbare code. Een databasestoring leest als "geen crew beschikbaar".

- [ ] **`daysBetween` zegt UTC en doet lokaal.**
      `automation/index.ts:223` — geeft 3 onder `TZ=UTC` en 4 onder
      `TZ=Europe/Amsterdam`. Met `REMINDER_LEAD_DAYS=1` mist een nachtdienst
      zijn herinnering volledig. De bestaande test gebruikt bewust het midden
      van de dag "zodat de datumdelen niet over middernacht heen vallen" — hij
      documenteert het gevaar en test het dan niet.

- [ ] **Loonperiode-grenzen worden in servertijd geparsed, datums in UTC
      geschreven.** `api/payroll/export/route.ts:56,79` — grenzen 1 tot 2 uur
      scheef, in beide richtingen, in een CSV die naar de salarisverwerker gaat.

## Van mij, vandaag gemaakt

- [ ] **`setCell` negeert `res.ok`.** `AvailabilityGrid.tsx:159-173` — de enige
      twee `await fetch` in de app zonder resultaatcheck. Een 403 laat de cel
      groen. De portaal-versie doet het wél goed; vier regels overnemen.

- [ ] **Klikken op W of V vernietigt de waarde.** `AvailabilityGrid.tsx:13` —
      `indexOf` geeft `-1`, `nextStatus` geeft `"B"`. Geen bevestiging, geen
      undo, op codes waarvan de migratie zelf zegt dat hun betekenis onbekend is.

- [ ] **`console.assert` faalt niet.** `seed-demo.ts` — exit code 0 met veertig
      gefaalde asserties, en print daarna onvoorwaardelijk "Dry run OK".
      Mijn commit-boodschap claimde dat de dubbelboeking-regel hierin bewezen
      werd. Dat was onwaar. Vervangen door `node:assert/strict`.

- [ ] **`supabase/config.toml` staat in git met `enable_signup = true`.**
      Door mij toegevoegd met `supabase init`. Governt lokaal, maar
      `supabase config push` kan het naar productie schrijven.

---

# Tier 2 — vóór de eerste echte crewlogin

Deze drie zijn één keten. Los repareren maakt het erger.

- [ ] **`middleware.ts:89`** valt door naar admin voor elk account zonder
      `role`-claim. RLS houdt de data tegen, dus geen lek — maar het is de
      bodem onder de volgende twee.
- [ ] **`createServiceClient()`** stuurt de service-key én de cookie mee.
      Mét sessie draait hij als die gebruiker, zónder sessie als service-role.
- [ ] **`/api/events/match`** heeft geen rechtencheck en geeft volledige
      crewrijen terug, inclusief `iban`. Wordt nu alleen gered door de bug
      hierboven.

> **Repareer `createServiceClient` niet zonder tegelijk de matchroute te
> dichten.** Dan verander je een toevallige bescherming in een open PII-dump.

- [ ] **`.ilike` op e-mail** in `portaal/auth/callback/route.ts:45` en
      `portaal/login/actions.ts:33` — `_` is een LIKE-wildcard. Iemand op
      `jan_smit@…` kaapt de crewrij van `jan.smit@…`. Exploiteerbaar door een
      vreemde met alleen een mailbox. `.eq()`.
- [ ] **Auditlog is `FOR ALL`** (`migratie 0004:148`) — elke admin kan zijn
      eigen sporen wissen.
- [ ] **Cron-routes exporteren `GET`** en accepteren een sessiecookie: CSRF.

---

# Tier 3 — meten in plaats van hopen

**Gedaan 2026-08-19.** 64 tests → 73. Wat er nog open staat, staat onderaan.

- [ ] **`apps/web` heeft geen `test`-script.** `pnpm test` draait alleen
      `packages/core`: 64 tests, 15ms, geen enkele regel die Postgres raakt.
      Dat is de structurele reden dat de beschikbaarheidsbug kon landen.
- [ ] **`TZ: "Europe/Amsterdam"` in `packages/core/vitest.config.ts`** — één
      regel, draait alle 64 bestaande tests in de tijdzone van de gebruikers,
      en laat `daysBetween` meteen vallen.
- [ ] Drie tests: `fetchAllRows` met servercap < paginagrootte; `daysBetween`
      over een middernachtgrens; `setCell` die op 403 terugdraait.

---

# Bewust NIET doen

- **Drag-and-drop niet weggooien.** Eén review rekent voor dat de `<select>`
  hetzelfde doet. Expliciet gevraagd, en een dropdown in een kolom is een
  lijst met extra stappen.
- **Doorloop-modus niet weggooien.** Zelfde review wil hem schrappen omdat de
  picker meer kan. Terecht verwijt — "beide uitleveren is hoe je vermijdt te
  beslissen" — maar er is om gevraagd. Herzien als hij over een maand ongebruikt
  blijkt.
- **De drie cron-knoppen niet samenvoegen tot één component.** De succespaden
  verschillen van vorm; je krijgt een callback en drie aanroepers die om een
  vreemde abstractie heen buigen. Deel de `runCronJob()`-functie.
- **`createServiceClient` niet alleen hernoemen.** Dat dekt een
  correctheidsprobleem toe met een naamwijziging.
- **`apps/mobile` niet verwijderen.** Grootste beschikbare schrapping, maar
  besloten op 2026-08-19 om te behouden.
- **`HANDOFF.md` en `docs/DEPLOY.md` niet samenvoegen.** Eén review wil ~450
  regels doc schrappen; ze worden actief gebruikt.
- **De 226 dode regels in `queries.ts`** — gebruiken of schrappen, maar niet
  halfdood laten. Jouw keuze, geen technische.


---

# Wat er na Tier 3 nog open staat

- **`apps/web` heeft nog steeds geen unit-tests.** Bewust niet opgelost: er een
  tweede testomgeving (vitest + jsdom + React Testing Library) naast zetten voor
  één componenttest is meer stellage dan opbrengst. De hoogwaardige logica zit
  in `packages/core` en die is nu wél gedekt. Als hier iets moet komen, hoort het
  in de Playwright-suite die al bestaat — maar die heeft een database nodig.
- **De drie overgebleven 1000-rijen-plekken**: `kaart/page.tsx:28,34` en
  `uren/page.tsx:68`. Zelfde patroon, `fetchAllRows` staat klaar.
- **Meerdaagse events kijken nog steeds alleen naar dag 1**
  (`matching/index.ts`). Staat in Goal 1 van `TODO.md`. Een test die dit vastpint
  zou nu rood zijn, dus die komt samen met de fix.
- **`getMatchingPool` is nog ongepagineerd** voor de 30-daagse
  toewijzingenquery — bij >1000 rijen lijken de drukste crewleden juist
  onderbezet, en stelt de matcher ze bij voorkeur voor.
- **Timesheet-rijen die niet uitgerekend kunnen worden zijn stil 0 waard**
  (`timesheet/index.ts:17`), en de bestaande test legt dat vast als gewenst
  gedrag. Een gemiste uitklok verdwijnt daarmee uit de loonexport.
