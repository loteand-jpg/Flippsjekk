# Flippsjekk

Norsk abonnementstjeneste for å analysere, sammenligne og planlegge boligflipp. En FINN-lenke blir et begrunnet beslutningsgrunnlag: oppussingsbehov, salgsverdi etter oppussing, totalkostnad, stresstester og et modellert maksbud for ditt eget fortjenestemål.

**Dette er første versjon (demo).** Frontend, domenemodeller, beregningsmotor, mockdatabase og hele brukerflyten fungerer uten API-nøkler. Innlogging (Google og e-postkode), abonnement (Vipps) og analyseagent er **simulert**. Versjonen er ikke klar for betalende kunder før ekte Auth, database med tilgangskontroll, Vipps og agent er koblet til – se [docs/integrasjoner.md](docs/integrasjoner.md).

## Kom i gang

Krever Node 20 eller nyere (testet med Node 25).

```bash
npm install
npm run dev          # http://localhost:5173
```

| Kommando | Hva den gjør |
|---|---|
| `npm run dev` | Utviklingsserver |
| `npm run build` | Typekontroll + produksjonsbygg til `dist/` |
| `npm run preview` | Serverer `dist/` lokalt |
| `npm test` | Enhets- og tjenestetester (Vitest) |
| `npm run typecheck` | TypeScript for app, tester og konfig |
| `npm run test:e2e` | Hovedflyten i Chromium, desktop og mobil (Playwright). Første gang: `npx playwright install chromium` |
| `npm run check` | Typekontroll + tester + bygg |

Appen bruker hash-ruting (`#/oversikt`), så `dist/` kan legges på hvilken som helst statisk server.

**Siden vises ikke hvis du bare åpner filen.** Dobbeltklikk på `index.html` (eller `dist/index.html`) fungerer ikke, fordi nettlesere blokkerer JavaScript-moduler og CSS som lastes fra `file://`. Kjør `npm install` og `npm run dev` (eller `npm run build` og `npm run preview`), eller legg `dist/` på en webserver.

**GitHub Pages:** repoet har en arbeidsflyt (`.github/workflows/pages.yml`) som bygger og publiserer siden. Slå den på under *Settings → Pages → Build and deployment → Source: GitHub Actions*. Siden vises da på `https://<bruker>.github.io/Flippsjekk/`. Publiserer du råfilene fra `main` i stedet for `dist/`, blir siden blank, fordi `index.html` i roten peker på `src/main.tsx`, som nettleseren ikke kan kjøre.

## Testprofiler

Innlogging skjer med **Google** eller **e-post med engangskode** – det finnes ingen passord. I demoen sendes ingen e-post: koden vises i en simulert e-post på skjermen, og Google-innloggingen bruker en simulert kontovelger. Under «Testprofiler» på innloggingssiden kan du hoppe over koden. Vipps, mobilnummer og Apple kommer senere.

| Profil | E-post | Abonnement | Innhold |
|---|---|---|---|
| Ada Aksnes (Bruker A) | `ada@demo.flipprom.no` | Aktivt, månedlig | 12 objekter, inkl. solgt, trukket og arkivert |
| Bjørn Berg (Bruker B) | `bjorn@demo.flipprom.no` | Aktivt, årlig | 4 objekter, deler Elvekanten 17 B og Singsakerbakken 2 med Ada |

Du kan også opprette en ny konto (e-postkode eller Google, uten abonnement) og starte abonnementet med Vipps fra kontosiden. Betalingen godkjennes i en simulert Vipps-app, og nye abonnenter får første måned gratis (kampanje).

## Slik bruker du demoen

Knappen **Testkontroller** i den lilla demostripen øverst åpner et panel for å:

- bytte mellom bruker A og B, og se at samme objekt har ulike private scenarioer mens grunnanalysen deles
- sette abonnementstilstand: aktivt, prøveperiode, oppsagt ved periodeslutt, betalingsproblem, utløpt, ingen, og lav kvote (1 analyse per periode). Lagrede scenarioer slettes aldri.
- kjøre ferdige FINN-lenker:
  - **Cachetreff** `finn.no/900000113`: grunnlaget finnes fra før, men brukeren ser og belastes som ved en ny analyse (fremdriftsdialog, «Analysen er klar», én ny analyse i kvoten)
  - **Samme objekt, annet format**: `…/ad.html?finnkode=900000113&utm_source=…` normaliseres til samme FINN-ID
  - **Cachemiss** `finn.no/478027403`: ny simulert analyse med fem steg. Ukjente FINN-ID-er gir et deterministisk syntetisk objekt merket «Demodata – ingen annonse hentet».
  - **Gammel analyse** `finn.no/900000110`: over 30 dager. Eieren (som limer inn lenken eller åpner objektet) får automatisk en **grundig markedsoppfriskning** («Oppdaterer markedsdata», belastet som oppfriskning), ikke full ny analyse; en bruker som ber om analysen uten å ha objektet får en markedsoppfriskning som ser ut som en ny analyse. Full teknisk analyse kun ved nye dokumenter, endrede kritiske fakta eller inkompatibel modell. Alle valg tas av én beslutningsfunksjon (`decideRefresh`): 30 dager vurderes før 24 timer, og en offisiell visningshendelse kan utløse enkel oppfriskning selv om siste kontroll er under 24 timer gammel
  - **Feil og nytt forsøk** `finn.no/900000999`: første forsøk feiler uten belastning, og retry er idempotent
  - **Pågående felles jobb**: den andre testbrukeren starter en analyse, og du kobles til samme jobb uten belastning
  - **Ugyldig lenke**: forståelig feilmelding
