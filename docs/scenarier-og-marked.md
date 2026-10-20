# Scenarioer, egeninnsats, finansiering og markedsvekting (modell 1.2)

Denne siden beskriver det som faktisk er implementert i beregningsmodell **1.2.0**, markedsvekting **1.1.0**, scenario-rangering **1.1.0** og analysens oppfriskingsregler. Alt er rene, deterministiske funksjoner uten nettverkskall. Ingen ekte FINN-data, AI, Supabase eller betaling er koblet til.

## 1. Prinsipper

- Én beregningsmotor ([src/calc/engine.ts](../src/calc/engine.ts)) brukes overalt. Ukjent er `null`, aldri 0 – og **ukjent er heller ikke «middels»**.
- Felles analyse er adskilt fra private data. Private overstyringer skrives aldri tilbake til `SharedAnalysis`.
- Eksisterende analyser, scenarioer og import virker gjennom eksplisitt migrering og fallback. Ingen rader droppes.
- Agenten leverer fakta, sluttprodukt og begrunnede anslag – **aldri økonomiske nøkkeltall og ikke en konkurrerende salgsverdi** (se §5).

## 2. Motoren (1.2.0)

```
K          = A × d + F                                   kjøpskostnader (dokumentavgift + gebyrer)
RB         = R × (1 + b)
Lp         = fP × P                                      kjøpslån – gjelder KUN kontant kjøpesum P
Lr         = fR × RB                                     oppussingslån (trekkes gradvis, snitt halvveis)
I          = r × m/12 × ( Lp + Lr/2 + [lånefinansierte løpende] O/2 )
equityNeed = (P − Lp) + K + (RB − Lr) + [ikke lånefinansiert] (I + O)      ← uten salgskostnader
equityGap  = max(0, equityNeed − availableEquity)                           ← null når egenkapital er ukjent
loanPeak   = Lp + Lr + [lånefinansierte løpende]
profitPerOwnHour = (S − C) / egne timer                                     ← null ved 0/ukjent timer
```

### 2.1 Kjøpslånet gjelder kjøpesummen – endring fra 1.1

Fra 1.2.0 gjelder `purchaseFinancingPct` kun den kontante kjøpesummen **P**. Dokumentavgift og øvrige kjøpskostnader (**K**) lånefinansieres ikke automatisk: de inngår fullt i prosjektkostnaden og i egenkapitalbehovet. Før (1.0/1.1) ble låneandelen brukt på P + K.

**Historiske tall er ikke bit-for-bit identiske.** Det er en bevisst produktendring, ikke en migreringsfeil, og forskjellen skjules ikke. Eksempel (kjøp 2 000 000 kr, øvrige kjøpsgebyrer 50 000 kr, oppussing 200 000 kr + 20 % reserve, 6 mnd, 6 % rente, 90 % kjøpslån, 0 % oppussingslån, drift 5 000 kr/mnd, faste salgskostnader 120 000 kr, salg 3 000 000 kr):

| | Kjøpslån | Renter | Resultat | Egenkapitalbehov | Toppgjeld |
|---|---|---|---|---|---|
| 1.0/1.1 (90 % av P + K) | 1 845 000 | 55 350 | 504 650 | 530 350 | 1 845 000 |
| **1.2 (90 % av P)** | 1 800 000 | 54 000 | **506 000** | **574 000** | 1 800 000 |

Rentene synker med lånet på kjøpskostnadene (90 % × 50 000 × 6 % × ½ = 1 350 kr), mens egenkapitalbehovet øker med 90 % av kjøpskostnadene (45 000 kr) minus den lavere renten. Gammel kalkylemodell kan reproduseres med motorinngangen `purchaseLoanBasis: 'kjopesum_og_kostnader'`; den brukes **bare av kurset** ([src/course/evaluate.ts](../src/course/evaluate.ts)), slik at kursteksten og kursets regneeksempler (Case A: −284k / −87k / +208k) ikke endres. Analyser i appen bruker aldri den eldre regelen.

Oppdatert: renter, toppgjeld, egenkapitalbehov, finansieringsgap, maksbud (alle løsere bruker samme `computeCore`), stresstester og tester.

### 2.2 Egen tid og timekrav

- **Egen tid er ikke en kostnad.** Resultatet er uavhengig av egne timer.
- **`minProfitPerOwnHour`** (standard 500 kr/t) er et brukerdefinert lønnsomhetskrav. Det er **ikke** en kostnad, **ikke** en automatisk diskvalifikasjon og **ikke** en absolutt regel om at prosjektet er ulønnsomt. Det brukes på to måter:

