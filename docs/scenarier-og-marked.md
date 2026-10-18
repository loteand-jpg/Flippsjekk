# Scenarioer, egeninnsats, finansiering og markedsvekting (modell 1.1)

Denne siden beskriver det som faktisk er implementert i beregningsmodell **1.1.0**, markedsvekting **V1 (1.0.0)** og scenario-rangering **1.0.0**. Alt er rene, deterministiske funksjoner uten nettverkskall. Ingen ekte FINN-data, AI, Supabase eller betaling er koblet til.

## 1. Prinsipper (uendret)

- Én beregningsmotor ([src/calc/engine.ts](../src/calc/engine.ts)) brukes overalt. Ukjent er `null`, aldri 0.
- Felles analyse er adskilt fra private data. Private overstyringer skrives aldri tilbake til `SharedAnalysis`.
- Eksisterende analyser, scenarioer og import virker gjennom eksplisitt migrering og fallback. Ingen rader droppes.

## 2. Motoren (1.1.0)

```
I      = r × m/12 × ( fP × (P + K)  +  fR × RB / 2  +  [lånefinansierte løpende] O / 2 )
equityNeed = (P + K − kjøpslån) + (RB − oppussingslån) + [ikke lånefinansiert] (I + O)    ← uten salgskostnader
equityGap  = max(0, equityNeed − availableEquity)                                          ← null når egenkapital er ukjent
profitPerOwnHour = (S − C) / egne timer                                                    ← null ved 0/ukjent timer
```

- **Kjøpslån og oppussingslån er adskilt** (`purchaseFinancingPct`, `renovationFinancingPct`). Oppussingslånet trekkes gradvis (snitt halvveis). Standard er 90 % og 0 %. Løpende utgifter lånefinansieres ikke som standard (`financeRunningCosts`); velges det, regnes renter forenklet med halvveis uttrekk uten rente på rente.
- **Egen tid er ikke en kostnad.** Resultatet er uavhengig av egne timer. Fortjeneste per egeninnsatstime sammenlignes mot brukerens minimumskrav (`minProfitPerOwnHour`, standard 500 kr/t). Risiko endrer ikke formelen.
- **Salgskostnader** inngår fullt i resultatet, men ikke i egenkapitalbehovet.
- **Bakoverkompatibilitet:** med `fP = fR = f` gir 1.1.0 nøyaktig samme tall som 1.0.0 (testet). `hourValue`/`profitAfterOwnWork` er utfaset: de beregnes fortsatt informativt når `hourValue` er satt (kurset bruker dem), men styrer ikke hovedøkonomien og vises ikke i appen.
- Modellversjonen er `1.1.0` (major uendret, så eksisterende analyser forblir kompatible).

## 3. Profilstandarder

| Felt | Standard |
|---|---|
| Kjøpertype leilighet/hus | uendret (nye kontoer: privat/privat) |
| Arbeidstimer egeninnsats per uke (samlet team i V1) | 10 |
| Minimum fortjeneste per egeninnsatstime | 500 kr/t |
| Tilgjengelig egenkapital | 300 000 kr |
| Rente | 6 % |
| Låneandel kjøpesum / oppussing | 90 % / 0 % |
| Finansiering av øvrige løpende utgifter | Nei |
| Oppussingsreserve | 20 % (redigerbar) |
| Salgskostnader | 120 000 kr fast sum (meglerprovisjon i prosent finnes fortsatt, standard 0 %) |
| Tid fra ferdig oppussing til økonomisk oppgjør | 3,5 mnd (redigerbar, 0–12) |
| Hjemområde | Trondheim (uendret) |

**Egeninnsatskategorier:** riving, maling/sparkling, gulv, tømrer, kjøkkenmontering, rør, elektro, bad/våtrom, annet. Hver kan være `selv`, `delvis` eller `innleid` (standarder i [src/config/defaultLabor.ts](../src/config/defaultLabor.ts)). **Maks egeninnsats** gjør ikke-regulert arbeid til «selv». **Regulert arbeid (rør, elektro, bad/våtrom) regnes aldri som gratis** med mindre brukeren har bekreftet kompetanse og ansvar – og aldri via «maks egeninnsats». Oppgitt fagkompetanse alene er ikke nok.

## 4. Scenario-spesifikk analysemodell

