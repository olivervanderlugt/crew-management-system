# AVG/GDPR — verwerking van crew-persoonsgegevens

> Status: **technische waarborgen geïmplementeerd**; juridische/organisatorische
> stappen hieronder zijn de verantwoordelijkheid van de organisatie die dit
> systeem draait (de verwerkingsverantwoordelijke).
> Dit document is geen juridisch advies — laat het toetsen door een
> functionaris gegevensbescherming (FG) of jurist.

Dit document hoort bij migratie `20240101000005_crew_extended.sql`, die gevoelige
crew-gegevens (o.a. **BSN** en **IBAN**) en een documentenarchief (VOG, verzekering,
contract) toevoegt. Het is bewust vóór de UI gebouwd ("compliance first").

## 1. Welke (bijzondere) persoonsgegevens

| Gegeven | Kolom / tabel | Gevoeligheid |
|---|---|---|
| Naam, telefoon, e-mail, adres(sen), woonplaats | `crew` | normaal |
| Geboortedatum, nationaliteit | `crew.date_of_birth`, `crew.nationality` | normaal |
| Noodcontact (naam + telefoon) | `crew.emergency_contact_*` | normaal |
| Kledingmaat, startdatum, rijbewijsnummer | `crew.*` | normaal |
| **IBAN** | `crew.iban` | financieel — verhoogd |
| **BSN** | `crew.bsn` | **wettelijk beschermd nummer — hoog** |
| Documenten (VOG, VCA, ID, verzekering, contract) | `crew_documents` + Storage-bucket `crew-documents` | hoog (kan kopie ID/VOG bevatten) |

## 2. Grondslag (art. 6 AVG) — per gegeven vast te leggen

- **BSN** — uitsluitend o.b.v. een **wettelijke verplichting** (loonheffing/
  Belastingdienst, Wet algemene bepalingen BSN). BSN mag **alleen** voor de
  loonadministratie worden gebruikt, niet voor identificatie/zoeken/sorteren.
- **IBAN** — **uitvoering van de overeenkomst** (uitbetaling van gewerkte uren).
- **VOG** — wettelijke eis of gerechtvaardigd belang, afhankelijk van de functie.
- **Overige** — uitvoering van de arbeids-/inhuurovereenkomst.

## 3. Technische maatregelen (in deze migratie/app geïmplementeerd)

- **Toegang beperkt tot beheerders** via RLS: `crew` en `crew_documents` zijn
  alleen leesbaar/schrijfbaar voor `app_metadata.role = 'admin'` (en het crewlid
  zelf voor de eigen rij — niet voor BSN/IBAN-bewerking, zie trigger).
- **Crew kan eigen gevoelige velden niet wijzigen**: de `crew_guard_columns`
  trigger staat een crewlid (via het portaal) alleen toe contactvelden te
  wijzigen; alle overige kolommen (incl. BSN/IBAN) zijn onwijzigbaar.
- **Documenten in een privé Storage-bucket** (`crew-documents`, niet publiek),
  met admin-only RLS op `storage.objects`.
- **Maskering in de UI**: BSN en IBAN worden gemaskeerd weergegeven met een
  expliciete "toon"-actie (geen volledige weergave by default).
- **Versleuteling at-rest**: Supabase versleutelt de database en Storage at-rest.

## 4. Nog te regelen door de verwerkingsverantwoordelijke (organisatorisch/juridisch)

- [ ] **Grondslag & doelbinding vastleggen** (BSN uitsluitend loonadministratie).
- [ ] **Verwerkingsregister** (art. 30 AVG) bijwerken met deze categorieën.
- [ ] **DPIA** overwegen/uitvoeren — BSN + ID-documenten = verhoogd risico.
- [ ] **Verwerkersovereenkomst (DPA) met Supabase** afsluiten/bevestigen
      (Supabase biedt een standaard-DPA) en nagaan of data in de EU blijft —
      kies bij het aanmaken van het project bewust een EU-regio.
- [ ] **Bewaartermijnen** instellen en handhaven, o.a.:
      - loon-/BSN-gegevens: fiscale bewaarplicht (7 jaar) na einde dienstverband;
      - sollicitatie-/prospectgegevens: max. 4 weken, of 1 jaar mét toestemming;
      - VOG/ID-kopie: zo kort mogelijk bewaren.
- [ ] **Rechten van betrokkenen** (inzage, correctie, verwijdering) operationeel
      maken — nu via beheerder; later eventueel via het crew-portaal.
- [ ] **Aanvullende beveiliging overwegen** voor BSN: veld-encryptie
      (Supabase Vault / pgsodium) of tokenisatie i.p.v. plaintext-kolom.
- [ ] **Toegang minimaliseren**: niet elke beheerder hoeft BSN/IBAN te zien —
      overweeg een aparte rol indien meer beheerders bijkomen.

## 5. Aandachtspunt in de code

- BSN/IBAN staan als gewone tekstkolommen opgeslagen met strikte RLS + maskering.
  Voor productiegebruik met echte BSN's is veld-encryptie (Supabase Vault) de
  aanbevolen volgende stap; de huidige opzet is de gangbare baseline.
- Sorteren/filteren/zoeken gebeurt **nooit** op BSN of IBAN.
