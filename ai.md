# ai.md – Flippsjekk: oversikt for AI-agenter og utviklere

Denne filen er skrevet for AI-kodeassistenter (og mennesker som tar over). Den samler **hva produktet er, hvordan det er bygget, hvorfor valgene er gjort, alle krav som er gitt, og hvordan det bygges videre** mot ekte innlogging, abonnement, Vipps, Supabase og analyseagent. Les den først, og bruk så `README.md` (kjøring/demo) og `docs/*.md` (detaljer).

> **Språk:** All brukertekst er norsk bokmål. Kommentarer i kode og kommitmeldinger er også norske. Behold det.
> **Navn:** Produktet heter **Flippsjekk** (omdøpt fra «Flipprom»). Interne tekniske identifikatorer har beholdt gammelt navn med vilje (se §12).
> **Status:** Demoen finnes fortsatt. Produksjonsmodus har ekte Supabase Auth og profil (fase 2A, e-post-OTP og profil live-verifisert 24.10.2026). Fase 2B kobler brukerens objektliste og scenarioer til Supabase. **Migrasjon 9 og RLS-matrisen er live-verifisert 24.10.2026 (228/228); nettleserflyten med seedet testobjekt gjenstår før merge.** Kalender, abonnement, betaling, kurs, egne referanser/risikoer, import/eksport og analyseagent er fortsatt ikke koblet til produksjonsbackend. Ikke klart for betalende kunder.

---

## 1. Hva produktet er

Norsk abonnementstjeneste for å analysere, sammenligne og planlegge **boligflipp** (kjøpe, pusse opp, selge). Brukeren limer inn en FINN-lenke og får et begrunnet beslutningsgrunnlag: oppussingsbehov, salgsverdi etter oppussing (lav/normal/høy), totalkostnad, risiko, stresstester og et **modellert maksbud** ut fra brukerens eget fortjenestemål. I tillegg: egne scenarioer (kalkyler), sammenlignbare objekter, risikovurdering, visningskalender med forventet buddag, sammenligning av inntil tre objekter, import/eksport, og et kjøpbart kurs («Flipping nivå 1 - Privat»).

Produktet er **generelt** og skal kunne brukes av alle i Norge. Trondheim var første fokus, men er **ingen begrensning** (se krav K-3).

Kjerneprinsipper som styrer alt:

1. **Ukjent betyr aldri 0 kroner.** Manglende verdi er `null`/«Ikke avklart» og gir ufullstendig kalkyle med navngitte mangler – aldri en tallverdi.
2. **Fakta, anslag og egne forutsetninger holdes adskilt** (dokumentert / analyse / mine tall / uavklart).
3. **Én deterministisk beregningsmotor** brukes overalt (objektside, liste, sammenligning, kalender, eksport, kurs). Agenten leverer aldri økonomiske nøkkeltall.
4. **Brukerens data er privat.** Scenarioer, notater, risikoendringer, egne sammenlignbare objekter og kalkyler deles aldri.
5. **Brukeren skal oppleve analysen som sin egen**, uavhengig av om andre har analysert samme bolig (se krav K-30–K-37).

---

## 2. Teknologi og kommandoer

React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 4 · Zod 4 · Recharts · lucide-react · React Router 7 (**hash-ruting**) · Vitest · Playwright. Demoen kjører mot mockdatabase i `localStorage`; produksjonsmodus bruker nå ekte Supabase Auth og profil, mens øvrige produksjonstjenester fortsatt er eksplisitt `not_configured`.

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck      # tsc -b
npm test               # Vitest (enhets- og tjenestetester)
npm run build          # tsc -b + vite build -> dist/
npm run preview        # server dist/
npm run test:e2e       # Playwright, desktop (1440) og mobil (Pixel 7); starter egen vite på port 5198
npm run check          # typecheck + test + build
```

Krever Node 20+ (testet med Node 25). **Kvalitetsport før hver commit:** `npm run typecheck && npm test && npm run build && npm run test:e2e` skal være grønt.

Modus styres av `VITE_FLIPPROM_MODE` (`production` slår av mock og testkontroller; appen viser da «Produksjonsbackend er ikke koblet til» til ekte tjenester er implementert). Det finnes ingen URL-parameter eller localStorage-verdi som gir betalt tilgang eller slår på demo.

---

## 3. Arkitektur

### 3.1 Lag

```
UI (pages/components)  ──►  useServices()  ──►  Services (grensesnitt i src/services/types.ts)
                                                   ├─ mock/  (demo: MockDatabase i localStorage)   ← finnes
                                                   └─ supabase/ (Auth + profil finnes) + øvrig backend/Vipps/agent  ← bygges videre
```

* UI kjenner **bare** tjenestegrensesnittene i `src/services/types.ts`. Produksjon kobles på ved å implementere de samme grensesnittene og velge dem i `createAppServices` (`src/app/services.tsx`). Ikke bygg UI om for å bytte backend.
* All forretningslogikk henter «nå» fra en injiserbar `Clock` (`src/lib/clock.ts`). Tester bruker `ManualClock`.
* Live-oppdatering: `useLiveQuery` (`src/app/hooks.ts`) kjører en spørring på nytt når `services.events` varsler om endring (mock: `MockDatabase.subscribe`; produksjon: Supabase Realtime).

### 3.2 Katalogkart

```
src/
  calc/        engine.ts (ren beregningsmotor 1.1), scenario.ts (ScenarioValues -> motor, arbeidsmodell, diff, basisverdier),
               market.ts (markedsvekting V1), ranking.ts (scenario-rangering)
  domain/      schemas.ts (Zod = kilde til typene), enums.ts (+ norske labels), agentContract.ts,
               assessment.ts (risiko-/datakvalitetsregler), comparables.ts, risks.ts,
               analysisScenarios.ts (agentscenarioer + fallback), areaProfile.ts (områdeprofil, markedsindeks), migrate.ts (migrering til gjeldende modell), saleValue.ts i calc/ (én autoritativ salgsverdi), refreshPolicy.ts (30-dagers-/full-analyse-regler)
  lib/         finn.ts, time.ts, holidays.ts, bidDay.ts, ics.ts, format.ts, calendarGrid.ts, calendarOverlap.ts, sort.ts, ids.ts, clock.ts
  data/        db.ts (MockDatabase), storage.ts, seed.ts, seedProperties.ts, synthetic.ts, analysisBuilder.ts
  services/    types.ts (kontrakter) + mock/ (accountServices, analysisService, courseServices, dataServices,
               calendarImportServices, context, jobs, heal, mockAgent, index)
  import/      v1Adapter.ts, types.ts, example.ts, scenarioExport.ts
  config/      app.ts (modus), plans.ts (abonnement), courses.ts (kurskatalog), defaults.ts (profilstandarder), defaultLabor.ts, freshness.ts
  app/         services.tsx, session.tsx, analyzeFlow.tsx, hooks.ts, preferences.ts, toast.tsx
  components/  ui/ (primitiver), layout/ (AppShell, DemoControls), property/ (liste/tabell), analysis/ (objektfaner),
               account/ (VippsCheckout, VippsApproval, CoursePurchase), marketing/ (forside-visuals)
  pages/       Landing, HowItWorks, Auth (login/signup), Dashboard, Property, Calendar, Compare, Import, Account, Course, CoursePaywall
  course/      types.ts, content/ (m01-03, m04-06, m07-11, finalQuiz), progress.tsx, widgets/, glossary.ts, marketData.ts, caseData.ts, print.ts