**A. Modellert maksbud (egen grense).** Når egne timer H > 0 og kravet er kjent, beregnes høyeste kjøpspris der `fortjeneste / H ≥ krav` (samme biseksjon som øvrige maksbud, toleranse 1 kr). Grensene beregnes **hver for seg og blandes aldri**:

| Grense | Hva |
|---|---|
| Fortjenestemål | høyeste pris som gir ønsket fortjeneste (`profitTarget`) |
| Timekrav | høyeste pris som gir minst `minProfitPerOwnHour` per egeninnsatstime |
| (Avkastningsmål) | vises i tabellen under «Modellert maksbud», men inngår ikke i anbefalingen |

**Anbefalt maksbud er den laveste grensen**, og UI viser hva som begrenser det (`Evaluation.recommendedMaxBid.limitedBy`, `limits`, `notApplicable`). En grense som ikke kan nås selv ved kjøpspris 0 gir «ingen gjennomførbar pris» og peker på den aktuelle grensen. Uten egne timer, eller uten krav, gir timekravet ingen grense (med forklaring). Hjelperen `recommendedBidOf(ev)` brukes av alle visninger (nøkkeltall, liste, sammenligning, bud, eksport), så de viser samme tall.

Eksempel (samme prosjekt): 100 egne timer og krav 5 000 kr/t gir timekravsgrense 2 005 841 kr mot fortjenestemålsgrense 2 103 213 kr → anbefalt maksbud 2 005 841 kr, begrenset av timekravet. Med krav 500 kr/t begrenser fortjenestemålet.

**B. Scenario-rangering.** Ved samme kjøpspris er lav fortjeneste per egeninnsatstime et reelt svakhetstegn (kriteriet «Fortjeneste per egeninnsatstime», vekt 15 %). Et scenario som krever svært mye arbeid for liten merfortjeneste rangeres dårligere enn et enklere. Men: **et scenario under kravet blir ikke automatisk «ikke anbefalbart».** Kjøpsprisen kan være lav nok til at det er attraktivt, så timekravet er en mål-/maksbudparameter og en rangeringsfaktor – ikke en hard gjennomførbarhetsport. Scenarioet får flagget «Under timekravet ved dette kjøpsbudet» og et lavere maksbud.

### 2.3 Øvrig

- **Salgskostnader** inngår fullt i resultatet, men ikke i egenkapitalbehovet.
- `hourValue`/`profitAfterOwnWork` er utfaset (kurset bruker dem), men styrer ikke hovedøkonomien.
- Modellversjonen er `1.2.0`. Major er uendret: analyser lagrer ikke beregnede tall, så de er fortsatt kompatible og regnes med gjeldende motor.

## 3. Profilstandarder

| Felt | Standard |
|---|---|
| Kjøpertype leilighet/hus | uendret (nye kontoer: privat/privat) |
| Arbeidstimer egeninnsats per uke (samlet team i V1) | 10 |
| Minimum fortjeneste per egeninnsatstime | 500 kr/t |
| Tilgjengelig egenkapital | 300 000 kr |
| Rente | 6 % |
| Låneandel kjøpesum / oppussing | 90 % (av kjøpesummen P) / 0 % |
| Finansiering av øvrige løpende utgifter | Nei |
| Oppussingsreserve | 20 % (redigerbar) |
| Salgskostnader | 120 000 kr fast sum (meglerprovisjon i prosent finnes fortsatt, standard 0 %) |
| Tid fra ferdig oppussing til økonomisk oppgjør | 3,5 mnd (redigerbar, 0–12) |
| Hjemområde | Trondheim (uendret) |

### 3.1 Egeninnsats og regulert arbeid

Kategorier: riving, maling/sparkling, gulv, tømrer, kjøkkenmontering, rør, elektro, bad/våtrom, annet. Hver kan være `selv`, `delvis` eller `innleid` (standarder i [src/config/defaultLabor.ts](../src/config/defaultLabor.ts)). **Maks egeninnsats** gjør ikke-regulert arbeid til «selv» og oppgraderer aldri regulert arbeid.

**Regulert arbeid (rør, elektro, bad/våtrom) regnes aldri som gratis uten at relevant kompetanse/ansvar er bekreftet for akkurat det arbeidsområdet.** Bekreftelsen lagres kategoribasert:

```ts
regulatedCompetence: { ror: boolean; elektro: boolean; bad_vatrom: boolean }   // ProfileDefaults og ScenarioValues
```