- simulere at neste analyse feiler (henting eller kvalitetskontroll). En eksisterende analyse erstattes aldri.
- **Tilbakestille demodata.** Visningsdatoer genereres relativt til tidspunktet demodata lages, så tilbakestill hvis datoene har passert.
- simulere skadet lokal lagring. Appen tar en sikkerhetskopi og starter med nye demodata, uten hvit skjerm.

Andre ting å prøve:

- **Elvekanten 17 B** har tre scenarioer.
- **Singsakerbakken 2** har en ny grunnanalyse (v2) som Ada ikke har tatt i bruk.
- **Granåsen 22** har uavklart våtromskostnad (ufullstendig kalkyle), buddag på søndag og privat overstyring.
- **Ranheimsvegen 140 D** mangler dokumentasjon og eierform.
- **Sandmoflata 8 C** har høy fellesgjeld og bruker totalpris.
- **Ladeveien 9 A** har ingen offisiell visning, bare en privat.

Testtilganger finnes bare med mocktjenestene. I produksjonsmodus (`VITE_FLIPPROM_MODE=production`) vises ingen testkontroller, og det finnes ingen URL-parameter eller localStorage-verdi som gir betalt tilgang.

## Beregningsmotor

Rene funksjoner i [src/calc/engine.ts](src/calc/engine.ts). Objektside, tabell, sammenligning, kalender og eksport bruker samme motor. Alle mellomregninger gjøres i hele øre, og alle resultater merkes med modellversjon (`1.2.0`). Detaljer om scenarioer, markedsvekting, rangering og migrering: [docs/scenarier-og-marked.md](docs/scenarier-og-marked.md).

```
K      = A × d + F                         kjøpskostnader
RB     = R × (1 + b)                       oppussing med reserve
I      = r × m/12 × (fP × P + fR × RB/2)         avdragsfrie lån: kjøpslån (kun på kjøpesummen P) fra start, oppussingslån trekkes i snitt halvveis
O      = M × m                             M = hele felleskostnaden + drift (gjeldsbetjening legges ikke til på nytt)
S      = V − D1 (totalpris) | V (kontant)  fellesgjeld ved salg trekkes nøyaktig én gang
Csale  = Sf + s × S                        fast sum + provisjon av kontantsalget
C      = P + K + RB + I + O + Csale
Resultat før skatt = S − C                 egen tid er IKKE en kostnad
Fortjeneste per egeninnsatstime = (S − C) / egne timer   mot ditt minimumskrav
Prosjektavkastning = (S − C) / (C + D0)    ikke egenkapitalavkastning
Egenkapitalbehov = (P − kjøpslån) + K + (RB − oppussingslån) + ikke lånefinansierte (I + O)   kjøpskostnadene K dekkes av egenkapital; uten salgskostnader
Finansieringsgap = max(0, egenkapitalbehov − tilgjengelig egenkapital)
```

- **Maksbud** løses baklengs med biseksjon (toleranse 1 kr). Kjøpsavgift og renter beregnes på nytt for hver pris. Grensene beregnes hver for seg: fortjenestemålet og (med egne timer) **minimum fortjeneste per egeninnsatstime**. Anbefalt maksbud er den laveste, og det vises hva som begrenser. Tabellen viser i tillegg 100–400 000 kr og 15/20 % avkastning. Finnes ingen løsning, vises «Ingen gjennomførbar pris innen søkeområdet». Timekravet er et mål, ikke en kostnad og ikke en port for et scenario.
- **Kjøpslånet gjelder kjøpesummen** (fra modell 1.2). Tidligere ble låneandelen også brukt på kjøpskostnadene; historiske tall er derfor ikke bit-for-bit identiske (se [docs/scenarier-og-marked.md](docs/scenarier-og-marked.md) §2.1).
- **Stresstester:** salg −5/−10/−15 %, oppussing +100 000 kr (reserve og renter beregnes på nytt), tid +3 mnd, kombinasjon, og isolert økt gjeld ved salg.
- **Ukjent er ukjent:** manglende inngangsverdier gir ufullstendig kalkyle med navngitte mangler, aldri 0 kr.
- **Skatt** er uavklart som standard og vises bare som separat illustrasjon med din egen sats. Ingen automatisk skattefordel ved tap.
- **Dokumentavgift** er en eksplisitt, overstyrbar regel etter eierform. Selveier: 2,5 % av kjøpesum + fellesgjeld (følger kjøpsprisen). Borettslag: 0.

