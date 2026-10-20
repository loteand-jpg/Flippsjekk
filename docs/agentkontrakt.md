# Agentkontrakt (flipprom-agent-analysis v1)

Den fremtidige analyseagenten leverer **strukturert JSON** etter denne kontrakten. Skjemaet og valideringen ligger i [src/domain/agentContract.ts](../src/domain/agentContract.ts), og et komplett gyldig eksempel finnes i [eksempel-agent-analyse.json](eksempel-agent-analyse.json). Eksempelet genereres fra mockagenten og valideres av testene.

Mockagenten ([src/services/mock/mockAgent.ts](../src/services/mock/mockAgent.ts)) leverer allerede på kontrakten. Den simulerte jobbflyten kjører derfor hele kjeden kontrakt → validering → adapter → publiseringskontroll → atomisk publisering.

## Grunnregler

1. **Ingen økonomiske nøkkeltall fra agenten.** Feltene `profit`, `maxBid`, `projectReturn`, `breakEven`, `result` og `roi` avvises. Fortjeneste, maksbud, avkastning, nullpunkt og stresstester beregnes deterministisk av motoren.
2. **Ukjent er ukjent.** En opplysning agenten ikke kan dokumentere leveres som `{ "value": null, "status": "uavklart", "sourceId": null }`. `value: null` med en annen status avvises.
3. **Dokumentert betyr kildebelagt.** `status: "dokumentert"` krever `sourceId`. Alle `sourceId` i risikoer, sjekkliste og sammenligninger må finnes i `sources`.
4. **Anslag er anslag.** Salgsverdier og oppussingskostnader er begrunnede anslag (`rationale*`), ikke pristilbud.
5. **Ingen udokumentert markedsvekst.** `estimates.sale.includesMarketGrowth` må være `false`.
6. **Ingen uavklart verdiøkning.** Nytt soverom, utleiedel, seksjonering eller tomteutvikling regnes ikke med i salgsverdien før det er godkjent. Slike alternativer merkes `requiresApproval: true`.
7. **Faktiske salg skilles fra prisantydninger.** `comparables[].kind` er `solgt` (dokumentert salgssum), `prisantydning` eller `solgt_uten_sum`. Hvert objekt har eksplisitte felt: `askingPrice`, `soldPrice` (kontant), `soldTotalPrice` (inkl. fellesgjeld), `commonCosts` (per måned), `area`, `date` og `notes`. Ukjent leveres som `null`, aldri 0. Faktisk salg krever `soldPrice` eller `soldTotalPrice`.
8. **Ukjente toppnivåfelt bevares** i `analysis.unmappedFields`. Kontrakten er en løs struktur på toppnivå, men `estimates` er streng.

## Struktur

| Felt | Innhold |
|---|---|
| `contract`, `contractVersion`, `analysisSchemaVersion` | `"flipprom-agent-analysis"`, `1`, `1` |
| `finnId`, `generatedAt`, `agent{name,version}` | Identitet og sporbarhet |
| `listing` | Annonsefakta. Tall leveres som kildebelagte verdier `{value, status, sourceId, page?}`: `askingPrice`, `sharedDebt`, `listingTotalInclCosts` (inkl. kjøpskostnader), `monthlyCommonCosts`, `areaBRAi`, `rooms`, `bedrooms`, `floor`, `buildYear`, `plotArea`. I tillegg `tenure` og `saleStatus` som kildebelagte enum-er, samt adresse, område, boligtype, `observedAt` og `sourceUrl`. |
| `viewings[]` | Annonserte visninger: stabil `id`, `start`, `end`, `status` (`planlagt`/`avlyst`) og `sourceId` |
| `sources[]` | `id`, `kind`, `title`, `url`, `documentName`, `page`, `fetchedAt`, `observedAt`, `status`, `isDemo` |
| `assessment` | `recommendation` (interessant, folg_med, avklar_forst, avsta), `recommendationRationale`, `summary`, `strategy`, `conditions[]` |
| `estimates` | `sale{basis, low, base, high, rationale*, includesMarketGrowth:false}`, `renovationOptions[]` (lett/hoved/omfattende med tiltak per rom: materialer, elektriker, rørlegger, andre fag, egne timer, prioritet, inkludert), `defaultRenovationOptionId`, `months`, `monthlyBreakdown[]`, `buyFees`, `debtAtSale`, `suggestedPurchasePrice`, `dutyRule`, og valgfritt `scenarios[]` (basis + inntil to alternativer) med `defaultScenarioId` |
| `risks[]` | Kategori, alvorlighet 1–10 eller `null` (ukjent), mulig kostnad lav/høy, begrunnelse, kilde og tiltak |
| `checklist[12]` | Alle 12 faste punkter med kildestatus (dokumentert, delvis, mangler, ikke_relevant), notat, kilde og oppgave før bud |
| `comparables[]`, `facts[]`, `assumptions[]`, `uncertainties[]`, `report[]`, `bidSteps[]`, `nextSteps[]` | Rapportinnhold |