- Elektro-kompetanse gjør ikke rør eller våtrom gratis. UI-teksten er «Relevant kompetanse/ansvar bekreftet for [område]» – kompetanse alene betyr ikke at arbeidet lovlig kan gjøres på alle objekter.
- Uten bekreftelse regnes arbeidet som innleid (advarsel vises), også når brukeren velger «selv» eller profilen sier «selv».
- Bekreftelsen gjør heller ikke «maks egeninnsats» til å oppgradere regulert arbeid automatisk; det styres av arbeidsmodus per kategori/tiltak.
- **Migrering:** det gamle samlede flagget `regulatedSelfWorkConfirmed` (én bekreftelse for alt regulert arbeid) kan ikke fortelle hvilket område den gjaldt. Det **nullstilles konservativt** til «ikke bekreftet» for alle tre områdene (også når det var `true`), og fjernes. Brukeren bekrefter på nytt per område. Dette er en bevisst, trygg endring – ikke tap av data. Mangler en kategori i en delvis rad, regnes den som ikke bekreftet.

## 4. Scenario-spesifikk analysemodell

`estimates.scenarios` (valgfritt, maks 3): ett `basis` og inntil to `alternativ`. Hvert scenario har id, tittel, nivå, beskrivelse, **gjennomførbarhetsstatus** (`klar`, `betinget`, `uavklart`, `ikke_gjennomforbar`) med begrunnelse og krav til avklaring/godkjenning, **sluttprodukt**, **egne tiltak**, foreslått oppussingstid, **egen risiko**, **screening** (for alternativer), **usikkerhet**, **referanser** og **referanseklassifisering**. Skjemaet er strengt – økonomiske nøkkeltall avvises. Et scenario som krever godkjenning kan ikke være `klar` og kan ikke ha lav myndighetsrisiko.

**Fallback for eldre analyser** (`resolveAnalysisScenarios`): én global `estimates.sale` blir ett basisscenario merket `saleSource: 'global'` med usikkerhet «uavklart». Den globale salgsverdien kopieres **aldri** til alternative planløsninger.

**Tid:** for nye scenarioer er `suggestedMonths` oppussingstid, og total prosjektvarighet = oppussingstid + tid til oppgjør fra profilen (`settlementMonths`). For eldre analyser er varigheten total.

### 4.1 Sluttstandard i sluttproduktet

`endProduct.standardClass` (kanonisk enum: `oppussingsobjekt`, `dagens_standard`, `middels`, `oppgradert`, `nyoppusset`) brukes **automatisk** av markedsvektingen som målets standard. Ingen antagelse om at alle scenarioer er `nyoppusset`: et lett basisscenario kan være `oppgradert`, en full hovedoppussing `nyoppusset`.

Mangler feltet (eldre scenarioer og analyser), brukes en tydelig merket **fallback** utledet fra oppussingsnivået (`lett` → oppgradert, `hoved`/`omfattende` → nyoppusset; `LEVEL_FALLBACK_STANDARD`). Den fremstår aldri som dokumentert: UI viser «antatt, ikke dokumentert», markedsvektingen utvider intervallet med 1,5 prosentpoeng og legger inn en merknad. Brukeren kan overstyre standarden privat i fanen Marked; det gir en privat vurdering og endrer ikke analysen.

**Begrensning i V1:** standarden styrer likhet, vekt og rolle (to trinn unna kan aldri bli primær), men markedsvektingen **justerer ikke prisen** for standardforskjeller. Med bare nyoppussede referanser får et lettere scenario derfor samme anker, men et dårligere grunnlag og bredere intervall.

### 4.2 Scenarioets risiko

`risk: { technical, cost, time, approval, note }` med nivåene `lav | middels | hoy | uavklart`. Dette er enkelt og etterprøvbart – ingen egen risikomotor. Brukes i rangeringen sammen med objektets generelle risiko (se §9). Mangler `risk`, regnes alle fire som **uavklart** (konservativt, ikke middels). Et scenario som krever godkjenning kan ikke ha `approval: 'lav'`.

### 4.3 Screening og scenariojakt

Fremtidig agent: basis først, deretter aktiv jakt etter inntil to alternative verdiskapingsscenarioer (dele rom, flytte kjøkken og gjøre gammelt kjøkken til soverom, andre grep for +1 eller +2 gode soverom, badflytting bare når badet uansett må totalrenoveres og flytting gir vesentlig verdi). Kontrakten kan representere resultatet, men ingen agent er bygget:

- `screening` på et alternativ: `concept` (`dele_rom`, `flytte_kjokken_nytt_soverom`, `ekstra_soverom_annet`, `flytte_bad`, `annet`), `addedBedrooms`, `existingBathNeedsFullRenovation` og `checks` – ett resultat (`ok | tvil | ikke_ok | uavklart`) for hvert aspekt: vindu/dagslys, romgeometri, teknisk gjennomførbarhet, vann/avløp, ventilasjon, myndighetsavklaringer, økonomisk plausibilitet. Valideringen krever alle aspektene.
- Et grep med `ikke_ok` skal ikke være scenario (det føres som avvist i `scenarioSearch`). Tvil/uavklart er tillatt, men da kan scenarioet ikke være `klar`. `flytte_bad` krever at eksisterende bad uansett må totalrenoveres.
- `estimates.scenarioSearch`: `status` (`ferdig`, `stoppet_ingen_bestod`, `ikke_gjort`) og `considered` med utfall (`valgt`/`avvist`) og begrunnelse. «Hvis ingen alternativ består screening, stopp jakten» representeres som `stoppet_ingen_bestod` uten alternativer i settet.

## 5. Én autoritativ salgsverdiflyt

Fremtidig flyt, og slik den er implementert i koden ([src/calc/saleValue.ts](../src/calc/saleValue.ts), `resolveScenarioSale`):

1. strukturerte markedsreferanser (sammenlignbare objekter med egenskaper)
2. **kode** beregner markedsanker og usikkerhetsintervall (`weighMarket`)
3. AI kan senere vurdere kvalitative forhold modellen ikke fanger, og levere sluttprodukt, referanseklassifisering og en **begrunnet, begrenset ankerjustering**
4. justeringen er strukturert (`anchorAdjustment: { pct, category, reason }`), **kappes ved ±5 %** (skjema og kode) og må begrunnes konkret (minst 20 tegn)
5. **kode fastsetter endelig low/base/high**

Agenten kan ikke levere en helt uavhengig salgsverdi som konkurrerer med markedsmotoren. Tre verdier holdes adskilt og vises som sådan (fanen Marked, «Tre verdier som holdes adskilt»):

| Verdi | Hva | Rolle |
|---|---|---|
| **Agentens/fellesanalysens historiske estimat** | `scenario.sale` (eller analysens globale `estimates.sale` for eldre analyser) | Referanse. Aldri fasit når markedsmotoren kan regne. |
| **Markedsmotorens beregnede verdi** | `resolveScenarioSale(...).sale` | Grunnverdien i kalkylen (opprinnelse «Beregnet av markedsmotoren»). |
| **Brukerens private overstyring** | `ScenarioValues.saleLow/Base/High` | Privat; vises som «Endret av deg»; skrives aldri til analysen. |

`SaleResolution.source`: `markedsmotor` (normalt), `agent_fallback` (motoren kan ikke regne – agentens estimat brukes, tydelig merket «ikke verifisert», og salgsverdiens sikkerhet i rangeringen settes aldri bedre enn «middels»), `global_fallback` (eldre analyse uten scenarioer), `ingen` (verken motor eller estimat – verdiene er `null` og kalkylen er ufullstendig, aldri 0).

**Dato:** markedsvurderingen regnes per **analysens dato** (`analysisDateKey`), så grunnverdiene er stabile fra dag til dag. Eldre referanser mister vekt først når analysen oppfriskes (§6) og får ny dato. Brukerens egne referanser og en privat standardoverstyring gir en privat vurdering i fanen Marked (knappen «Bruk som salgsverdi i scenarioet» legger den inn i brukerens kalkyle).

**Referanseklassifisering:** planløsningslikhet varierer per scenario, så `referenceClassification: [{ comparableId, layoutMatch, note }]` gjelder for scenarioet. Et alternativ uten klassifisering for en referanse har **ukjent** planløsningslikhet (ikke samme som basis).

## 6. Oppfrisking: 30-dagersregelen (grundig markedsoppfriskning)

En analyse som er **eldre enn 30 dager** (`FRESHNESS.marketRefreshAfterDays`) utløser normalt en **grundigere markedsoppfriskning** (jobbtype `market_refresh`), ikke en full teknisk hovedanalyse. Policy: [src/domain/refreshPolicy.ts](../src/domain/refreshPolicy.ts).

Markedsoppfriskningen skal (med ekte kilder, senere): hente ny prisantydning, offisielle visninger og salgsstatus; oppdatere markedsreferanser og områdeprofil/markedsutvikling; beregne ny salgsverdi per eksisterende scenario; og kjøre økonomimotoren på nytt. Den skal normalt **ikke** lese alle gamle tekniske dokumenter på nytt, gjøre ny teknisk/juridisk analyse eller lage nye scenarioer.