**Standardforutsetninger** (redigerbare på kontosiden, ikke verifiserte markedsvilkår): 10 arbeidstimer per uke (samlet team), minimum 500 kr per egeninnsatstime, 300 000 kr tilgjengelig egenkapital, 6 % rente, 90 % låneandel på kjøpesum og 0 % på oppussing, ingen lånefinansiering av løpende utgifter, 20 % reserve, 400 000 kr fortjenestemål, 120 000 kr salgskostnader (fast sum, meglerprovisjon 0 % som tillegg), 3,5 måneder fra ferdig oppussing til økonomisk oppgjør og arbeidsmodus (selv/delvis/innleid) per kategori. Kjøpertype er leilighet → privat og hus → AS i eksempelprofilene. Kjøpertype endrer ikke skattebehandlingen.

**Scenarioer:** en analyse kan ha basis og inntil to alternative planløsninger, hver med egne oppussingstiltak, egen salgsverdi og egen gjennomførbarhetsstatus. Eldre analyser med én global salgsverdi virker via fallback (ett basisscenario merket som global). Alle verdier kan overstyres privat per scenario, med grunnverdi, opprinnelse og «Tilbakestill». **Salgsverdien fastsettes av koden** (markedsmotoren) fra strukturerte referanser per scenario og sluttstandard; agentens estimat er en historisk referanse, ikke fasit. **Markedsvekting** vekter sammenlignbare objekter etter fysisk likhet, pålitelighet og alder; ukjente opplysninger er ikke «middels»; aktive annonser er aldri oppnådd salgspris, men kan flytte normalverdien moderat innenfor intervallet. Scenarioene rangeres på flere kriterier inkl. scenarioets egen risiko, og betingede scenarioer styrer aldri anbefalt maksbud. Regulert arbeid (rør, elektro, bad/våtrom) regnes aldri som gratis uten kompetanse bekreftet per område.

Kontrollregnestykket fra kravspesifikasjonen (resultat 539 900 kr, totalpris-varianten og kapitalgrunnlag 2 760 100 kr) er dekket av tester i [src/calc/engine.test.ts](src/calc/engine.test.ts).

## Budprognose og kalender

Kalenderen åpner som vanlig månedskalender: uker nedover med ukenummer, og mandag til søndag bortover. Du kan bytte til listevisning, og valget huskes per bruker. På mobil viser dagsrutene ikoner for hendelsene, og du trykker på en dag for å se dagens hendelser under kalenderen.

«Forventet buddag» settes kl. 12:00 (Europe/Oslo) dagen etter siste kjente, ikke avlyste offisielle visning. Det er en planleggingsprognose, ikke en bekreftet budstart eller akseptfrist.

- Faller dagen på helg eller helligdag, vises en advarsel og første virkedag.
- Private visninger påvirker ikke prognosen, og uten offisiell visning finnes ingen prognose.
- Du kan legge inn en privat overstyring; kildeverdien bevares.
- Kalenderen eksporteres som `.ics` med stabile UID-er og VTIMEZONE for Oslo.

## Kurs (Flipping nivå 1 - Privat)

Siden **Kurs** (`#/kurs`) er første kurs i en serie. Kurset ligger på `#/kurs/flipping-privat` og har **11 moduler** (53 sider, hver modul avsluttes med kontrollspørsmål), deretter sluttcase, sluttquiz og en fullføringsside, ca. 3 t 40 min. «Flipping nivå 2 - AS», «Utleie nivå 1 - Privat» og «Utleie nivå 2 - AS» vises som «Kommer senere» – uten innhold.

- **Betalingsmur:** kurset koster **2 999 kr** (eksempelpris), kjøpes **én gang** med Vipps og gir **varig tilgang**. Uten kjøp vises bare en salgsside med kursoversikten (titler og formål) – selve innholdet er låst, også med direkte lenke til en side. Tilgangen er uavhengig av Flippsjekk-abonnementet, og kurskjøp gir ikke abonnement. Kurskatalog og pris ligger i `src/config/courses.ts`. Ada har kjøpt kurset i demoen, Bjørn har ikke (viser betalingsmuren). Kjøpene ligger i `coursePurchases` og vises under «Mine kurs» på Konto.