`estimates.scenarios` (valgfritt, maks 3): ett `basis` og inntil to `alternativ`. Hvert scenario har id, tittel, nivå, beskrivelse, **gjennomførbarhetsstatus** (`klar`, `betinget`, `uavklart`, `ikke_gjennomforbar`) med begrunnelse og krav til avklaring/godkjenning, **sluttprodukt** (soverom, planløsningsnotat, kjøkken- og baderendring), **egne tiltak**, foreslått oppussingstid, **egen `SaleEstimate`** (lav/normal/høy, prisgrunnlag, begrunnelse), **usikkerhet** og **referanser** til sammenlignbare objekter. Skjemaet er strengt – økonomiske nøkkeltall avvises. Et scenario som krever godkjenning kan ikke være `klar`.

**Fallback for eldre analyser** (`resolveAnalysisScenarios`): én global `estimates.sale` blir ett basisscenario merket `saleSource: 'global'` med usikkerhet «uavklart». Den globale salgsverdien kopieres **aldri** til alternative planløsninger som om den var vurdert for dem. Eldre oppussingsnivåer (lett/hoved/omfattende) virker som før.

**Tid:** for nye scenarioer er `suggestedMonths` oppussingstid, og total prosjektvarighet = oppussingstid + tid til oppgjør fra profilen (`settlementMonths`). For eldre analyser er varigheten total.

## 5. Arbeid og pris i oppussingstiltak (klargjort for prisbank)

`RenovationItem` har fortsatt `materials`, `electrician`, `plumber`, `other`, `hours` (eldre regler: fagene er innleide kostnader, `hours` er egne timer). Valgfrie tillegg: `laborCategory`, `laborHours` (totalt), `laborCostHired`, `workMode`, `selfShare`, `priceSource {kind: agent|prisbank|bruker, version}`. Med `laborCategory` skilles materialer og arbeid, og egne timer og innleid arbeid avledes av arbeidsmodus. Ingen nasjonale priser er lagt inn.

## 6. Private overstyringer

Et privat scenario (`ScenarioValues`) er en full kopi av grunnverdiene fra valgt agentscenario og profilen, og kan endres felt for felt: kjøpspris, fellesgjeld, kjøpsgebyrer, tiltak (materialer, arbeid, timer), oppussingssum, varighet, månedlige kostnader, rente, låneandeler, egenkapital, salgspriser og -kostnader, reserve, arbeidsmodus, minimumskrav og budgrenser. UI viser grunnverdi og opprinnelse (annonse, analyse, scenario, profil, modellregel), «Endret av deg» og «Tilbakestill» per felt, og tilbakestilling av tiltak per tiltak (også «Legg tilbake» for fjernede tiltak). `ScenarioValues.analysisScenarioId` husker hvilket agentscenario kalkylen bygger på.

## 7. Markedsvekting V1 ([src/calc/market.ts](../src/calc/market.ts))

**Fysisk likhet 0–100:** lokasjon 25 (samme bygg 25, mikroområde 20, bydel 14, kommune 8, region 3), standard mot sluttproduktet 25, BRA-i 15, soverom/planløsning 15, boligtype/eierform 10, øvrige egenskaper 10. BRA-avvik: ≤5 % → 15, ≤10 % → 13, ≤15 % → 10, ≤25 % → 6, ≤35 % → 3, større → 0 (og sekundærreferanse). Standardavstand: 0 → 100 %, 1 → 80 %, 2 → 45 %, 3 → 15 %, 4 → 0 % av standardpoengene.

**Adskilte faktorer:** `physicalMatch`, `reliabilityFactor` (datakvalitet; manglende dato ×0,8, manglende areal ×0,6, ikke normaliserbart prisgrunnlag ×0,5) og `marketTimeFactor` (alder; faller sakte når salget er markedsjustert, raskt uten indeks).

```
effectiveWeight = physicalMatch/100 × reliabilityFactor × marketTimeFactor × standardTak
adjustedPrice   = soldPrice × marketIndexNow / marketIndexAtSale     (eller manuell markedsjusteringsfaktor)
```

**Standardtak:** avviker standarden to trinn eller mer, begrenses vekten (×0,75 / ×0,4), og referansen kan ikke bli primær. Dermed kan samme bygg i gammel standard ikke dominere et nyoppusset scenario – og trekker ikke ferdigverdien ned (oppussingsobjekt havner utenfor ankeret).