I demoen (ingen ekte kilde) gjør jobben dette: oppdaterer annonsen (pris, visninger, salgsstatus), publiserer en **ny analyseversjon** med `analysisKind: 'market_refresh'`, `derivedFromVersion` og ny analysedato, og tar over teknisk grunnlag, scenarioer og referanser uendret. Salgsverdi per scenario regnes av koden per ny dato, og økonomimotoren regner på nytt når brukeren åpner kalkylen. Brukerens private kalkyler røres ikke (de får varsel om nyere data som ved annen ny versjon).

**Full (eller delvis) teknisk reanalyse** (`full_analysis`) skjer bare ved:

| Årsak | Kilde |
|---|---|
| `ingen_analyse` | analysen mangler |
| `inkompatibel` | modell-/skjemaversjon er ikke kompatibel med gjeldende |
| `nye_dokumenter` | kilden melder nye eller endrede relevante dokumenter |
| `kritiske_fakta_endret` | kilden melder at kritiske fakta er endret |

De to siste er i demoen simulerte signaler (`demo.technicalChangeSignals[finnId]`); i produksjon kommer de fra kildehentingen. Delvis teknisk reanalyse finnes ikke i modellen ennå, så slike signaler gir eksplisitt full analyse.

### 6.1 Tre typer oppfriskning

| Type | Innhold | Jobbtype |
|---|---|---|
| **Enkel oppfriskning** | pris, visninger og salgsstatus | `light_refresh` |
| **Grundigere markedsoppfriskning** | enkel oppfriskning + markedsreferanser + salgsverdi per eksisterende scenario + økonomien på nytt. Tar teknisk grunnlag og scenarioer over uendret | `market_refresh` |
| **Full/delvis faglig reanalyse** | ny teknisk hovedanalyse, bare ved nye kritiske dokumenter/fakta, manglende eller inkompatibel analyse | `full_analysis` |

### 6.2 Én beslutningsfunksjon og prioritet

Alle kodeveier (forespørsel om analyse, oppfrisking, koblet analyse og varsler på objektsiden) bruker `decideRefresh` ([src/domain/refreshPolicy.ts](../src/domain/refreshPolicy.ts)), med inndata fra `refreshInputFor` ([src/services/mock/context.ts](../src/services/mock/context.ts)). Utfall: `reuse`, `lightweight_refresh`, `market_refresh` eller `full_analysis`, med `reasons` som vises i UI. Første treff vinner:

| # | Betingelse | Utfall |
|---|---|---|
| 1 | Hovedanalyse mangler | `full_analysis` |
| 2 | Analysen er inkompatibel med gjeldende modell | `full_analysis` |
| 3 | Annonsen er solgt eller trukket | `reuse` (ingen unødvendig analyse eller oppfriskning) |
| 4 | Nye/endrede kritiske dokumenter eller endrede kritiske fakta | `full_analysis` (aldri vanlig `reuse`) |
| 5 | > 30 dager siden siste hovedanalyse eller grundige markedsoppfriskning | `market_refresh` |
| 6 | Offisiell visningshendelse siden siste kontroll (holdt, endret, avlyst, ny) | `lightweight_refresh` – selv om siste kontroll er under 24 t gammel |
| 7 | Ingen kontroll, eller siste kontroll > 24 t gammel | `lightweight_refresh` |
| 8 | Ellers | `reuse` |

**Prioritet mellom hendelser, 24 timer og 30 dager:** 30-dagersregelen (5) vurderes før 24-timersregelen (7), så en fersk kontroll aldri blokkerer den. Markedsoppfriskningen inkluderer den enkle, så en visningshendelse samtidig med > 30 dager behandles av den (ett kall, ikke to). Under 30 dager går visningshendelser foran 24 timer, og 24 timer foran gjenbruk. «Siste hovedanalyse/grundige markedsoppfriskning» er datoen til siste analyseversjon (hovedanalyse eller `market_refresh`); «siste kontroll» er tidspunktet annonsen sist ble hentet (siste snapshot, fra enkel oppfriskning eller analyse). Grensene (24 t, 30 dager) ligger i `FRESHNESS`.

**Visningshendelser:** «holdt» utledes av koden: en offisiell, ikke avlyst visning som startet etter siste kontroll og før nå. «Endret», «avlyst» og «ny» kan bare oppdages ved å hente annonsen, så i demoen er de simulerte signaler (`demo.viewingChangeSignals[finnId]`) som fjernes når annonsen er hentet. Private visninger teller ikke. Ingen automatisk budlogikk.

### 6.3 Hva tjenesten gjør