- Innholdet ligger som data i `src/course/content/` (`m01-03.ts`, `m04-06.ts`, `m07-11.ts`, `finalQuiz.ts`) og rendres av `src/pages/CoursePage.tsx`, én side om gangen (`?modul=4&side=2`, `side=q` for kontrollspørsmål, `modul=sluttcase|sluttquiz|ferdig`). Ordlisten ligger i `src/course/glossary.ts`. Modulrekkefølgen er låst og testes i `src/course/course.test.ts`.
- **Faglig kontrollert-dato** (17. oktober 2026) står i `src/course/types.ts` og vises på infosiden, under hver side og i utskrifter. Markedstall og 2026-planleggingstall står samlet i `src/course/marketData.ts`.
- En side regnes som lest når brukeren trykker «Neste» eller markerer den selv. Fremdrift, quizsvar, avkrysninger, budsjett, kalkyle og sluttcase lagres lokalt per bruker (localStorage, nøkkel `…course.flipping-privat.v2`) og tåler ugyldige lagrede data. Fremdrift fra forrige kursversjon (19 moduler) overføres ikke – bare kalkyle, budsjett og avkrysninger. Nullstilling finnes i kurset.
- Interaktivt: kontrollspørsmål per modul, sluttcase i seks trinn, sluttquiz (15 spørsmål, bestått ved minst 12), før-bud-sjekkliste (åpnes fra relevante sider og på slutten; utskrift og nedlasting), flippbudsjett, kalkulator med scenarioer, stresstester, avkastning, maksbud og Case A/B/C. Kalkulatoren bruker den samme beregningsmotoren som resten av Flippsjekk, og ukjent regnes aldri som 0 kroner.
- Faktaboksene (Gjeldende regel, Regelradar, Flippsjekk-tips, Rødt flagg, Eksempel, Dette må avklares, Kort forklart, Husk) har egne etiketter og ikon, så de ikke bare skilles på farge. Utdypinger ligger i åpne/lukkbare seksjoner.

## Struktur

```
src/
  calc/          beregningsmotor og scenariolag (ren TS, testet)
  domain/        enum-er, Zod-skjemaer (kilde til typene), agentkontrakt, risiko/datakvalitet
  lib/           FINN-normalisering, tidssone, helligdager, budprognose, ics, formatering, sortering
  data/          versjonert mockdatabase, seed (13 fiktive objekter), syntetiske objekter
  services/      tjenestegrensesnitt (types.ts) og mockimplementasjon (mock/)
  import/        v1-importadapter, eksempel og scenarioeksport
  app/           kontekst for tjenester, sesjon, analyseflyt, varsler, preferanser
  components/    UI-primitiver, layout, liste/tabell, objektfaner, diagrammer
  pages/         forside, slik fungerer det, innlogging, oversikt, objekt, kalender, sammenligning, konto (inkl. abonnement), import
e2e/             Playwright-test av hovedflyten (desktop og mobil)
docs/            datamodell, agentkontrakt, formater, integrasjoner og eksempelfiler
```

## Dokumentasjon

- [docs/datamodell.md](docs/datamodell.md): tabeller, skillet mellom felles og private data, og forslag til Supabase-skjema og RLS
- [docs/agentkontrakt.md](docs/agentkontrakt.md): kontrakten agenten skal levere, med komplett eksempel ([docs/eksempel-agent-analyse.json](docs/eksempel-agent-analyse.json))
- [docs/formater.md](docs/formater.md): import v1 (mapping og regler) og eksportformat for scenarioer
- [docs/integrasjoner.md](docs/integrasjoner.md): hva som er mock, og hva som gjenstår før kommersiell lansering
- [docs/design-varianter.md](docs/design-varianter.md): designvarianter (Original, Finance og Investment), galleriet på `#/design`, hvordan hver variant hentes tilbake (`pre-design-baseline`, `design-finance-v1`, `design-investment`) og hvordan en ny variant legges til

## Begrensninger i denne versjonen

- All data ligger i nettleserens localStorage. Tilgangskontrollen i mocklaget kjører i nettleseren og er **ikke sikkerhet**.
- Ingen data hentes fra FINN. Alle objekter, dokumenter og sammenligningssalg er fiktive og merket som demodata.
- Priser og kvoter for abonnementet er eksempelverdier i [src/config/plans.ts](src/config/plans.ts). Ingen kommersiell pris er besluttet.
- Oppussingsanslag er ikke pristilbud, og maksbud er ikke en budfullmakt.