`monthlyTotal` leveres **ikke** av agenten. Adapteren summerer `monthlyBreakdown`, og en ukjent post gir ukjent sum.

## Flyt i backend

```
agent → JSON
  → parseAgentOutput()        kontraktvalidering (Zod), presise feltstier ved feil
  → adaptAgentOutput()        intern modell: property-patch, snapshot, visninger, analyse
  → validateForPublish()      PublishableAnalysisSchema (12 sjekkpunkter, kilder, anbefaling …)
  → atomisk transaksjon       ny versjon published, forrige superseded, forbruk registreres
```

Feiler et steg, markeres jobben som feilet med feltliste. Ingen delvis skriving skjer, og en eksisterende gyldig analyse berøres ikke.

## Dataskille og rettigheter

Agentens resultat er **felles** data og kan gjenbrukes av andre abonnenter som legger inn samme FINN-ID. Private dokumenter eller kommentarer fra en bruker skal aldri sendes til agenten som grunnlag for en felles analyse. Før produksjon må datakilden tillate den planlagte innhentingen, lagringen og gjenbruken (se [integrasjoner.md](integrasjoner.md)).

## Scenarioer (valgfritt, modell 1.2)

`estimates.scenarios` kan inneholde **nøyaktig ett `basis`** og **høyst to `alternativ`** (unike id-er). Eksempel: [eksempel-agent-analyse-scenarier.json](eksempel-agent-analyse-scenarier.json). Hvert scenario har:

- `kind`, `level`, `title`, `description`
- `feasibility` (`klar`, `betinget`, `uavklart`, `ikke_gjennomforbar`), `feasibilityRationale`, `requirements[]` (krav til avklaring/godkjenning) og `requiresApproval`. **Et scenario som krever godkjenning kan ikke være `klar`, og kan ikke ha lav myndighetsrisiko.**
- `endProduct`: `bedrooms`, **`standardClass`** (`oppussingsobjekt`, `dagens_standard`, `middels`, `oppgradert`, `nyoppusset`; brukes automatisk av markedsvektingen – mangler den, brukes en merket fallback som ikke fremstår som dokumentert), `layoutNote`, `kitchenChange`, `bathChange` (`ingen`, `oppgradering`, `nytt`, `uavklart`)
- `items[]`: egne tiltak. Med `laborCategory` (`riving`, `maling_sparkling`, `gulv`, `tomrer`, `kjokkenmontering`, `ror`, `elektro`, `bad_vatrom`, `annet`) skilles materialer (`materials`) fra arbeid (`laborHours`, `laborCostHired`). `priceSource` angir kilde og senere prisbankversjon. **Én kostnadsmodell per tiltak:** et tiltak med `laborCategory` må ha `electrician`, `plumber` og `other` lik 0/`null` – ellers avvises scenarioet (arbeidet ville blitt talt to ganger). Tiltak uten `laborCategory` bruker de eldre fagfeltene som før.
- `suggestedMonths` (selve oppussingen), `vatIncluded`
- **`risk`** `{technical, cost, time, approval, note}` med nivåene `lav | middels | hoy | uavklart` – scenarioets egen risiko (teknisk, kostnadsusikkerhet, tid, myndighet/godkjenning), brukt i rangeringen sammen med objektets generelle risiko. Utelatt = ikke vurdert (regnes som uavklart).
- `sale` (valgfri): agentens **historiske estimat** for sluttproduktet. Det er referanse og fallback – **ikke fasit**. Koden fastsetter endelig low/base/high fra markedsreferansene (se under).
- **`anchorAdjustment`** (valgfri) `{pct, category, reason}`: begrunnet justering av markedsankeret for kvalitative forhold modellen ikke fanger (`utsikt_lys`, `planlosning_kvalitet`, `beliggenhet_detalj`, `utforelse_kvalitet`, `annet`). **Maks ±5 %** og konkret begrunnelse (minst 20 tegn). Koden bruker justeringen; agenten leverer ingen egen salgsverdi som konkurrerer med markedsmotoren.
- **`referenceClassification[]`** `{comparableId, layoutMatch, note}`: planløsningslikhet for referansene mot DETTE scenarioets sluttprodukt. Et alternativ uten klassifisering har ukjent planløsningslikhet.
- **`screening`** (alternativer fra scenariojakten) `{concept, addedBedrooms, existingBathNeedsFullRenovation?, checks[]}`. `concept`: `dele_rom`, `flytte_kjokken_nytt_soverom`, `ekstra_soverom_annet`, `flytte_bad`, `annet`. `checks[]` må vurdere alle aspekter: `dagslys_vindu`, `romgeometri`, `teknisk`, `vann_avlop`, `ventilasjon`, `myndighet`, `okonomi`, hver med `ok | tvil | ikke_ok | uavklart` og merknad. Regler: `ikke_ok` betyr at grepet ikke er et scenario (før det som avvist i `scenarioSearch`); `tvil`/`uavklart` er tillatt, men scenarioet kan da ikke være `klar`; `flytte_bad` krever `existingBathNeedsFullRenovation: true`.
- `uncertainty {level, note}` og `referenceIds[]` (id-er i `comparables`) + `referenceNote`