| Situasjon | Resultat |
|---|---|
| Bruker har objektet, beslutning `reuse` | Objektet åpnes uten jobb og uten belastning |
| Bruker har objektet, `lightweight_refresh` | `light_refresh`; belastes som oppfriskning; er kvoten brukt opp, åpnes objektet som det er |
| Bruker har objektet, `market_refresh` | **`market_refresh` startes automatisk** ved ny tilgang (dialog «Oppdaterer markedsdata»); belastes som oppfriskning (ikke ny analyse; teller ikke mot analysekvoten); er kvoten brukt opp, åpnes objektet som det er. Siden viser i tillegg «Oppdater markedsdata» |
| Bruker uten objektet, `reuse` / `lightweight_refresh` | `linked_analysis` (dialog og belastning som ny analyse); annonsen oppfriskes først når beslutningen sier det |
| Bruker uten objektet, `market_refresh` | `market_refresh`; dialog og trinn som en ny analyse; belastes som ny analyse; samtidige forespørsler kobles til samme jobb |
| `full_analysis` | full teknisk analyse. `requestRefresh('full')` uten slik årsak avvises (`conflict`) |
| `requestRefresh('light')` | «allerede fersk» når `lightDue` er falsk (nylig kontrollert og ingen visningshendelse) – også når markedsoppfriskning er aktuell |
| `requestRefresh('market')` på analyse ≤ 30 dager | `already_fresh` – ingenting belastes |

Hovedanalyse, scenarioer og brukerens private kalkyler beholdes ved alle oppfriskninger.

## 7. Arbeid og pris i oppussingstiltak (klargjort for prisbank)

`RenovationItem` har `materials`, `electrician`, `plumber`, `other`, `hours` (eldre regler) og valgfrie `laborCategory`, `laborHours`, `laborCostHired`, `workMode`, `selfShare`, `priceSource {kind: agent|prisbank|bruker, version}`. Ingen nasjonale priser er lagt inn.

**Én kostnadsmodell per tiltak – ingen dobbelttelling:**

- Tiltak **uten** `laborCategory` følger eldre regler: `electrician/plumber/other` er innleide kostnader, `hours` er egne timer.
- Tiltak **med** `laborCategory` bruker ny arbeidsmodell: kostnad = `materials` + innleid arbeid (`laborCostHired`, fordelt etter arbeidsmodus). Eldre fagfelt teller **ikke** (`usesLaborModel`, `ignoredLegacyTrades`).
- **Agentkontrakt og publisering avviser** tiltak som fyller ut begge (`laborModelIssue`: «Bruk bare én modell, ellers telles arbeidet to ganger»).
- **Lagrede data normaliseres** (`migrateRenovationItemRaw`, kjøres ved lesing og i DB-migreringen): eldre fagbeløp flyttes til `laborCostHired` når den er ukjent, ellers beholdes `laborCostHired`; fagfeltene nullstilles. Tiltak uten kategori er uendret.
- UI: for tiltak med arbeidskategori er fagfeltene låst («–»); innleid arbeid legges inn som «Arbeidskostnad hvis innleid».

## 8. Private overstyringer

Et privat scenario (`ScenarioValues`) er en full kopi av grunnverdiene fra valgt agentscenario og profilen, og kan endres felt for felt. UI viser grunnverdi og opprinnelse (annonse, analyse, scenario, **markedsmotor**, profil, modellregel), «Endret av deg» og «Tilbakestill» per felt og per tiltak. `ScenarioValues.analysisScenarioId` husker hvilket agentscenario kalkylen bygger på. Overstyringer av salgsverdi, kompetanse per område, standard (i Marked) og alle økonomifelt er private.

## 9. Markedsvekting ([src/calc/market.ts](../src/calc/market.ts), versjon 1.1.0)

**Fysisk likhet 0–100:** lokasjon 25 (samme bygg 25, mikroområde 20, bydel 14, kommune 8, region 3), standard mot sluttproduktet 25, BRA-i 15, soverom/planløsning 15, boligtype/eierform 10, øvrige egenskaper 10. BRA-avvik: ≤5 % → 15, ≤10 % → 13, ≤15 % → 10, ≤25 % → 6, ≤35 % → 3, større → 0. Standardavstand: 0 → 100 %, 1 → 80 %, 2 → 45 %, 3 → 15 %, 4 → 0 % av standardpoengene.

### 9.1 Ukjent er ikke middels

Manglende data straffes **primært gjennom pålitelighet**, og gir bare svake poeng i fysisk likhet (aldri mer enn det svakeste kjente nivået):