**Roller:** `primaer` (fysisk ≥ 65, pålitelighet ≥ 0,6, standardavstand ≤ 1, BRA-avvik ≤ 25 %), `sekundaer` (svakere sold, tas bare med i anker hvis det er under to primærer), `markedsreferanse` (aktive annonser – vekt 0, **aldri oppnådd salgspris**, brukes som markedssignal og konkurranse).

**Estimat:** prisnormalisering til totalpris (kontant + fellesgjeld), robust vektet **median** som anker, vektet **snitt** som kontroll, spredning (vektet MAD), og intervall etter datakvalitet: svært godt ±3–4 %, normalt ±4–6 %, svakt ±7–10 % (pluss spredning og konkurrerende annonser, maks ±12 %). **Kvalitet:** 70 poeng for gode salg (3 gode = full uttelling), 15 for relevant aktiv annonse, 15 for pålitelighet. Tier: ≥ 85 svært godt, ≥ 65 normalt, ≥ 40 svakt, ellers **for usikkert** – da gis ingen tvungen normalverdi. 2 svært gode salg kan gi verdi med lavere sikkerhet.

## 8. Områdeprofil (datamodell, ikke koblet)

[src/domain/areaProfile.ts](../src/domain/areaProfile.ts): område-ID og nivå, `asOf`/periode, prisutvikling 1/3/6/12 mnd, volum, robust kr/m², salgstid, salg vs prisantydning, aktive objekter/prisreduksjoner, likviditet, datamengde og sikkerhet, kilde/versjon, og plass til soverom- og oppussingspremie. `selectAreaProfile` faller tilbake samme bygg → mikroområde → bydel → kommune/by → region og hopper over profiler med for lite data. `marketIndexFromAreaProfile` gjør prisutviklingen om til en markedsindeks (`MarketIndex`) som markedsvektingen kan ta imot. Ingen data hentes.

## 9. Scenario-rangering ([src/calc/ranking.ts](../src/calc/ranking.ts))

Kriterier og vekter (vises i UI): fortjeneste 25 %, prosjektavkastning 15 %, fortjeneste per egeninnsatstime 15 %, risiko 10 %, salgsverdiens sikkerhet 10 %, stresstest (kombinert) 10 %, finansieringsgap 10 %, prosjektvarighet 5 %. Hvert kriterium normaliseres mellom scenarioene med en vesentlighetsgrense (små forskjeller teller forholdsmessig mindre). Kriterier som ikke gjelder (f.eks. timesats uten egne timer) utelates og vekten fordeles på resten. **Bare `klar` + komplett kalkyle kan anbefales; betingede og uavklarte scenarioer rangeres for sammenligning, men styrer aldri anbefalt scenario eller anbefalt maksbud.**

## 10. Migrering

| Hva | Hvordan |
|---|---|
| Database | `DB_SCHEMA_VERSION` 3 → 4 ([src/data/db.ts](../src/data/db.ts), `MIGRATIONS[3]`). Profiler og scenarioer migreres; ingen rader droppes. Analyser trenger ingen migrering (nye felt er valgfrie). |
| `financingPct` | Blir både `purchaseFinancingPct` og `renovationFinancingPct` (eldre kalkyler gir samme resultat). Ukjent (`null`) forblir ukjent. |
| Nye scenariofelt | Profilens verdier brukes der de finnes (egenkapital, minimumskrav, arbeidsmodus), ellers `null`/standard. |
| Profilens `financingPct` | Bevares som kjøps- og oppussingslån for eksisterende profiler. Nye kontoer får 90 %/0 %. |
| Skjema | `ScenarioValuesSchema` og `ProfileDefaultsSchema` kjører `migrateScenarioValuesRaw` / `migrateProfileDefaultsRaw` før validering, så gamle rader (også kursets localStorage, import og eksport) alltid kan leses. `evaluateScenario` normaliserer også eldre verdier. |
| Import v1 | `financing` blir kjøps- og oppussingslån; `hourRate` beholdes som utfaset `hourValue`; nye felt hentes fra profilen. |
| Eksport | Formatet er uendret (`flipprom-scenarios` v1) med nye felt i `values` og nøkkeltallene `profitPerOwnHour`, `equityNeed`, `equityGap` i `result`. |
| Kurset | Bruker samme motor; casene bruker 90 %/90 % og er uendret (Case A: −284k / −87k / +208k). |