I tillegg på `estimates`: **`scenarioSearch`** `{status, considered[]}` (`status`: `ferdig`, `stoppet_ingen_bestod`, `ikke_gjort`; `considered[]`: `{concept, outcome: valgt|avvist, reason, scenarioId}`). Representerer hva scenariojakten vurderte og avviste. `stoppet_ingen_bestod` krever at det ikke finnes alternativer i settet; et `valgt` grep må peke på et alternativ som finnes.

Skjemaet er strengt: økonomiske nøkkeltall (fortjeneste, maksbud osv.) avvises også inne i et scenario. Mangler `scenarios`, brukes analysens ene `sale` som fallback for ett basisscenario – den kopieres aldri til alternativer.

### Én autoritativ salgsverdiflyt

1. strukturerte markedsreferanser (`comparables[]`) → 2. koden beregner anker og intervall → 3. agenten kan levere sluttprodukt, referanseklassifisering og en begrenset, begrunnet `anchorAdjustment` → 4. **koden fastsetter endelig low/base/high**. Agentens `sale` vises som historisk estimat ved siden av markedsmotorens verdi og brukerens private tall, og brukes bare som tydelig merket fallback når markedsmotoren ikke kan regne (se [scenarier-og-marked.md](scenarier-og-marked.md) §5).

### Sammenlignbare objekter (`comparables[]`)

Valgfrie egenskaper til markedsvektingen: `bedrooms`, `propertyType`, `tenure`, `sharedDebt`, `locationLevel`, `standardClass`, `layoutMatch`, `floor`, `elevator`, `balcony`, `parking`, `dataQuality`, `marketAdjustment`, og **`originalAskingPrice`** (aktive annonser: opprinnelig prisantydning; lavere nåværende pris betyr prisnedsatt). Mangler et felt, regnes egenskapen som **ukjent – ikke middels** (lav fysisk likhet, lavere pålitelighet, kan hindre primærstatus). En aktiv annonse uten kjent fellesgjeld får ikke beregnet totalpris per m² (aldri antatt 0).

## Oppfrisking og full analyse

Agenten kalles for en **full teknisk analyse** (`full_analysis`) bare når analysen mangler, er inkompatibel med gjeldende modell, eller kilden melder nye/endrede dokumenter eller endrede kritiske fakta. At en analyse er eldre enn 30 dager gir i stedet en **grundig markedsoppfriskning** (`market_refresh`) som ikke leser tekniske dokumenter på nytt og ikke lager nye scenarioer – se [scenarier-og-marked.md](scenarier-og-marked.md) §6.