| Ukjent felt | Fysisk likhet | Pålitelighet | Øvrig |
|---|---|---|---|
| Lokasjon | 3/25 (som region – laveste kjente) | ×0,85 | hindrer primærstatus |
| Standard | 3,75/25 (som tre trinn unna) | ×0,80 | vekttak 0,5; hindrer primærstatus |
| BRA-i | 0/15 | ×0,6 (manglende areal) | ingen pris per m², vekt 0, kan ikke inngå i ankeret |
| Soverom (når målets er kjent) | 1/9 (mindre enn ett avvikende soverom) | ×0,90 | hindrer primærstatus |
| Planløsning | 1/6 | ×0,95 | |
| Boligtype / eierform / etasje / balkong m.m. | 1/5, 1/5, 0,5/2, ¼ av full | – | |
| Fellesgjeld på aktiv annonse | – | ×0,6 | **totalpris/m² beregnes ikke** (aldri `?? 0`) |

Hver referanse viser `unknownFields` og en forklaring («Ukjent er ikke middels …»). **Primærreferanse** krever kjent lokasjon, standard og BRA-i (og soverom når målets er kjent), samme antall soverom som sluttproduktet, fysisk ≥ 65, pålitelighet ≥ 0,6, standardavstand ≤ 1 og BRA-avvik ≤ 25 %.

**Adskilte faktorer:** `physicalMatch`, `reliabilityFactor` og `marketTimeFactor` (alder; faller sakte når salget er markedsjustert, raskt uten indeks).

```
effectiveWeight = physicalMatch/100 × reliabilityFactor × marketTimeFactor × standardTak
adjustedPrice   = soldPrice × marketIndexNow / marketIndexAtSale     (eller manuell markedsjusteringsfaktor)
```

**Roller:** `primaer`, `sekundaer` (tas bare med i anker hvis det er under to primærer og vekten ≥ 0,15), `markedsreferanse` (aktive annonser – vekt 0, **aldri oppnådd salgspris**).

**Estimat:** prisnormalisering til totalpris, robust vektet **median** som anker, vektet **snitt** som kontroll, spredning (vektet MAD) og intervall etter datakvalitet: svært godt ±3–4 %, normalt ±4–6 %, svakt ±7–10 % (pluss spredning, konkurrerende annonser og 1,5 prosentpoeng ved udokumentert sluttstandard, maks ±12 %). Tier: ≥ 85 svært godt, ≥ 65 normalt, ≥ 40 svakt, ellers **for usikkert** – da gis ingen tvungen normalverdi.

### 9.2 Aktive annonser som begrenset markedssignal

Aktive annonser går **aldri** inn i ankeret og er aldri faktiske salg. Men flere svært relevante aktive sluttprodukter kan flytte **normalverdien** moderat – innenfor det statistiske intervallet. Eksplisitt regel (`MARKET_PARAMS.activeSignal`):

- Signalannonser: fysisk likhet ≥ 70, kjent standard ≤ 1 trinn fra sluttproduktet, normalisert totalpris (kjent fellesgjeld).
- Poeng ned: 1 for annonse mer enn 5 % under ankeret, +0,5 for prisnedsatt (`originalAskingPrice` > nåværende pris), +0,5 for ≥ 90 dager ute. Poeng opp: 1 for annonse mer enn 5 % over ankeret uten prisnedsettelse/lang tid.
- Krever minst **to** signalannonser. Minst 2 poeng ned → −0,5 % per poeng, **maks −2 %**. Minst 2 poeng opp og ingen ned → +0,5 % per poeng, **maks +1 %**. Forskyvningen overstiger aldri halvparten av halv intervallbredde.
- `low`/`high` (det statistiske intervallet) og ankeret endres ikke. Grunnlaget og justeringen vises i UI (`positioning.notes`). Ingen frie skjønnsjusteringer.

## 10. Områdeprofil (datamodell, ikke koblet)

[src/domain/areaProfile.ts](../src/domain/areaProfile.ts): område-ID og nivå, `asOf`/periode, prisutvikling 1/3/6/12 mnd, volum, robust kr/m², salgstid, salg vs prisantydning, aktive objekter/prisreduksjoner, likviditet, datamengde og sikkerhet, kilde/versjon, og plass til soverom- og oppussingspremie. `selectAreaProfile` faller tilbake samme bygg → mikroområde → bydel → kommune/by → region og hopper over profiler med for lite data. `marketIndexFromAreaProfile` gjør prisutviklingen om til en markedsindeks (`MarketIndex`). Ingen data hentes; en markedsoppfriskning vil senere oppdatere den.

## 11. Scenario-rangering ([src/calc/ranking.ts](../src/calc/ranking.ts), versjon 1.1.0)

