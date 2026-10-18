# Import- og eksportformater

## Import: flipprom-analysis v1

Det eksisterende Flippsjekk-formatet, i UTF-8 JSON:

```json
{"format":"flipprom-analysis","version":1,"objects":[]}
```

- Maks 20 objekter og 1 MB per import. BOM fjernes, og ugyldige UTF-8-tegn gir en advarsel.
- Adapteren ([src/import/v1Adapter.ts](../src/import/v1Adapter.ts)) mapper til intern modell. **Importformatet er ikke databaseskjemaet.**
- Importsiden viser en forhåndsvisning med feil og merknader per felt før noe lagres. Hele importen lagres atomisk.
- Et komplett eksempel finnes i [eksempel-import-v1.json](eksempel-import-v1.json).

### Felt og mapping

| v1-felt | Intern verdi | Merknad |
|---|---|---|
| `id`, `name` | kildereferanse og privat visningsnavn (`user_properties.label`) | Felles adresse overskrives ikke |
| `url` | FINN-ID via `parseFinnUrl` | Påkrevd. Kjent FINN-ID kobles uten duplisering. |
| `type`, `tenure` | boligtype og eierform | `hus` → enebolig (med merknad). Boligtype kreves for nye eiendommer. |
| `status` | **arbeidsstatus** | Faktastatus (`dokumentert` …) eller salgsstatus (`solgt` …) gir presis feil |
| `asking` | fakta i privat utkast (`uavklart`) | Ikke kildebekreftet |
| `purchase`, `debt`, `exitDebt` | `purchasePrice`, `debtAtPurchase`, `debtAtSale` | `null` → ukjent |
| `saleBasis`, `bear`, `base`, `bull` | `saleBasis` (`kontant`/`total`), `saleLow`/`saleBase`/`saleHigh` | Mangler grunnlag → kontant med merknad |
| `rehab`, `hours` | rundsum og egne timer | Brukes bare når `tasks` er tom. Rundsum og tiltak summeres aldri sammen. |
| `tasks[]` | oppussingstiltak (room, title, materials, electrician, plumber, other, hours, priority, included) | Prioritet: påkrevd, anbefalt, verdiøkende, valgfri |
| `buffer`, `duty`, `salePercent`, `interest`, `financing`, `tax` | `reservePct`, `dutyPct`, `saleCommissionPct`, `interestPct`, `purchaseFinancingPct` **og** `renovationFinancingPct` (eldre `financing` gjaldt alt), `taxPct` | **Prosentpoeng.** Verdier mellom 0 og 1 gir merknad (mente du ×100?). Konvertering til desimal skjer i motoren. |
| `dutyBase` | dokumentavgiftsregel | Lik kjøpesum (+ gjeld) → dynamisk regel. Ellers eget grunnlag med merknad. |
| `buyFees`, `saleFixed`, `monthly`, `months`, `target`, `hourRate` | tilsvarende scenariofelt | `hourRate` beholdes som utfaset `hourValue` og styrer ikke hovedøkonomien. Egenkapital, minimumskrav per time og arbeidsmodus hentes fra brukerens profil. |
| `tax: null` | skatt uavklart | Tall → egen skatteforutsetning |
| `viewing`, `confirmed` | privat «importert visning» | `confirmed:false` forblir false. Påvirker aldri buddagen. |
| `bidDay` | privat overstyring (`origin: import_v1`) | Merket «ikke kildebekreftet». Overskriver ikke en eksisterende overstyring. |
| `startBid`, `walkAway`, `strategy`, `notes` | budplan, strategi og notater | |
| `source`, `sourceDate` | kilde med status `uavklart` | |
| `historicalMax`, `historicalProfit`, `historicalSale` | `analysis.history` | Historikk, ikke beregnede nøkkeltall |
| `checks[]` | sjekkliste i privat utkast | Status: dokumentert, delvis, mangler, ikke_relevant (`uavklart` → mangler). Arbeidsstatus gir feil. |
| `risks[]` | risiko (title, category, level, cost, source, action) | Ukjent kategori gir feil med feltsti |
| `comps[]` | sammenligninger (name, url, price, area, date, kind, notes) | `price` blir `soldPrice` (salg) eller `askingPrice` (prisantydning) etter objektets prisgrunnlag. Totalpris-feltet settes bare når fellesgjeld er kjent. `solgt` uten pris → «salgssum ikke dokumentert». |
| `analysis{…}` | anbefaling, oppsummering, rapport, forutsetninger, usikkerheter, kilder, fakta, budsteg | |
| ukjente felt | bevares i `unmappedFields` og `rawImport` | Vises i forhåndsvisningen |

`null` og tomme datoer bevares som ukjent. Felt som mangler helt behandles også som ukjent, og forhåndsvisningen lister dem.

### Hvor importen lagres

Alt fra importen blir **private** data:

- et privat analyseutkast (`visibility: private`, `status: draft`)
- et privat scenario
- private kalenderhendelser

En vanlig abonnent kan ikke skrive til den felles analysecachen via import. Finnes FINN-ID-en ikke fra før, opprettes bare en identitetsrad (FINN-ID og kanonisk URL med nøytral plassholderadresse). Brukerens opplysninger blir værende i det private utkastet.

Eksisterende private scenarioer overskrives bare dersom brukeren eksplisitt velger «Erstatt …» for objektet.

## Eksport: flipprom-scenarios v1

Kontosiden og oversikten eksporterer brukerens egne scenarioer ([src/import/scenarioExport.ts](../src/import/scenarioExport.ts)):

```json
{
  "format": "flipprom-scenarios",
  "version": 1,
  "exportedAt": "2026-10-16T08:00:00.000Z",
  "calcModelVersion": "1.2.0",
  "units": { "percent": "prosentpoeng", "currency": "NOK" },
  "scenarios": [
    {
      "finnId": "900000101",
      "canonicalUrl": "https://www.finn.no/realestate/homes/ad.html?finnkode=900000101",
      "address": "Elvekanten 17 B",
      "name": "Hovedscenario",
      "isPrimary": true,
      "baseAnalysis": { "id": "…", "version": 1 },
      "updatedAt": "…",
      "values": { "purchasePrice": 2950000, "interestPct": 7, "...": "…" },
      "result": {
        "status": "complete",
        "profitBeforeTaxAndOwnWork": 278627,
        "projectReturn": 0.0729,
        "profitPerOwnHour": 1850,
        "equityNeed": 574000,
        "equityGap": 274000,
        "cashSale": 4100000,
        "totalCosts": 3821373,
        "maxBid": 2835590,
        "maxBidLimitedBy": "profit",
        "maxBidProfitTarget": 2835590,
        "maxBidHourlyRequirement": 3100000,
        "missing": []
      }
    }
  ]
}
```

`values` følger `ScenarioValuesSchema` (fra modell 1.2 med `regulatedCompetence {ror, elektro, bad_vatrom}`), og ukjente verdier er `null`. `maxBid` er anbefalt maksbud (laveste av grensene), `maxBidLimitedBy` angir hva som begrenser (`profit` = fortjenestemål, `hourly` = minimum per egeninnsatstime), og de to grensene er oppgitt hver for seg. `result` er beregnet med motoren ved eksporttidspunktet og merket med `calcModelVersion`. Felles analyseinnhold eksporteres ikke.