e2e/           kurs, innlogging, hovedflyt, demokontroller, sammenlignbare, risiko, forside
docs/          datamodell.md, agentkontrakt.md, formater.md, integrasjoner.md, scenarier-og-marked.md + eksempelfiler (JSON)
.github/workflows/pages.yml   bygger og publiserer dist/ til GitHub Pages
```

### 3.3 Ruter (`src/App.tsx`, hash-ruting)

Åpne: `/` (forside), `/slik-fungerer-det`, `/logg-inn`, `/registrer` (samme flyt som logg inn), `/glemt-passord` (redirect til `/logg-inn`).
Beskyttet (`RequireAuth`): `/oversikt`, `/objekter/:id`, `/kalender`, `/sammenligning`, `/kurs`, `/kurs/flipping-privat` (viser betalingsmur til kurset er kjøpt), `/konto`, `/import`.

Hash-ruting og `base: './'` i `vite.config.ts` er bevisste valg slik at `dist/` kan ligge på hvilken som helst statisk vert, inkludert undermappe på GitHub Pages.

### 3.4 Mockdatabase (`src/data/db.ts`)

* Versjonert `localStorage` (`flipprom.mockdb`, `DB_FORMAT='flipprom-mockdb'`, `DB_SCHEMA_VERSION=5`) med migreringer, **radvalidering med Zod** (ugyldige rader droppes, men aldri uten sikkerhetskopi), atomiske transaksjoner og backup ved skade. Skadet lagring gir ny seed – ikke hvit skjerm.
* Tabeller (`DbState`): `users, profiles, subscriptions, properties, snapshots, analyses, viewings, userProperties, scenarios, jobs, usageEvents, privateEvents, calendarOverrides, userComparables, userRisks, coursePurchases` + `session`, `demo`.
* **v3 → v4 (modell 1.1)** (`MIGRATIONS[3]`): profiler og scenarioer får nye felt, `financingPct` blir både kjøps- og oppussingslån. **v4 → v5 (modell 1.2)** (`MIGRATIONS[4]`): `regulatedSelfWorkConfirmed` → `regulatedCompetence` per område (nullstilt konservativt), tiltak med arbeidsmodell får ikke lenger eldre fagbeløp (flyttes til innleid arbeid). Ingen rader droppes. Kjøpslån på kun P gir nye renter/egenkapitalbehov uten at verdiene (låneandel i %) endres. Se `docs/scenarier-og-marked.md` §12.
* **Nye tabeller kan legges til uten migrering:** `sanitizeState` gir `[]` for manglende tabeller. Bumpe `DB_SCHEMA_VERSION` bare når eksisterende rader må omformes (legg da til migrering i `MIGRATIONS`). Å droppe rader «stille» ga tidligere en alvorlig feil (se §6.9) – vær forsiktig.
* Referanseintegritet: private rader som peker på slettede objekter fjernes ved lasting.
* `healMissingAnalyses` (`mock/heal.ts`) gjenoppretter automatisk manglende felles analyser fra deterministiske demodata ved oppstart (krav K-21).

### 3.5 Tjenester (`src/services/types.ts`)

`AuthService`, `SubscriptionService`, `CourseService`, `ProfileService`, `PropertyRepository`, `ScenarioRepository`, `ComparableRepository`, `RiskRepository`, `AnalysisService`, `CalendarService`, `ImportService`, `DataEvents`, `DemoService` (kun demo). Feilkoder: `ServiceError` med `ServiceErrorCode` (`not_authenticated`, `forbidden`, `not_found`, `subscription_inactive`, `quota_exceeded`, `invalid_url`, `validation`, `conflict`, `limit_reached`, `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited`, …). UI viser `error.message` direkte, så meldinger må være forståelige norske setninger.

Mock-tilgangsregler ligger i `mock/context.ts`: `computeEntitlements`, `requireFullAccess`, `ensureLink`, `ensureDefaultScenario`, `buildBundle`, `buildMyItem`. **Mocklagets eiersjekker i nettleseren er ikke sikkerhet** – i produksjon må alt håndheves i database/edge-funksjoner (RLS).

---

## 4. Domenemodell (felles vs privat)

**Felles (delt mellom brukere, skrives bare av backend/agent):** `properties` (identitet på FINN-ID), `snapshots` (annonseopplysninger per tidspunkt, versjonert), `analyses` (versjonerte grunnanalyser: `published → superseded`), `viewings`, `jobs` (analysejobber).

**Privat (per bruker, eieravgrenset):** `userProperties` (liste, favoritt, arbeidsstatus, notater, private sjekklistebekreftelser `checks`, `analyzedAt`, `lastSeenAnalysisVersion`), `scenarios` (kalkyler), `userComparables`, `userRisks` (egne risikoer + endringer/skjuling av analysens risikoer), `privateEvents` (private visninger), `calendarOverrides` (privat buddag), `usageEvents`, `coursePurchases`, `profiles` (forutsetninger), `subscriptions`.

Viktige relasjoner:
* En **analyse** hører til én eiendom og har `version`, `status`, `visibility` (`shared` | `private` for importerte utkast), `schemaVersion`, `modelVersion`, risikoer, sjekkliste (12 faste punkter), sammenlignbare, kilder, estimater (salg lav/base/høy, oppussingsalternativer, valgfritt `scenarios`: ett basis + inntil to alternativ med egen salgsverdi og gjennomførbarhet, se §5.1).
* Et **scenario** peker på `analysisId`/`analysisVersion`. Brukerens scenarioer slettes **aldri** automatisk – heller ikke ved nedgradering av abonnement.
* Én **brukerlenke** per (bruker, eiendom). `primaryScenarioId` styrer hva liste/sammenligning/kalender bruker.
* **Låst scenario «Nettsidens vurdering»** (`locked: true`, `BASE_SCENARIO_NAME`) opprettes automatisk ved brukerens første lagrede endring av «Hovedscenario», slik at grunnlaget alltid er lett tilgjengelig. Det kan ikke redigeres, bare dupliseres via «Lagre som nytt».
* `ScenarioValues` har prosent som prosentpoeng (7 = 7 %); motoren bruker brøk internt. Verdiene er en **full privat kopi** av grunnverdiene (valgt agentscenario + profilstandarder, bygget av `buildBaseValues`); `diffValues` viser hva brukeren har endret, og hvert felt kan tilbakestilles. Eldre scenarioverdier (bl.a. `financingPct`, `hourValue`) migreres ved lesing og i DB-migreringen.

Fullt skjema og forslag til Postgres/RLS: `docs/datamodell.md`.

---

## 5. Beregningsmotoren (modell 1.2.0)

Rene funksjoner, mellomregning i hele øre, resultat merket med `CALC_MODEL_VERSION = '1.2.0'` (major uendret, så analyser forblir kompatible – de lagrer ingen beregnede tall). Detaljer og alle parametere: `docs/scenarier-og-marked.md`.

```
K      = A × d + F                         kjøpskostnader (dokumentavgift + øvrige)
RB     = R × (1 + b)                       oppussing med reserve
Lp     = fP × P                            kjøpslån – gjelder KUN kontant kjøpesum P (ikke kjøpskostnadene K)
Lr     = fR × RB                           oppussingslån, trekkes gradvis (snitt halvveis)
I      = r × m/12 × (Lp + Lr/2 + [lånefinansierte løpende] O/2)
O      = M × m                             felleskostnad + drift (gjeldsbetjening legges ikke til på nytt)
S      = V − D1 (totalpris) | V (kontant)  fellesgjeld ved salg trekkes nøyaktig én gang
Csale  = Sf + s × S                        faste salgskostnader + provisjon av kontantsalget
C      = P + K + RB + I + O + Csale
Resultat før skatt = S − C                 EGEN TID ER IKKE EN KOSTNAD
Fortjeneste per egeninnsatstime = (S − C) / egne timer     (null ved 0/ukjent timer – ingen deling på null)
Prosjektavkastning = (S − C) / (C + D0)    ikke egenkapitalavkastning
Egenkapitalbehov = (P − Lp) + K + (RB − Lr) + [ikke lånefinansiert] (I + O)    K lånefinansieres ikke; uten salgskostnader
Finansieringsgap = max(0, egenkapitalbehov − tilgjengelig egenkapital)
```

* **Kjøpslånet gjelder kjøpesummen (1.2.0).** Før (1.0/1.1) ble låneandelen brukt på P + K. Historiske tall er derfor **ikke bit-for-bit identiske** når K > 0 – bevisst produktbeslutning (eksempel i `docs/scenarier-og-marked.md` §2.1: renter 55 350 → 54 000, resultat 504 650 → 506 000, egenkapitalbehov 530 350 → 574 000). Kurset beholder den eldre regelen via `purchaseLoanBasis: 'kjopesum_og_kostnader'` (`src/course/evaluate.ts`) slik at kursteksten ikke endres; analyser bruker aldri den.
* **Maksbud: flere grenser, hver for seg.** Fortjenestemål (`maxBid`) og timekrav (`maxBidHourly` – høyeste pris som gir minst `minProfitPerOwnHour` per egeninnsatstime ved oppgitte egne timer). `Evaluation.recommendedMaxBid` = laveste grense med `limitedBy`; `recommendedBidOf(ev)` brukes av alle visninger. Avkastningsmål står i tabellen og blandes ikke inn. Uten egne timer gir timekravet ingen grense.
* **Timekravet er verken kostnad eller port.** Det er en mål-/maksbudparameter og en rangeringsfaktor. Et scenario under kravet kan fortsatt anbefales (lavere maksbud).
* `hourValue`/`profitAfterOwnWork` er utfaset (kurset bruker dem) og styrer ikke hovedøkonomien.
* **Stresstester:** salg −5/−10/−15 %, oppussing +100 000, tid +3 mnd, kombinert, økt fellesgjeld. **Dokumentavgift** er en eksplisitt, overstyrbar regel etter eierform. **Skatt** er uavklart som standard og vises bare som separat illustrasjon.
* Kontrolltallene fra kravspesifikasjonen er i `src/calc/engine.test.ts`: med 100 % kjøpslån gir modell 1.2 resultat 541 400 (var 539 900); den eldre regelen reproduserer 539 900. Nye regler i `src/calc/model11.test.ts`. **Ikke endre formler uten å oppdatere tester og modellversjon.**
* `evaluateScenario` (`scenario.ts`) normaliserer eldre verdier, evaluerer, og gir mangler, advarsler (påkrevd utbedring tatt ut, regulert arbeid regnet som innleid, egeninnsats som ikke rekker innen oppussingstiden) og stresstester.

**Profilstandarder** (`config/defaults.ts`, redigerbare under Konto): 10 arbeidstimer per uke (samlet team i V1), minimum 500 kr/t, tilgjengelig egenkapital 300 000, rente 6 %, kjøpslån 90 % (av kjøpesummen), oppussingslån 0 %, ingen lånefinansiering av løpende utgifter, reserve 20 %, fortjenestemål 400 000, salgskostnader 120 000 kr (fast sum; meglerprovisjon % finnes fortsatt, standard 0), tid fra ferdig oppussing til økonomisk oppgjør 3,5 mnd, kjøpsgebyrer 6 000, hjemområde Trondheim, og arbeidsmodus (selv/delvis/innleid) for 9 kategorier. **Regulert arbeid (rør, elektro, bad/våtrom) regnes aldri som gratis** uten at relevant kompetanse/ansvar er bekreftet **for akkurat det arbeidsområdet** (`regulatedCompetence { ror, elektro, bad_vatrom }`; erstatter det samlede `regulatedSelfWorkConfirmed`, som ved migrering nullstilles konservativt) – heller ikke via «maks egeninnsats» (`maxOwnWork`).

### 5.1 Scenarioer, overstyringer, salgsverdi, markedsvekting og rangering

* **Agentscenarioer** (`estimates.scenarios`, valgfritt, strengt skjema): ett `basis` + inntil to `alternativ`, hvert med egne tiltak, **sluttprodukt inkl. `standardClass`**, gjennomførbarhetsstatus (`klar`/`betinget`/`uavklart`/`ikke_gjennomforbar`) med krav til avklaring, **egen risiko** (`risk`: teknisk, kostnad, tid, myndighet), **screening** (alle aspekter vurdert; `ikke_ok` betyr at grepet ikke er et scenario), usikkerhet, referanser og **referanseklassifisering**. `estimates.scenarioSearch` viser hva scenariojakten vurderte/avviste (inkl. stopp uten treff). **Fallback** (`resolveAnalysisScenarios`): eldre analyser med én global `estimates.sale` får ett basisscenario merket `saleSource: 'global'` – den globale verdien kopieres aldri til alternativer. Et scenario som krever godkjenning kan ikke være `klar` eller ha lav myndighetsrisiko. Se `docs/agentkontrakt.md`.
* **Én autoritativ salgsverdiflyt** (`calc/saleValue.ts`, `resolveScenarioSale`): referanser → kode beregner anker og intervall → agenten kan bare levere sluttprodukt, klassifisering og en begrenset, begrunnet `anchorAdjustment` (maks ±5 %) → **koden fastsetter low/base/high**. Tre verdier holdes adskilt og vises som sådan: agentens/fellesanalysens **historiske estimat** (`scenario.sale`, referanse), **markedsmotorens verdi** (grunnverdi i kalkylen, regnet per analysens dato) og **brukerens private overstyring** (`saleLow/Base/High`). Fallback: `agent_fallback` (motoren kan ikke regne – tydelig merket «ikke verifisert»), `global_fallback` (eldre analyse), `ingen` (null, ufullstendig kalkyle).
* **Sluttstandard:** `endProduct.standardClass` brukes automatisk av markedsvektingen. Mangler den: tydelig fallback fra oppussingsnivået (`lett` → oppgradert, ellers nyoppusset), merket «antatt», utvidet intervall. Aldri antatt som dokumentert. V1 justerer ikke prisen for standardforskjeller – den vekter og begrenser.
* **Private overstyringer:** `ScenarioValues` er en privat kopi av grunnverdiene (valgt agentscenario + profil) og kan endres felt for felt. UI viser grunnverdi, opprinnelse (inkl. «Beregnet av markedsmotoren»), «Endret av deg» og «Tilbakestill» (per felt og per tiltak). Ingenting skrives tilbake til `SharedAnalysis` (testet).
* **Arbeid i tiltak** (`RenovationItem`): **én kostnadsmodell per tiltak.** Uten `laborCategory`: eldre felt (`materials`, `electrician`, `plumber`, `other`, `hours`) som før. Med `laborCategory`: kostnad = `materials` + innleid arbeid (`laborCostHired`, fordelt etter `workMode`/`selfShare`); eldre fagfelt teller ikke (`usesLaborModel`, `ignoredLegacyTrades`), agentkontrakten avviser tiltak som fyller ut begge (`laborModelIssue`), og lagrede rader normaliseres (`migrateRenovationItemRaw`). Ingen nasjonale priser er lagt inn (klart for prisbank via `priceSource`).
* **Markedsvekting** (`calc/market.ts`, versjon 1.1.0): fysisk likhet 0–100 (lokasjon 25, standard 25, BRA-i 15, soverom/planløsning 15, type/eierform 10, øvrig 10), adskilte `reliabilityFactor` og `marketTimeFactor`, effektiv vekt = fysisk/100 × pålitelighet × markedstid × standardtak, markedsjustert pris = pris × indeks nå / indeks ved salg, roller (primær/sekundær/markedsreferanse), robust vektet median som anker og vektet snitt som kontroll, intervall etter datakvalitet (±3–10 %), «for usikkert» uten tvungen verdi. **Ukjent er ikke middels:** ukjent lokasjon/standard/soverom/planløsning gir svake poeng og lavere pålitelighet og hindrer primærstatus; ukjent BRA-i gir vekt 0. Primær krever samme antall soverom som sluttproduktet. **Aktive annonser er aldri oppnådd salgspris:** vekt 0; ukjent fellesgjeld gir ikke totalpris/m² (aldri `?? 0`). Flere (≥ 2) svært relevante aktive sluttprodukter kan flytte *normalverdien* moderat innenfor intervallet (maks −2 % / +1 %; poeng for under ankeret, prisnedsatt, ≥ 90 dager ute). Områdeprofil (`domain/areaProfile.ts`) er datamodell + fallback og kan gi en `MarketIndex`; ingenting hentes.
* **Scenario-rangering** (`calc/ranking.ts`, versjon 1.1.0): fortjeneste 25 %, avkastning 15 %, fortjeneste per time 15 %, **risiko (objekt + scenario) 15 %**, salgsverdiens sikkerhet 10 %, stresstest 10 %, finansieringsgap 5 %, varighet 5 % – åpent i UI, ikke ett ugjennomsiktig tall. Scenariorisiko = fire dimensjoner (lav 0, middels 0,5, høy 1, **uavklart 1**; ikke vurdert = uavklart). **Bare `klar` + komplett kalkyle kan anbefales; betingede/uavklarte scenarioer styrer aldri anbefalt scenario eller anbefalt maksbud.** Under timekravet er et flagg og et lavere maksbud, ikke utestengelse.

---

## 6. Forretningsregler

### 6.1 Analyseflyt (`MockAnalysisService.requestAnalysis`, `app/analyzeFlow.tsx`)

Brukeren limer inn FINN-lenke → `parseFinnUrl` normaliserer til FINN-ID (ulike URL-formater og `utm_*` gir samme objekt) → **én samlet beslutning** (`decideRefresh` i `domain/refreshPolicy.ts`, bygget av `refreshInputFor` i `mock/context.ts`). Samme funksjon brukes av `requestAnalysis`, `requestRefresh`, `publishLinked` og varslene på objektsiden, så reglene aldri avviker mellom kodeveiene.

**Tre typer oppfriskning (aldri blandet sammen)**

| Utfall | Innhold | Jobbtype |
|---|---|---|
| **Enkel oppfriskning** (`lightweight_refresh`) | pris, visninger og salgsstatus | `light_refresh` |
| **Grundigere markedsoppfriskning** (`market_refresh`) | enkel oppfriskning + markedsreferanser + salgsverdi per eksisterende scenario + økonomien på nytt. Teknisk grunnlag og scenarioer tas over uendret; ingen ny dokumentanalyse eller scenario-screening | `market_refresh` |
| **Full/delvis faglig reanalyse** (`full_analysis`) | ny teknisk hovedanalyse. Delvis teknisk reanalyse (`technical_partial_refresh`) støttes **ikke** av modellen ennå, så slike signaler gir eksplisitt full analyse | `full_analysis` |

**Prioritet (første treff vinner; `decideRefresh`)**

1. Hovedanalyse mangler → `full_analysis`. 2. Inkompatibel med gjeldende modell → `full_analysis`.
3. Annonsen er **solgt/trukket** → `reuse` (ingen ny analyse eller oppfriskning er nødvendig).
4. **Nye/endrede kritiske dokumenter eller endrede kritiske fakta** → `full_analysis` (aldri vanlig `reuse`).
5. **Mer enn 30 dager** siden siste hovedanalyse/grundige markedsoppfriskning → `market_refresh`. Vurderes **før** 24-timersregelen, så en fersk kontroll aldri blokkerer 30-dagersregelen. Markedsoppfriskningen inkluderer den enkle, så en visningshendelse behandles av den.
6. **Offisiell visningshendelse siden siste kontroll** (visning holdt, endret, avlyst eller ny) → `lightweight_refresh`, **selv om siste kontroll er under 24 timer gammel**.
7. Ingen kontroll, eller siste kontroll **> 24 timer** gammel → `lightweight_refresh`.
8. Ellers → `reuse`.

Inndata: finnes hovedanalyse, kompatibel, tidspunkt for siste hovedanalyse, siste markedsoppfriskning og siste kontroll (siste snapshot – enkel oppfriskning eller analyse), visningshendelser, tekniske signaler og salgsstatus. «Visning holdt» utledes av koden fra lagrede offisielle visninger (ikke avlyst, startet etter siste kontroll og før nå); endret/avlyst/ny kan bare oppdages ved å hente annonsen, så de er simulerte signaler (`demo.viewingChangeSignals[finnId]`) som fjernes når annonsen er hentet. Tekniske signaler: `demo.technicalChangeSignals[finnId]`. Ingen automatisk budlogikk.

**Hva tjenesten gjør med beslutningen** (`requestAnalysis`)

| Situasjon | Resultat |
|---|---|
| Ikke innlogget / uten aktivt abonnement | `not_authenticated` / `subscription_inactive` (dialog med vei videre) |
| Brukeren har objektet (liste eller betalt før), beslutning `reuse` | `reused`: åpnes direkte, ingen belastning |
| Brukeren har objektet, beslutning `lightweight_refresh` | `light_refresh`-jobb (samtidige forespørsler kobles til samme). Belastes som **oppfriskning**. Er kvoten brukt opp, åpnes objektet uten oppfriskning |
| Brukeren har objektet, beslutning `market_refresh` (> 30 dager) | `market_refresh`-jobb med dialog «Oppdaterer markedsdata», belastet som **oppfriskning** (ikke ny analyse; teller ikke mot analysekvoten). Er kvoten brukt opp, åpnes objektet som det er. Siden viser også «Oppdater markedsdata» (`requestRefresh(.., 'market')`) |
| Brukeren har ikke objektet, beslutning `reuse` eller `lightweight_refresh` | **`linked_analysis`-jobb**: samme dialog, steg og tempo som en ny analyse; belastes som **ny analyse**. Annonsen oppfriskes først når beslutningen sier det (uten egen belastning). Brukerens analysedato (`analyzedAt`) settes ved ferdigstillelse |
| Brukeren har ikke objektet, beslutning `market_refresh` | **`market_refresh`-jobb**, dialog og trinn som en ny analyse, belastet som **ny analyse**; samtidige forespørsler kobles til samme jobb |
| Beslutning `full_analysis` (analyse mangler, inkompatibel, nye dokumenter/kritiske fakta) | **Full teknisk analyse** (versjon + 1). `requestRefresh('full')` avvises (`conflict`) uten slik årsak |
| Aktiv full jobb fra en annen bruker | Koble til samme jobb; **også denne brukeren belastes** som ny analyse når den er ferdig |

`requestRefresh('light')` er «allerede fersk» bare når en enkel oppfriskning ikke er nødvendig (`RefreshDecision.lightDue` falsk: nylig kontrollert og ingen visningshendelse), også når markedsoppfriskning er aktuell. `requestRefresh('market')` er «allerede fersk» for analyser ≤ 30 dager.

Analyse- og koblede jobber viser samme dialog («Analyserer bolig» med trinn «Henter annonse, Kontrollerer grunnlag, Vurderer oppussing, Vurderer salgsverdi, Klargjør analyse»); ferdig-melding er «Analysen er klar». Oppfriskning har egne dialoger: «Oppfrisker annonseopplysninger» («Annonsen er oppfrisket») og, for en bruker som allerede har objektet, «Oppdaterer markedsdata» («Markedsdataene er oppdatert»; trinnene er markedsoppfriskningens egne). Mens en `linked_analysis` pågår, **maskeres** objektet for brukeren (ingen analyse/snapshot/visninger) slik at det ser ut som en ny analyse (`buildMyItem`); andres `linked_analysis`-jobber vises aldri.

Jobbsimulatoren (`mock/jobs.ts`) flytter jobber frem tidsbasert (`DEMO_JOB`: 1,1 s/steg full, 0,7 s/steg oppfrisking og markedsoppfriskning fra «Oppdater markedsdata»). I demoen finnes ingen ekte markedskilde: markedsoppfriskningen oppdaterer annonsen og analysedatoen, tar teknisk grunnlag og referanser uendret, og lar koden regne på nytt. Signaler om endret teknisk grunnlag simuleres via `demo.technicalChangeSignals[finnId]`. `publishFull` publiserer **atomisk**: først valideres hele agentresultatet (kontrakt + `PublishableAnalysisSchema`); feiler det, merkes bare jobben feilet og eksisterende analyse røres ikke. Retry er idempotent (nøkkel `new_analysis:<dedupeKey>`; ny forsøk på lykket jobb gir ingen ny belastning).

### 6.2 Kvote og forbruk

* Plan (`config/plans.ts`, eksempelverdier): **15 nye analyser** og **60 oppfriskinger** per periode, 10 scenarioer per objekt.
* **Hver bruker som ber om en analyse belastes én ny analyse**, uavhengig av om grunnlaget fantes eller andre analyserer samtidig. Pågående jobber (egne og tilkoblede) teller som reservert i kvoten (`pending`).
* `usageEvents` (`new_analysis`, `refresh`, `reuse`): belastning registreres **først ved vellykket fullføring**, med idempotensnøkkel. En `market_refresh` belaster hver bruker etter `AnalysisJob.charges`: `new_analysis` (bad om analyse) eller `refresh` (oppfriskning av eget objekt – teller ikke mot analysekvoten mens den pågår). `reuse`-hendelser registreres ikke lenger for nye forespørsler og vises ikke for brukeren (typen finnes for gamle rader).
* Forbrukshistorikk er **fjernet fra Konto-siden** (krav). Kvotestatus (brukt/grense) vises i abonnementskortet.
* Endringer i egne scenarioer belastes aldri.

### 6.3 Abonnement og tilgang (`computeEntitlements`)

Tilgang vurderes etter **status OG betalt periode**, ikke oppsigelsesflagget alene:
* `full`: status `active`/`trialing` og innenfor periode (også «oppsagt ved periodeslutt» til perioden er over).
* `read_only`: `past_due`, `canceled`, utløpt, `incomplete`, ingen abonnement. I lesemodus kan brukeren **se, sortere og eksportere** egne data, men ikke analysere, oppfriske, gjenbruke eller lagre.
Lagrede objekter og scenarioer slettes aldri ved nedgradering.

### 6.4 Autentisering (mock, `MockAuthService`)

* **Google** (simulert kontovelger; to fiktive kontoer + fritekst) eller **e-post med 6-sifret engangskode**. **Ingen passord.**
* Kode: 6 siffer, gyldig 10 min, maks 5 feil forsøk, 30 s mellom nye koder, maks 5 koder per 15 min, ny kode erstatter forrige, kan brukes én gang. I demo vises koden i en simulert e-post på skjermen.
* Konto opprettes første gang kode/Google er bekreftet (navn utledes fra e-post eller Google). Ny konto havner på `/konto` med «Kontoen er opprettet».
* «Testprofiler (hopper over kode)» = `DemoService.signInAsProfile` (kun demo).
* Senere (ikke bygget): Vipps-innlogging, mobilnummer (SMS-kode), Apple – skal legges til som flere metoder bak samme `AuthService`.

### 6.5 Abonnement med Vipps (mock)

* Plan «Flippsjekk»: **200 kr/mnd** eller **2 000 kr/år** (årsprisen er et forslag: to måneder gratis). **Kampanje: første måned gratis** for nye abonnenter (`trialDays = 30`, tekst `campaign`). Kampanjen gjelder bare brukere som ikke har hatt abonnement.
* Flyt: Konto → «Velg abonnement» → dialog (intervall, pris/kampanje, mobilnummer 8 siffer som starter på 4 eller 9) → `startCheckout` oppretter en **ventende Vipps-avtale** (utløper etter 5 min) → simulert Vipps-app (Godkjenn/Avvis) → **tilgang gis først når avtalen er godkjent** (`DemoService.vipps.decide`; i produksjon: signert webhook).
* Abonnementsraden har `provider: 'vipps'` og `agreementId`.

### 6.6 Kurs og betalingsmur

* Kurskatalog i `config/courses.ts`: «Flipping nivå 1 - Privat» (**2 999 kr**, engangskjøp, tilgjengelig), «Flipping nivå 2 - AS», «Utleie nivå 1 - Privat», «Utleie nivå 2 - AS» (kommer senere).
* **Kjøpes én gang → varig tilgang**, uavhengig av abonnement (abonnement gir ikke kurstilgang; kurskjøp gir ikke abonnement; tilgang faller aldri bort).
* `CourseService.getAccess/listPurchases/startPurchase`. Pris hentes **alltid fra katalogen**, aldri fra klienten. Ingen dobbeltkjøp. Betalingen er «pending» til Vipps bekrefter; avvist/utløpt gir ingen tilgang.
* Uten kjøp vises `CoursePaywall` (pris, innhold, modultitler og -formål; **selve innholdet er låst**, også ved direkte lenke). Kjøp vises under «Mine kurs» på Konto.
* Demo: Ada har kjøpt kurset, Bjørn ikke.
* **Viktig:** kursinnholdet ligger i klientbygget, så muren er **ikke ekte sikkerhet** før innhold leveres fra server bak tilgangskontroll (se §10).

### 6.7 Kalender og budprognose

* Kalender åpner som **månedskalender** (uker nedover, mandag–søndag bortover, ukenummer); **listevisning** som valg, huskes per bruker. Mobil: ikoner i dagsruter, trykk for dagens hendelser.
* «Forventet buddag» = kl. 12:00 (Europe/Oslo) dagen etter siste kjente, ikke-avlyste **offisielle** visning. Helg/helligdag → advarsel og første virkedag. Private visninger påvirker ikke prognosen; uten offisiell visning ingen prognose. Privat overstyring bevarer kildeverdien. `.ics`-eksport med stabile UID-er og VTIMEZONE Oslo.

### 6.8 Sammenlignbare objekter, risiko, sjekkliste

* **Sammenlignbare:** analysens objekter har eksplisitte felt: `askingPrice`, `soldPrice` (kontant), `soldTotalPrice` (inkl. fellesgjeld), `commonCosts` (per mnd), `area`, `date`, `notes`, `kind` (`solgt` | `prisantydning` | `solgt_uten_sum`). Brukeren kan legge inn **egne** (maks 50 per bolig), med validering (`validateComparable`). kr/m² beregnes (solgt totalpris → solgt pris → prisantydning). Faktiske salg skilles fra prisantydninger; salg uten dokumentert sum teller ikke som oppnådd pris. Median kr/m² beregnes bare på faktiske salg.
* **Risiko (redigerbar privat):** brukeren kan **endre**, **skjule** (vises under «Skjult av deg», kan vises igjen, teller ikke i samlet risiko) og **legge til egne** risikoer (maks 50). Endringer ligger i `userRisks` (`baseRiskId`, `removed`) og påvirker aldri analysen. Endring av risiko som senere forsvinner fra analysen beholdes som egen risiko. Samlet risiko = høyeste kjente alvorlighet (1–10); ukjent alvorlighet telles separat og senker aldri scoren; uten kjente nivåer «Uavklart» (`domain/assessment.ts`). `effectiveRisks` brukes av risikofane, nøkkeltall og listen.
* **Datakvalitet** holdes adskilt fra risiko: 70 % sjekkliste (dokumentert 1, delvis 0,5, mangler 0) + 30 % dokumenterte nøkkelfakta.
* **Sjekkliste:** 12 faste punkter; brukerens avkrysning er en **privat bekreftelse** og endrer aldri kildestatus.

### 6.9 «Analyser forsvinner aldri»

Etter en skadelig skjemaendring forsvant analyser i en brukers lokale data. Regel: en felles analyse skal **aldri** mangle for et eksisterende objekt. `healMissingAnalyses` gjenoppretter ved oppstart uten jobb/belastning og flytter scenarioer til gjenopprettet analyse med uendrede verdier. Behold og test dette ved alle skjemaendringer.

### 6.10 Import og eksport

* **Import v1** (`format: "flipprom-analysis"`, `version: 1`, maks 20 objekter og 1 MB): forhåndsvisning, valgfri håndtering, lagres som **private utkast** (`visibility: 'private'`) og scenarioer; publiseres ikke som felles analyse. Importerte buddager/visninger merkes «ikke kildebekreftet». Se `docs/formater.md`.
* **Eksport** av egne scenarioer (`format: "flipprom-scenarios"`), kalender (`.ics`), kursbudsjett/sjekklister (utskrift, `.csv`/`.txt`). Filnavn har prefikset `flippsjekk-`.

### 6.11 Oversikt, filtre, sammenligning

* Oversikt: tabell/kort, aktiv/arkiv-visning, sortering, kolonnevalg, filtre (boligtype, eierform, kjøpertype, risiko, datakvalitet, anbefaling, arbeidsstatus, salgsstatus, pris, resultat, favoritter). **Områdefilteret er satt på pause** (krav K-4): `districts` finnes i filtertypen for bakoverkompatibilitet men ignoreres. Søk på adresse/område/FINN-kode virker.
* Sammenligning: **inntil tre objekter**, samme nøkkeltall fra primært scenario og samme motor.

### 6.12 Scenarioer, overstyringer og marked (modell 1.2)

* **Kalkyle (fane Kalkulator):** Egenkapitalbehov, finansieringsgap, toppgjeld, fortjeneste og **fortjeneste per egeninnsatstime** står øverst; egen tid trekkes aldri som kostnad. Uten egne timer vises «Ikke beregnet», aldri 0 eller uendelig. Kravet (standard 500 kr/t) vises som ok/under – og «Modellert maksbud» viser grensene hver for seg (fortjenestemål, timekrav) med «Anbefalt maksbud (laveste grense)» og hva som begrenser.
* **Forutsetninger (Konto):** grupperte standarder (tid og egeninnsats, finansiering, salg, arbeidsfordeling) som kopieres inn i nye kalkyler. Endring av profilstandard endrer ikke eksisterende kalkyler som brukeren har overstyrt.
* **Overstyring:** hvert felt i en kalkyle viser grunnverdi, opprinnelse (agent / profil / endret av deg) og «Tilbakestill». Valg av agentscenario i en kalkyle bygger nye grunnverdier uten å røre brukerens egne endringer.
* **Oppussing (fane Oppussing):** materialer, innleid arbeid og egne timer vises hver for seg; arbeidsmodus per tiltak; regulert arbeid er alltid innleid uten relevant kompetanse/ansvar bekreftet for det aktuelle området (bekreftes per område i tabellen «Hvem utfører arbeidet?», både på Konto og i kalkylen); tiltak med arbeidskategori har låste eldre fagfelt (ingen dobbelttelling); «Maks egeninnsats» oppgraderer bare ikke-regulert arbeid og viser hvor mye tid det koster mot kapasiteten (timer per uke × måneder).
* **Marked (fane Marked):** per scenario vises den ene autoritative salgsverdien (markedsmotoren) med kilde, og tabellen «Tre verdier som holdes adskilt» (markedsmotoren, agentens historiske estimat, din private kalkyle). Under vises anker, kontrolltall, intervall, datakvalitet, forskyvning fra aktive annonser og ankerjustering, og referansene med ukjente felt. «For usikkert» vises uten tvungen verdi (agentens estimat vises da som merket fallback). Eldre analyser viser tydelig at salgsverdien er global. Sluttstandard velges automatisk fra scenarioet (kan overstyres privat).
* **Sammenligning av scenarioer:** rangeringskort viser alle kriterier og flagg (betinget, finansieringsgap, under timekrav, høy scenariorisiko …), scenariorisiko per dimensjon og maksbudgrensene. Anbefalt scenario og anbefalt maksbud kommer aldri fra et betinget eller uavklart scenario.

* **Oppfriskning:** 30-dagersregelen gir grundig markedsoppfriskning, ikke full analyse (se §6.1). Siden viser «Markedsdataene er N dager gamle» med «Oppdater markedsdata»; «Bestill ny teknisk analyse» vises bare ved teknisk årsak.

---

## 7. Kurs «Flipping nivå 1 - Privat» (`src/course/`)

* **11 moduler i låst rekkefølge** (ikke omorganiser/slå sammen/del/legg til): 1 Slik fungerer en flipp · 2 Finn og grovsorter objekter · 3 Undersøk boligen før du regner · 4 Finn realistisk salgsverdi · 5 Planlegg verdiskapingen · 6 Bygg hele prosjektbudsjettet · 7 Skatt når du flipper privat · 8 Lønnsomhet, risiko og maksbud · 9 Visning, bud og kjøp · 10 Gjennomfør oppussingen · 11 Selg og avslutt prosjektet. Totalt 53 sider, ~3 t 37 min. Testet i `course.test.ts`.
* Hver modul består av flere sider vist **én om gangen** («Modul X av 11», «Side X av Y», Forrige/Neste), avsluttes med **kontrollspørsmål** (eksakt oppgitt tekst; ikke finn på nye). URL: `?modul=4&side=2`, `side=q`, `modul=sluttcase|sluttquiz|ferdig`.
* **Prosa først**; faste komponenttyper: Gjeldende regel, Regelradar, Flippsjekk-tips, Rødt flagg, Eksempel, Dette må avklares, Kort forklart, Husk. Utdypinger i åpne/lukkbare seksjoner. Skatte-/finansieringsregler har faglig kontrolldato **17. oktober 2026** (`COURSE_CHECKED`, vises på infosiden, under sider og i utskrifter).
* **Sluttcase** (6 trinn, utenfor modulene) og **sluttquiz** (15 spørsmål, **bestått ≥ 12**) og fullføringsside (åpnes bare etter bestått quiz).
* Side regnes som **lest først når brukeren trykker Neste eller markerer den selv**. Fremdrift lagres per bruker i `usePref` (`…course.flipping-privat.v2`); gammel v1 overføres bare for kalkyle/budsjett/avkrysninger.
* **Før-bud-sjekklisten** er et verktøy som kan åpnes fra relevante moduler og på slutten. Kalkulatoren bruker samme motor; Case A/B/C i modul 8.6 (Case A: −284k / −87k / +208k; maksbud ≈ 2,91 mill. høy / 2,63 mill. base ved 300k mål).
* Ukjent er ikke 0; utdypende regler i widgetene (budsjett, risiko, stresstest, maksbud) følger samme prinsipp.
* Kursinnholdet er data (`content/*.ts`, `Block`-typer i `types.ts`), rendret av `BlockView.tsx`. Ordlistebegreper skrives `{{nøkkel|tekst}}` og må finnes i `glossary.ts` (testet).

---

## 8. Frontend-konvensjoner

* **Tall og språk:** `Intl` med `nb-NO`. Norske tall bruker **NBSP/smalt mellomrom** som tusenskille og **U+2212** som minus. I Playwright/regex: bruk `\s` og `[−-]`, ikke vanlig mellomrom/bindestrek.
* Manglende verdi vises som «Ikke avklart» (`UNKNOWN`) eller «Mangler grunnlag» (`NO_BASIS`).
* **Tilgjengelighet:** faktabokser og tagger har tekstetikett + ikon (ikke bare farge); knapper har tilgjengelige navn; dialoger er `role=dialog`. Test-selektorer bruker roller og navn.
* **Responsivt:** ingen horisontal sideskroll (e2e sjekker `scrollWidth <= innerWidth` på desktop 1440 og Pixel 7). `.overflow-x-auto` har `position: relative` globalt fordi sr-only-tekst ellers kan skape sidescroll.
* **UI-primitiver** i `components/ui/` (`Button`, `Card`, `Badge`, `Alert`, `Dialog`, `Field`, `NumberInput` osv.).
* **Tekstregler for analyse (krav):** ikke bruk «felles analyse», «andre brukere», «eksisterende analyse», «gjenbruk» eller versjonsnummer overfor brukeren. Bruk formuleringer som «dine kalkyler er private», «analysen din», «Analyse fra 18. okt. 2026». Datert varsel: «Dataene kan være utdatert … Vi anbefaler at du oppfrisker analysen».
* **Forsiden** (`pages/LandingPage.tsx`): hero med seks punkter (kalkulering av kostnader/utgifter/salgspris, maks budpris, oversiktlig budsjett, oversikt over alle aktuelle boliger, visningskalender, flippekurs), hovedbilde (`HeroVisual`), fem hovedtrekk-bokser, CTA «Prøv gratis», og **abonnement nederst** (månedlig/årlig, kampanje 1 mnd gratis, kursprisen som egen linje). Ingen «Trondheim først». **«Slik fungerer det»** (`pages/HowItWorksPage.tsx`): fire steg, tre illustrerte skjermer (oversikt, objekt med glidebrytere som bruker motoren, kalender) og funksjonskort.

---

## 9. Testing

* **Vitest** (`src/**/*.test.ts`, miljø `node`, `TZ=UTC`): motor (kontrolltall), modell 1.1 (`model11.test.ts`), markedsvekting (`market.test.ts`), rangering (`ranking.test.ts`), områdeprofil, scenario, FINN-parsing, budprognose/helligdager, kalender, ics, sortering, agentkontrakt (mot `docs/eksempel-agent-analyse.json`), kurs (struktur, 11 moduler, 15 quiz, ordliste), og **tjenestetester** i `services/mock/services.test.ts` (tilgang, kvote, dedup, eierskap, kode/Google, Vipps, kurskjøp, risiko, import, abonnementstilstander).
* **Playwright** (`e2e/`, desktop + mobil; `demokontroller` kun desktop): hovedflyt, scenarier/overstyringer/markedsvekting (`scenarier.spec.ts`), innlogging/Vipps, kurs (inkl. betalingsmur), forside, sammenlignbare, risiko, testkontroller. Starter `vite --port 5198 --strictPort` selv. `test-results/` og `playwright-report/` er git-ignorert.
* Regel: nye forretningsregler får enhetstest i tjenestelaget **og** (hvis brukersynlig) e2e. Endrer du tekst brukere ser, oppdater e2e-selektorene.
* Demo-hjelp: «Testkontroller» (lilla stripe) – bytte bruker, sette abonnementstilstand, ferdige FINN-lenker (`DEMO_FINN` i `seedProperties.ts`), simulere feil, tilbakestille, skade lagring.

---

## 10. Hvordan bygge videre til produksjon

Rekkefølge anbefales i denne sekvensen. Hvert steg har akseptkriterium. Grensesnittene i `src/services/types.ts` er kontrakten – implementer dem i `src/services/supabase/` (og tilsvarende for Vipps/agent) og velg dem i `createAppServices` når `VITE_FLIPPROM_MODE=production`. **Fjern/skjul `DemoService`, testkontroller, `signInAsProfile`, `demo.vipps` og `demo.billing` i produksjon.**

### 10.1 Supabase: database, RLS og Realtime
1. Opprett Supabase-prosjekt. Lag skjema fra `docs/datamodell.md` («Forslag til Postgres/Supabase»). Legg til tabeller som mocken har fått etterpå: `user_risks`, `course_purchases`, `user_properties.analyzed_at`, jobbtype `linked_analysis`, `subscriptions.provider = 'vipps'` + `agreement_id`.
2. **RLS:** felles tabeller (`properties, snapshots, analyses, viewings, analysis_jobs`) kan leses av innloggede, men **skrives bare med service-rolle**. Private tabeller eieravgrenses (`user_id = auth.uid()`). Kontroller eierskap for refererte rader (scenario → eiendom i egen liste → lesbar analyse). `primary_scenario_id` må peke på eget scenario (trigger/sjekk). Skriv **RLS-tester** (bruker B kan ikke lese/endre A sine scenarioer – mocktesten viser forventet oppførsel).
3. `SupabasePropertyRepository`, `…ScenarioRepository` og lesing av analyser (`SupabaseAnalysisReader`) og `…ProfileService` er skrevet. Fase 2B-databasen er live-verifisert (migrasjon 9 + 228/228 RLS); nettleserflyten gjenstår. Gjenstår: `…ComparableRepository`, `…RiskRepository`, `…CalendarService`, `…ImportService`. `DataEvents` via Supabase Realtime. NB: klienten kan ikke opprette rader i `user_properties` (migrasjon 9); det gjør backend ved kobling til en analyse.
4. **Maskering av «koblede» analyser** (§6.1) må gjøres i spørringen/visningen: andre brukeres `linked_analysis`-jobber skal aldri være synlige.
5. Migrering av demodata er ikke nødvendig; produksjon starter tomt.
Akseptkriterium: alle tjenestetester i `services.test.ts` kan kjøres mot Supabase-implementasjonen (parametriser `setup()`), og RLS-testene er grønne.

### 10.2 Innlogging (Supabase Auth)
* Aktiver **Google OAuth** (Google Cloud-prosjekt, OAuth-klient, redirect til Supabase) og **e-post OTP** (6-sifret engangskode; sett kodens levetid/rate limit i Supabase, ikke bare klient). Konfigurer SMTP/e-postleverandør (Resend/Postmark o.l.) med norsk e-postmal («Din innloggingskode til Flippsjekk: 123456»).
* `SupabaseAuthService`: `requestEmailCode` → `signInWithOtp({ email })`; `verifyEmailCode` → `verifyOtp({ email, token, type: 'email' })`; `signInWithGoogle` → `signInWithOAuth({ provider: 'google' })` (returner `{ kind: 'redirect', url }` – UI støtter allerede dette). Opprett `profiles`-rad ved første innlogging (trigger på `auth.users`).
* Behold UX-reglene: ingen passord, avslør ikke om kontoen finnes, feil/utløpt kode gir forståelige meldinger.
* **Senere metoder** (Vipps Login, mobilnummer/SMS-OTP, Apple) legges til som flere knapper i `AuthPages.tsx` og metoder i `AuthService` – ikke endre eksisterende.
Akseptkriterium: e2e `innlogging` kjøres mot test-Supabase (egen testbruker/inbox), og ingen passordfelt finnes.

### 10.3 Abonnement med Vipps (Recurring)
* Bruk **Vipps MobilePay Recurring API** (betalingsavtaler: `agreements` + `charges`). Backend (Supabase Edge Function) holder hemmelighetene: `VIPPS_CLIENT_ID`, `VIPPS_CLIENT_SECRET`, `VIPPS_SUBSCRIPTION_KEY` (Ocp-Apim-Subscription-Key), `VIPPS_MERCHANT_SERIAL_NUMBER`, webhook-hemmelighet. **Aldri i klienten.** (Verifiser endepunkter/felter mot gjeldende Vipps-dokumentasjon; test i Vipps testmiljø med testbruker.)
* `startCheckout({planId, interval, phone})`: backend oppretter avtale (beløp **fra serverkonfig**, aldri fra klient; kampanje: første trekk utsatt 30 dager hvis brukeren ikke har hatt abonnement) og returnerer `{ kind: 'redirect', url }` (Vipps `confirmationUrl`). UI støtter redirect.
* **Webhook** (signert, idempotent på event-ID) setter `subscriptions` (`trialing`/`active`/`past_due`/`canceled`) og legger inn `agreement_id`. **Retur fra Vipps er aldri bevis på betaling.** Månedlige/årlige `charges` opprettes av planlagt jobb (cron/Edge) – håndter feilede trekk (`past_due`), purring og oppsigelse (`cancelAtPeriodEnd`).
* `openCustomerPortal`: oppsigelse/endring av avtale (Vipps-appen + egen side). Intervallbytte gjelder fra neste periode.
* Fjern `DemoService.billing` og `DemoService.vipps`.
Akseptkriterium: tilgang aktiveres kun etter bekreftet webhook; dobbelthendelser gir ingen duplikat; `computeEntitlements`-logikken er flyttet til server (RPC/view) og gir samme svar som mocken.

### 10.4 Kurskjøp (Vipps ePayment, engangsbeløp)
* Bruk **Vipps ePayment API** for 2 999 kr engangsbetaling. Backend oppretter betaling med beløp fra `config/courses` (serverkopi), returnerer redirect-URL. Webhook oppretter `course_purchases` **idempotent på Vipps-referansen** (unik `payment_id`; unik (`user_id`,`course_id`)).
* **Lever kursinnholdet fra server:** flytt `src/course/content/*` til database/Storage og hent moduler/sider via en funksjon som sjekker `course_purchases` (RLS). Salgssiden viser bare titler/formål. Uten dette er betalingsmuren ikke sikkerhet.
* Avklar juridisk: **angrerett for digitalt innhold** (samtykke til umiddelbar levering), kvittering, mva (kurs 25 %), vilkår.
* Fremdrift (`course.*`) bør flyttes fra `localStorage` til tabell per bruker.
Akseptkriterium: bruker uten kjøp får ikke kursinnhold selv med direkte kall mot API.

### 10.5 Analyseagent (AI)
* Agenten (kø/worker bak `AnalysisService.requestAnalysis`) leverer **kun strukturert JSON** etter `docs/agentkontrakt.md` (`flipprom-agent-analysis` v1). Kontrakten valideres i `src/domain/agentContract.ts` (flytt/del valideringen til serveren). **Agenten leverer aldri økonomiske nøkkeltall** (`profit`, `maxBid`, `projectReturn`, `breakEven`, `roi` avvises) – alt regnes av motoren.
* Krav til innhold: ukjent = `{value:null,status:'uavklart',sourceId:null}`; «dokumentert» krever kilde; ingen udokumentert markedsvekst; uavklart verdiøkning (nytt soverom, utleiedel, seksjonering) regnes ikke med; faktiske salg skilles fra prisantydninger; 12 sjekklistepunkter; oppussingsalternativer lett/hoved/omfattende.
* Jobbmodell: tabell `analysis_jobs` med status/steg/fremdrift (Realtime), `dedupe_key = property_id:type:v<målversjon>:s<skjema>:m<modell>` (unik indeks på **aktiv** nøkkel – ikke bare klientsjekk), tidsavbrudd, nye forsøk, overvåking. Publisering **atomisk i én transaksjon** etter `PublishableAnalysisSchema` (se `publishFull`). Én brukers private dokumenter/kommentarer sendes **aldri** til agenten som grunnlag for felles analyse.
* Brukerflyten i §6.1 (inkl. `linked_analysis`, oppfriskning > 24 t, belastning per bruker, lik opplevelse) skal beholdes uendret mot ekte agent. Kvote/`usage_events` håndheves i database/edge, ikke klient.
* **Datakilde:** avklar og dokumenter **rett til å hente, lagre og gjenbruke annonsedata** (avtale/lisens med FINN eller annen kilde), vilkår for delt cache mellom abonnenter, og personvern (DPIA) for lagring av megler-/selgeropplysninger – **før** ekte annonser vises for betalende.
* Kostnadskontroll: rate limit per bruker, budsjett per jobb, logging av modellkall (ikke persondata), kvalitetsporter (kontrakt + tester med eksempel-JSON).
Akseptkriterium: ekte agent består `agentContract.test.ts` mot sine eksempler; feilede/ugyldige leveranser gir feilet jobb uten å røre eksisterende analyse.

### 10.6 Drift, sikkerhet og lansering
* Miljøvariabler: klient `VITE_FLIPPROM_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; server (Edge/CI-secrets) `SUPABASE_SERVICE_ROLE_KEY`, Vipps-nøkler, agent-nøkler, e-postnøkkel. **Ingen hemmeligheter i repo eller klientbygg.**
* Feillogging (Sentry e.l.), produktanalyse uten persondata, sikkerhetskopiering, vilkår og personvernerklæring, cookie-/lagringsinfo, tilgjengelighetsgjennomgang.
* Tidssone/helligdager: `Europe/Oslo`; kalenderlogikk er testet – behold `Clock`-injeksjon.
* Legg til CI (GitHub Actions) som kjører typecheck, Vitest og Playwright før deploy (i dag bygger `pages.yml` bare og publiserer).
* Fjern «Demo»-stripe og `DemoFrame` i produksjon (styres av modus).

---

## 11. Distribusjon (GitHub Pages)

Repo: `https://github.com/loteand-jpg/Flippsjekk` (`origin`, gren `main`). `.github/workflows/pages.yml` bygger (`npm ci && npm run build`) og publiserer `dist/` ved push til `main`. **Settings → Pages → Source: GitHub Actions** (ikke «Deploy from a branch» og ikke Jekyll/Static HTML-mal). Siden vises på `https://loteand-jpg.github.io/Flippsjekk/`. Å åpne `index.html`/`dist/index.html` direkte (`file://`) gir blank side fordi nettlesere blokkerer moduler/CSS derfra; kjør `npm run dev`/`preview` eller en webserver. Publiserte råfiler fra rot blir blanke fordi `index.html` peker på `src/main.tsx`.

---

## 12. Beslutningslogg (hvorfor)

| Valg | Begrunnelse |
|---|---|
| Hash-ruting + `base: './'` | Statisk hosting uten serverkonfigurasjon, også under undermappe |
| Mockdatabase i `localStorage` med Zod-radvalidering | Hele flyten kan demonstreres uten backend; samme kontrakter som produksjon |
| Tjenestegrensesnitt (`services/types.ts`) | Bytte backend uten å bygge UI om |
| Deterministisk motor, agent leverer ingen tall | Sporbarhet, testbarhet, ingen «hallusinerte» nøkkeltall |
| Felles analyse + private scenarioer | Gjenbruk av dyr analyse uten å dele brukerdata |
| Brukeren skal ikke se at analyse gjenbrukes; belastes per bruker | Forretningskrav: lik opplevelse og rettferdig belastning (K-30–K-37) |
| `linked_analysis` som egen jobbtype | Gir lik fremdrift/belastning uten ny agentkjøring |
| Oppfriskning (> 24 t / passert visning) uten egen belastning for nye brukere | Fersk pris/visning/status uten dobbel kostnad |
| Låst «Nettsidens vurdering» | Grunnlaget alltid tilgjengelig som referanse |
| Risiko som overstyringsrader (`userRisks`) | Brukeren kan endre uten å røre delt analyse |
| Kurs som data (blokker) + egne widgets | Innhold kan endres uten kodeendringer i renderingen; regneeksempler bruker samme motor |
| Kurs = engangskjøp, varig tilgang, uavhengig av abonnement | Forretningskrav (K-47–K-49) |
| Passordløs innlogging (Google + e-postkode) | Krav; mindre angrepsflate; Vipps/Apple/SMS kan legges til senere |
| Vipps for abonnement og kurs | Krav; norsk betalingsmetode |
| Prisen i `plans.ts`/`courses.ts` er eksempelverdier | Ingen kommersiell pris er besluttet; serveren må eie beløp i produksjon |
| Interne identifikatorer beholdt som «flipprom» (`flipprom.mockdb`, `flipprom.pref.*`, `flipprom-analysis`, `flipprom-scenarios`, `flipprom-agent-analysis`, planId `flipprom-pro`, demo-e-post `@demo.flipprom.no`, kalender-UID `@flipprom.no`) | Endring ville brutt lagrede data, importfiler, innlogging og kalenderabonnement. Bytt samtidig med en migrering før lansering |
| Områdefilter pauset | Krav K-4: produktet er generelt; kan slås på igjen |
| Forbrukshistorikk fjernet fra Konto | Krav K-52 |
| Tilgang etter status **og** periode | Oppsagt abonnement beholder tilgang ut perioden; lesemodus ellers |
| Egen tid er ikke en kostnad; krav til fortjeneste per egeninnsatstime (modell 1.1) | Spesifikasjon: `hourValue` ga misvisende resultat og fikk egen tid til å se «gratis» eller «dyr» ut |
| Separate kjøps- og oppussingslån, oppussingslån trekkes gradvis (snitt halvparten) | Mer realistisk rentekostnad og egenkapitalbehov; samme tall som før når begge andeler er like |
| Salgskostnader ikke med i egenkapitalbehov | De betales av salgsprovenyet, ikke ved kjøp |
| Modell 1.1.0 og 1.2.0 uten ny major | Analyser lagrer ingen beregnede tall, så de er fortsatt kompatible og regnes med gjeldende motor. 1.2.0 er *ikke* bit-for-bit identisk med 1.0/1.1 når kjøpskostnadene > 0 (kjøpslån kun på P) – dokumentert i stedet for skjult |
| Eksplisitt DB-migrering v3→v4 | MockDatabase beholder rå rader; skjemaendringer må ikke krasje eller miste brukerens kalkyler |
| `AnalysisScenario` er `strictObject` uten økonomiske nøkler | Agenten leverer forutsetninger, aldri beregnede tall (fortjeneste, maksbud) |
| Global salgsverdi kopieres aldri til alternativscenarioer | Et alternativ med annet sluttprodukt skal ikke arve verdien fra basis |
| Regulert arbeid alltid innleid uten bekreftet kompetanse | Sikkerhet/lovverk; «maks egeninnsats» må ikke late som elektro/rør/våtrom er gratis |
| Markedsvekting V1 er ren, versjonert funksjon uten datahenting | Testbar og forklarbar; parametere er ikke validert mot reelle salg ennå |
| Rangering som åpne kriterier + materialitetsgrenser | Små forskjeller skal ikke gi full uttelling; ingen skjult AI-score |
| Betinget scenario styrer ikke anbefalt maksbud | Et bud skal ikke bygge på noe som ikke er avklart |
| Kjøpslånet gjelder kjøpesummen P, ikke P + K (modell 1.2.0) | Produktbeslutning: kjøpskostnader dekkes av egenkapital. Historiske tall er ikke bit-for-bit identiske – dokumentert, ikke skjult. Kurset beholder den eldre regelen (`purchaseLoanBasis`) så kursteksten ikke endres |
| Timekravet som egen maksbudgrense + rangeringsfaktor, ikke port | Kravet er brukerens lønnsomhetsmål. Et scenario under kravet kan likevel være attraktivt ved lav kjøpspris; anbefalt maksbud er den laveste grensen med synlig begrensning |
| Scenariorisiko (teknisk, kostnad, tid, myndighet) i rangeringen | Basis og et bad-/kjøkkenflyttingsscenario har ulik risiko; samme objektrisiko for alle var ikke nok. Ikke vurdert = uavklart (ukjent er ikke middels) |
| Én autoritativ salgsverdiflyt: kode fastsetter low/base/high | Agentens estimat og markedsmotoren ga to konkurrerende fasiter. Agenten leverer nå bare sluttprodukt, klassifisering og en begrenset (±5 %), begrunnet ankerjustering. Markedsvurderingen regnes per analysens dato så grunnverdiene er stabile |
| `endProduct.standardClass` med merket fallback | Ikke anta «nyoppusset» for alle scenarioer; udokumentert standard fremstår aldri som dokumentert |
| Ukjent er ikke middels i markedsvekting; ukjent fellesgjeld på aktiv annonse blir ikke 0 | Dokumentasjonsmangler straffes primært via pålitelighet; en svakt dokumentert referanse skal ikke bli kunstig sterk |
| Aktive annonser som begrenset markedssignal (−2 %/+1 %) | Flere svært relevante annonser under ankeret/prisnedsatt/lenge ute påvirker plassering innenfor intervallet. Aldri en ny fasit og aldri en del av ankeret |
| Én kostnadsmodell per tiltak (arbeidsmodell ELLER eldre fagfelt) | Hindrer at arbeid telles to ganger. Agentkontrakt avviser; lagrede rader normaliseres |
| Kompetanse for regulert arbeid per område | Elektro-kompetanse gjør ikke rør/våtrom gratis. Gammelt samlet flagg nullstilles konservativt |
| 30 dager gir markedsoppfriskning, ikke full analyse | Teknisk grunnlag foreldes ikke av tid alene. Full analyse kun ved nye dokumenter, endrede kritiske fakta eller inkompatibel modell |
| Én samlet beslutningsfunksjon for oppfriskning (`decideRefresh`) | Tidligere hadde `requestAnalysis` (24 t uten 30-dagersvurdering for eksisterende brukere), den koblede jobben (`needsRefresh`) og knappen på objektsiden litt ulike regler. Nå er det én testbar kilde |
| 30 dager vurderes før 24 timer, også for brukere som har objektet | En fersk kontroll skal ikke skjule at analysen er gammel. Markedsoppfriskningen inkluderer den enkle oppfriskningen |
| Visningshendelse utløser enkel oppfriskning selv under 24 timer | En holdt, endret, avlyst eller ny offisiell visning er viktig (buddag, kalender). Utledes fra lagrede visninger (holdt) eller kildesignal (endret/avlyst/ny) |
| Solgt/trukket annonse gir `reuse` | Ingen grunn til å oppfriske eller analysere på nytt; unngår unødvendig full analyse |

---

## 13. Krav gitt av oppdragsgiver (komplett liste)

Disse er brukerens egne krav gjennom prosjektet. **Ikke brudd dem uten eksplisitt godkjenning.** (K = krav.)

**Generelt**
* K-1. Norsk bokmål i all brukertekst. K-2. Navnet er **Flippsjekk**. K-3. Produktet er generelt (ikke begrenset til Trondheim); fjern «Trondheim først» fra forsiden. K-4. **Områdefiltrering pauses** (fjernet fra filterpanelet; ignoreres i logikken).
* K-5. Ukjent betyr aldri 0 kroner. K-6. Frontend og forretningslogikk med **mockdatabase** (demo uten API-nøkler); simulert innlogging/abonnement/agent; testkontroller i demo; ingen vei til betalt tilgang i produksjon.

**Analyse og data (opprinnelig spesifikasjon)**
* K-7. Felles grunnanalyse (versjonert) + **private scenarioer**; scenarioer slettes aldri. K-8. Deterministisk beregningsmotor (formler i §5), maksbud, stresstester, modellversjon. K-9. Agentkontrakt med strenge regler (§10.5), atomisk publisering, kvalitetsporter. K-10. Jobbsimulator med fem steg, deduplisering, idempotent retry, feil uten belastning. K-11. Kalender med forventet buddag, private visninger, overstyring, `.ics`. K-12. Import v1 (private utkast) og scenarioeksport. K-13. Sammenligning av inntil tre objekter. K-14. Risiko og datakvalitet adskilt; sjekkliste med private bekreftelser. K-15. Abonnementstilstander og lesemodus. K-16. Eksempeldata (13 fiktive objekter, to testbrukere som deler objekter).

**Kalender**
* K-17. Standardvisning er **vanlig månedskalender** (uker nedover, dager bortover); **liste** som valg (tidligere visning).

**Scenarioer og sammenlignbare**
* K-18. Datamodellen skiller tydelig database (felles) og private data. K-19. Hentes en FINN-lenke, lagres grunnlaget som **låst scenario «Nettsidens vurdering»**. K-20. Låst scenario **opprettes automatisk ved første lagrede endring** av Hovedscenario; ellers uendret oppførsel. K-21. **Analyser skal aldri forsvinne «falskt»**: et objekt skal ligge i brukerens liste til det fjernes eller det har gått 1 mnd siden solgt/trukket; ingen krav om å hente på nytt (auto-heal). *(Auto-opprydding 1 mnd etter solgt/trukket er foreslått, ikke implementert.)* K-22. Brukeren kan legge inn **egne sammenlignbare objekter** med: objekt, prisantydning, solgt pris, felleskostnader, solgt totalpris, areal, kr/m², dato, merknad – og disse feltene skal også finnes på sammenlignbare fra grunnlaget.

**Risiko**
* K-23. **Risiko skal kunne endres** på objektet på lik linje med øvrige data (privat; endre, skjule, legge til, tilbakestille).

**Kurs «Flipping nivå 1 - Privat»**
* K-24. Navn og serie: «Flipping nivå 1 - Privat»; kommende «Flipping nivå 2 - AS», «Utleie nivå 1 - Privat», «Utleie nivå 2 - AS». K-25. **Nøyaktig 11 moduler i låst rekkefølge** (§7), flere sider per modul vist én om gangen med Forrige/Neste, «Modul X av 11»/«Side X av Y». K-26. Prosa først; faste komponenttyper; utdypinger i åpne/lukkbare seksjoner; ikke flytt/fjern innhold eller endre faglig mening. K-27. **Faglig kontrollert 17. oktober 2026** på infosiden. K-28. Eksakte kontrollspørsmål per modul (ikke finn på nye); sluttcase (6 trinn) etter modul 11; **sluttquiz på nøyaktig 15 spørsmål, bestått ≥ 12**; fullføringsside; før-bud-sjekkliste som verktøy; kalkulator med eksisterende motor; Case A/B/C i modul 8.6. K-29. Side regnes som lest bare ved Neste eller eksplisitt markering. *(Brukerens kursbeskrivelse ble avkortet midt i §14 – kalkulatoren følger uendrede formler; innhold etter dette er ukjent.)*
* K-47. **Kurset ligger bak betalingsmur: 2 999 kr**. K-48. **Kjøpes én gang → varig tilgang.** K-49. Betaling via **Vipps**; tilgang først etter bekreftet betaling; uavhengig av abonnement.

**Analyseopplevelse (rene krav)**
* K-30. Brukeren skal **ikke** få beskjed om at en analyse finnes fra før eller at andre analyserer samtidig. K-31. Opplevelsen er **lik** uavhengig av om grunnlag finnes; det kan ta litt tid selv om grunnlaget finnes. K-32. **Kvoten teller alltid som ny analyse**, også ved gjenbruk; brukeren belastes uavhengig av andre brukere. K-33. Analysedato vises som **bare dato** (ingen versjon). K-34. Er opplysningene > 1 døgn gamle, **eller en visning har vært**, skal annonsen oppfriskes (pris, visninger, solgt) men belastes bare som én ny analyse; analysedato oppdateres. K-35. For objekt i **egen liste** (brukeren har analysert før): over 1 døgn siden forrige analyse/oppfriskning → **oppfrisk annonsen**. K-36. **Tekster**: ingen «felles analyse»/«andre brukere»; grunnanalyse og egne endringer oppleves som brukerens egne; «dine kalkyler er private»; markedsfane skal ikke si at data er felles. K-37. Ny/oppdatert grunnanalyse → varsel «data kan være utdatert, vi anbefaler oppfriskning».

**Forside og informasjon**
* K-38. Forsiden skal være **lokkende**: bedre toppseksjon, hovedtrekk. K-39. «Slik fungerer det» flyttes til **egen side** med visning av: oversikt over boliger (liste), inni et objekt (redigere budsjett m.m.) og kalenderen. K-40. Abonnement flyttes til **Konto** (og vises også nederst på forsiden, se K-45). K-41. Erstatt avkrysningene med seks punkter: kalkulering av kostnader/utgifter/salgspris, maks budpris, oversiktlig budsjett, oversikt over alle aktuelle boliger, visningskalender, flippekurs. K-42. Hovedbildet skal være representativt for konseptet. K-43. «Prøv demoen» → **«Prøv gratis»**. K-44. De fire boksene erstattes med passende bokser, gjerne en femte for kurs. K-45. **Abonnement nederst på forsiden**: månedlig og årlig, **200 kr/mnd**, **kampanje: 1 mnd gratis** visualisert. K-46. Navn byttet til Flippsjekk.

**Innlogging og betaling**
* K-50. **Innlogging med Google og e-post**, e-post må bekreftes med **kode på e-post**; senere: Vipps, mobilnummer, Apple. K-51. **Abonnement betales med Vipps.**
* K-52. Fjern **forbrukshistorikken** nederst på Konto.

**Drift**
* K-53. Siden skal kunne kjøres fra GitHub (Pages via Actions). K-54. Repo: `loteand-jpg/Flippsjekk`, kun `origin`.

**Scenario-, markeds- og brukerforutsetningsmodell (modell 1.1)**
* K-55. Analysen kan ha **basis + maks to alternativscenarioer** med egne tiltak, egen salgsverdi, gjennomførbarhet, krav, sluttproduktegenskaper, varighet, usikkerhet og referanser. Eldre analyser med én global salgsverdi virker via tydelig fallback; global verdi kopieres aldri til alternativer.
* K-56. **Private overstyringer** av alle relevante agent-/profilverdier per scenario, med grunnverdi, opprinnelse og tilbakestilling; skrives aldri til felles analyse.
* K-57. **Profilstandarder:** 10 t/uke (team), minimum 500 kr per egen time, egenkapital 300 000, rente 6 %, kjøpslån 90 %, oppussingslån 0 %, løpende utgifter ikke lånefinansiert, reserve redigerbar, salgskostnader 120 000, 3–4 mnd til oppgjør, hjemområde beholdt, arbeidsmodus (selv/delvis/innleid) per kategori, «Maks egeninnsats» som aldri antar at regulert arbeid er gratis.
* K-58. **Egen tid er ikke en kostnad:** `hourValue` erstattes av fortjeneste per egeninnsatstime (null ved 0/ukjente timer); `CALC_MODEL_VERSION` oppdatert.
* K-59. **Separate lån** (kjøp/oppussing), gradvis opptrekk (snitt halvparten), egenkapitalbehov, finansieringsgap og toppgjeld; salgskostnader ikke i startkapital.
* K-60. **Oppussingstiltak klare for prisbank** (materialer separat, arbeid per kategori, priskilde/-versjon) – ingen oppdiktede priser.
* K-61. **Markedsvekting V1** som ren, versjonert funksjon (fysisk match 25/25/15/15/10/10, BRA-regler, pålitelighets- og markedstidsfaktor, markedsjustert pris, aktive annonser aldri solgt pris, vektet median som anker med snitt som kontroll, kvalitetsnivåer, voksende intervall, «for usikkert»).
* K-62. **Områdeprofil** som datamodell + fallback (ingen datahenting). K-63. **Rangering** av scenarioer på flere kriterier; betinget scenario styrer ikke anbefalt maksbud.
* K-64. Endringene skal være **kontrollert utvidelse**: ikke omskriving, ingen teknologiskifte, ingen ekte FINN/Supabase/betaling/ekstern AI, ingen delte private data, kurs/abonnement urørt.

**Korrigeringsrunde (modell 1.2)**
* K-65. **30 dager:** analyse eldre enn 30 dager gir normalt en **grundig markedsoppfriskning** (ikke full teknisk analyse). Full/delvis teknisk reanalyse kun ved nye/endrede relevante dokumenter, endrede kritiske fakta eller inkompatibel modell. K-66. **`purchaseFinancingPct` gjelder kun kjøpesummen P**; kjøpskostnader dekkes av egenkapital; forskjell mot historiske tall dokumenteres, ikke skjules.
* K-67. **Timekrav (minimum fortjeneste per egeninnsatstime)** er en brukerdefinert mål-/maksbudparameter og rangeringsfaktor – verken kostnad eller hard gate. Egen maksbudgrense; anbefalt maksbud er den laveste grensen, med synlig begrensning (fortjenestemål, timekrav og avkastning blandes ikke).
* K-68. **Scenario-spesifikk risiko** (teknisk, kostnad, tid, myndighet) brukes i rangeringen sammen med objektrisiko; betinget/uavklart scenario styrer aldri anbefalt maksbud. K-69. **Én autoritativ salgsverdiflyt**: kode fastsetter low/base/high; agenten leverer sluttprodukt, klassifisering og begrenset begrunnet ankerjustering; tre verdier (historisk agent, markedsmotor, privat) holdes adskilt.
* K-70. **`standardClass` i sluttproduktet** brukes automatisk av markedsvektingen; ikke anta nyoppusset; udokumentert standard får tydelig fallback. K-71. **Ukjent er ikke middels** i markedsvekting (konservative poeng + pålitelighet + hindrer primærstatus). K-72. **Ukjent fellesgjeld på aktiv annonse blir aldri 0.**
* K-73. **Ingen dobbelttelling av arbeid** mellom eldre fagfelt og ny arbeidsmodell. K-74. **Regulert kompetanse per kategori** (elektro/rør/bad-våtrom), «Relevant kompetanse/ansvar bekreftet for dette arbeidsområdet». K-75. **Aktive annonser** er begrenset markedssignal (dokumentert maksimum), aldri faktiske salg. K-76. Kontrakten støtter scenario-screening (vindu/dagslys, romgeometri, teknikk, vann/avløp, ventilasjon, myndighet, økonomi) og stopp uten treff – uten at ekte agent er bygget.
* K-77. **Samlet oppfriskingsbeslutning:** én ren funksjon (`decideRefresh`) bestemmer reuse / enkel oppfriskning / markedsoppfriskning / full analyse. Prioritet: manglende eller inkompatibel analyse → solgt → nye kritiske dokumenter/fakta → > 30 dager → visningshendelse → > 24 timer → gjenbruk. K-78. **30-dagersregelen gjelder også brukere som allerede har objektet** (grundig markedsoppfriskning, belastet som oppfriskning) og vurderes før 24-timersregelen. K-79. **Offisiell visningshendelse** (holdt, endret, avlyst, ny) kan utløse enkel oppfriskning selv når siste kontroll er under 24 timer gammel. K-80. Ingen automatisk budlogikk; ingen ekte agent- eller markedsfunksjon beskrives som ferdig.

---

## 14. Oppskrifter for vanlige endringer

* **Ny/endret prisplan:** `config/plans.ts` (pris, kvoter, `trialDays`, `campaign`). Teksten på forsiden/konto leser derfra. Produksjon: serveren eier tallene.
* **Nytt kurs:** legg til i `config/courses.ts`; innhold som data; gjenbruk `CoursePaywall`/`getAccess`. Sett `status: 'available'` og `price`.
* **Ny kursside/modul:** rediger `src/course/content/*`; oppdater `course.test.ts` hvis antall sider/moduler endres; hold glossary-nøkler gyldige; aldri bytt rekkefølge på de 11 modulene.
* **Ny tjeneste/endepunkt:** utvid grensesnittet i `services/types.ts`, implementer mock i `services/mock/`, legg til test i `services.test.ts`, og senere Supabase-implementasjon.
* **Ny tabell:** legg til Zod-skjema i `domain/schemas.ts`, tabell i `DbState`/`TABLE_SCHEMAS`/seed (`[]`), eventuelt migrering bare hvis eksisterende rader må omformes.
* **Ny analyse-regel:** `requestAnalysis` + `jobs.ts`; oppdater §6.1-tabellen her, enhetstest og `demokontroller`-e2e.
* **Endring av tekst brukeren ser:** respekter tekstreglene i §8 og søk e2e-tester etter gamle strenger.
* **Supabase / backend:** `supabase/` (migrasjoner 1–9, `tests/rls_matrix.sql`), `src/services/supabase` (konfigurasjon, lat klient, Auth, profil, objektliste, scenarioer, lesing av analyser, `createSupabaseServices()`) og `docs/supabase.md`. **Live-verifisert (rapportert av ChatGPT): fase 1 (migrasjon 1–8, matrise 223/223) og fase 2A (e-post-OTP, profil, sesjon).** **Fase 2B (objektliste og scenarioer, migrasjon 9) ligger på `backend-data-phase-2b`. Migrasjon 9 og hele RLS-matrisen er live-verifisert 24.10.2026 (228/228), mens nettleserflyten fortsatt må bekreftes før merge.** **Medlemskap i brukerens liste (`user_properties`) kan bare opprettes av backend** (migrasjon 9 lukket den kjente UUID-veien); klienten kan lese, oppdatere noen kolonner og slette egne rader. Det låste «Nettsidens vurdering»-scenarioet må opprettes av backend. I produksjon er `Services.unavailable` = abonnement, kurs, egne referanser, egne risikoer, analyse (bestilling), kalender og import; disse avvises med `ServiceError('not_configured')`, og UI sier «ikke koblet til ennå» (aldri tomme eller falske data, og aldri gratis abonnement). Redigering av egne scenarioer er ikke abonnementsstyrt i produksjon så lenge abonnementstjenesten mangler (`useEditAccess`, midlertidig – må erstattes av sjekk i database/server). `PropertyBundle`/`MyPropertyItem` bygges av delte rene funksjoner i `services/shared/readModel.ts` for både demo og produksjon. Test-/utviklingsverktøy ligger i `src/services/supabase/dev/` (PGlite-backend med PostgREST-emulator, seed) og skal aldri importeres fra appkoden. UI importerer aldri Supabase – bare tjenestekontraktene i `services/types.ts`. Demo/mock er uendret. Backend bygges fra `main`, ikke fra designgrenene. Lokal `.env.local` påvirker dev og build, men testene festes til demo.
* **Ny innloggingsmetode:** ny metode i `AuthService`, knapp i `AuthPages.tsx`; behold passordløs UX.

---

## 15. Kjente begrensninger og fallgruver

* Demo er **ikke sikker**: tilgangskontroll i nettleseren, kursinnhold i klientbygget, kode vises i UI. Ikke bruk ekte personopplysninger.
* Lagring i `localStorage` er per nettleser; e-postkoder og ventende Vipps-avtaler ligger i minnet og forsvinner ved omlasting.
* Eksisterende lokale databaser får ikke automatisk nye **seeddata** (f.eks. Adas kurskjøp, scenariodata på p01) – bruk «Tilbakestill demodata» i testkontrollene. **Skjemaendringer** migreres derimot automatisk (v3→v4).
* **Modell 1.1/1.2 – kjente begrensninger:** markedsindeks/områdeprofil er ikke koblet til data (kun modell + fallback); markedsvektingen justerer ikke prisen for standardforskjeller (den vekter og begrenser); markedsoppfriskning i demoen henter ingen nye referanser (kun annonse og analysedato oppdateres); tekniske endringssignaler (nye dokumenter/kritiske fakta) og visningsendringer (endret/avlyst/ny) simuleres, mens «visning holdt» utledes av lagrede visninger; delvis teknisk reanalyse (`technical_partial_refresh`) finnes ikke, så kritiske signaler gir full analyse; `weeklyOwnHours` er team-nivå, ikke per person; scenariodemodata finnes bare for ett objekt (p01); `hourValue` finnes fortsatt for kurset; lånefinansierte løpende utgifter er forenklet (ingen rente på rente); rangeringsvekter og markedsparametere er heuristikker som ikke er validert mot reelle salg; ingen prisbank er koblet til.
* Dev-server under Git-grenbytte: bytte gren mens `vite` kjører kan ødelegge `node_modules/.vite`; stopp serveren og slett `node_modules/.vite` ved rare feil.
* Test-selektorer og tallformat: NBSP/U+2212 (se §8). Flere elementer med samme tekst gir strict-mode-feil i Playwright (bruk `.first()`/roller).
* `README.md` beskriver demo og kjøring; `docs/*.md` beskriver datamodell, agentkontrakt, formater og integrasjoner. Hold dem og denne filen i synk når regler endres.

## 16. Åpne spørsmål (trenger beslutning fra eier)

1. Skal «Oppfrisk analysen» (varsel om nyere data) belastes som ny analyse? I dag belastes den ikke.
2. Årsprisen (2 000 kr) er et forslag – bekreft.
3. Skal passert visning også utløse oppfriskning for objekt i egen liste (K-35 sier bare > 1 døgn)?
4. Automatisk opprydding av felles analyser 1 måned etter solgt/trukket (foreslått, ikke implementert).
5. Angrerett/kvittering/mva for kurs og abonnement; endelige vilkår og personvernerklæring.
6. Rett til å hente FINN-data (lisens/avtale) og valg av agent/modell og hosting.
7. Når skal interne «flipprom»-identifikatorer byttes (krever datamigrering)?
8. Hvilke parametere i markedsvekting V1 og rangeringen skal kalibreres mot reelle salg, og hvem eier områdeprofil-/markedsindeksdata?
9. Skal arbeidskapasitet (timer per uke) være per person i stedet for for hele teamet?


## Lanseringskritiske restpunkter

Se `docs/lanseringssjekkliste.md`. Nye midlertidige løsninger, sikkerhetsfunn og krav som må være lukket før betalende brukere skal legges der fortløpende. Filen er autoritativ for lanseringsberedskap.