Kriterier og vekter (vises i UI): fortjeneste 25 %, prosjektavkastning 15 %, fortjeneste per egeninnsatstime 15 %, **risiko (objekt + scenario) 15 %**, salgsverdiens sikkerhet 10 %, stresstest (kombinert) 10 %, finansieringsgap 5 %, prosjektvarighet 5 %. Hvert kriterium normaliseres mellom scenarioene med en vesentlighetsgrense. Kriterier som ikke gjelder (timesats uten egne timer) utelates og vekten fordeles på resten.

**Risiko** = objektets generelle risiko (1–3 poeng, +1 når scenarioet ikke er `klar`) + scenariorisiko (0–4 poeng: lav 0, middels 0,5, høy 1, **uavklart 1**). Ikke vurdert scenariorisiko regnes som uavklart. Poengene og nivået per dimensjon vises i hvert rangeringskort.

**Bare `klar` + komplett kalkyle kan anbefales; betingede og uavklarte scenarioer rangeres for sammenligning, men styrer aldri anbefalt scenario eller anbefalt maksbud.** Anbefalt maksbud for et scenario er den laveste maksbudgrensen (§2.2), med begrensende grense synlig.

## 12. Migrering

| Hva | Hvordan |
|---|---|
| Database | `DB_SCHEMA_VERSION` 3 → 4 → **5** ([src/data/db.ts](../src/data/db.ts), `MIGRATIONS[3]`, `MIGRATIONS[4]`). Profiler, scenarioer og tiltak i analyser migreres; ingen rader droppes. |
| `financingPct` (v3) | Blir både `purchaseFinancingPct` og `renovationFinancingPct`. Ukjent (`null`) forblir ukjent. **Fra 1.2 gjelder kjøpslånet kun P**, så renter/egenkapitalbehov er ikke lenger identiske med 1.0/1.1 når kjøpskostnadene > 0 (se §2.1). |
| `regulatedSelfWorkConfirmed` (v4) | → `regulatedCompetence` (alle områder «ikke bekreftet»), flagget fjernes (se §3.1). |
| Tiltak med arbeidsmodell og eldre fagfelt (v4) | Normaliseres, se §7. |
| Nye scenariofelt (`endProduct.standardClass`, `risk`, `screening`, `anchorAdjustment`, `referenceClassification`, `estimates.scenarioSearch`, `sale` valgfri, `analysisKind`, `derivedFromVersion`) | Valgfrie – eldre analyser leses uendret. Manglende `standardClass` → tydelig fallback (§4.1). |
| Jobbtype `market_refresh`, `AnalysisJob.charges`, `demo.technicalChangeSignals`, `demo.viewingChangeSignals` | Nye og valgfrie; ingen migrering nødvendig. |
| Skjema | `ScenarioValuesSchema` og `ProfileDefaultsSchema` kjører migreringsfunksjonene før validering, så gamle rader (også kursets localStorage, import og eksport) alltid kan leses. `evaluateScenario` normaliserer også eldre verdier. |
| Import v1 | `financing` blir kjøps- og oppussingslån; `hourRate` beholdes som utfaset `hourValue`; nye felt hentes fra profilen. |
| Eksport | Formatet er uendret (`flipprom-scenarios` v1) med nye felt i `values` (`regulatedCompetence`) og i `result`: `profitPerOwnHour`, `equityNeed`, `equityGap`, `maxBid` (anbefalt), `maxBidLimitedBy`, `maxBidProfitTarget`, `maxBidHourlyRequirement`. |
| Kurset | Samme motor, men med `purchaseLoanBasis: 'kjopesum_og_kostnader'` ([src/course/evaluate.ts](../src/course/evaluate.ts)) slik at kursets tall er uendret. |

## 13. Kjente begrensninger

- Markedsindeks/områdeprofil er ikke koblet til data, og det finnes ingen ekte markedskilde: en markedsoppfriskning i demoen oppdaterer annonse og analysedato og regner på nytt, men henter ikke nye referanser.
- Oppfriskingssignaler: «visning holdt» utledes av lagrede visninger, mens endret/avlyst/ny visning og nye kritiske dokumenter/fakta er simulerte signaler i demoen (kilden må levere dem i produksjon). Delvis teknisk reanalyse finnes ikke; kritiske signaler gir full analyse. «Siste kontroll» er ett tidspunkt (siste snapshot) – enkel oppfriskning og analyse skilles ikke.
- Markedsvektingen justerer ikke prisen for standardforskjeller (§4.1) og har parametere som ikke er validert mot reelle salg.
- Aktive annonser: `originalAskingPrice` og annonsedato må leveres av kilden; mangler de, gir bare «under ankeret» poeng.
- `weeklyOwnHours` gjelder hele teamet. Rangeringsvekter er heuristikker.
- Scenariodata (screening, risiko) finnes i demoen bare for ett objekt (p01).
