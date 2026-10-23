# Kursversjon 2 – forbedring og trygg innføring

**Status 23. oktober 2026:** Økonomidelen er implementert og lokalt validert; klar for overlevering til faglig og pedagogisk revisjon. Fortsatt under arbeid på grenen `kurs-v2`. `main` og dagens kurs er referanse og skal ikke erstattes før faglig, teknisk og kommersiell godkjenning.

## Beslutning: oppgrader eksisterende kurs, ikke lag parallell kopiprodukt

- Behold kursets identitet `flipping-privat` og eksisterende tilgang fra kurskjøp. Kurset skal ha én aktiv produksjonsversjon om gangen. `kurs-v2` er en egen utviklingsgren, ikke en ny kurs-ID eller et nytt betalingsprodukt.
- Behold alle 11 modulene og rekkefølgen samt sluttcase og sluttquiz. Gjør pedagogiske forbedringer innenfor dagens innholdsstruktur.
- Ikke slett eldre kursfiler eller innfør migrering av kjøp/progresjon før konsekvensene er kontrollert. Eksisterende betalere skal beholde varig tilgang. Uferdig progresjon og utfylte arbeidsark skal ikke forsvinne ved oppgradering.
- Ingen arbeid fra `kurs-v2` flettes til `main` uten eksplisitt kontroll. **Ingen sletting av gammel versjon i første leveranse.**

## Bekreftet utgangspunkt

- Kildekode i `src/course/`, kurskatalog `src/config/courses.ts`, tjenestekontrakter og tester i eksisterende repo.
- 11 moduler / 53 sider, kontrollspørsmål, sluttcase, sluttquiz og kalkulator.
- Kurset benytter `src/course/evaluate.ts` som tvinger eldre lån på `P + K`, mens gjeldende standardmotor beregner kjøpslån fra `P`; se `docs/scenarier-og-marked.md` §2.
- `src/course/marketData.ts` inneholder manuelle markeds- og oppussingsindikasjoner, ikke direkte kildeoppslag.
- Kurskjøp/Vipps er simulert, og innholdet ligger i klientbygget. Dette er **ikke** produksjonsklar tilgangskontroll.

## Status for første endringspakke (22. oktober 2026)

**Implementert på `kurs-v2`, ikke i `main`:**
- Kurskalkylen kaller nå standardmodellen direkte, uten eldre lånegrunnlag.
- Modul 8.1 beskriver kjøpslån, oppussingslån og renteberegning med separate satser.
- Case A-teksten og enhetstestfasiten er oppdatert til avrundet −282 000 / −85 000 / +210 000 kr, og etter separat illustrativ verdsetting av 250 timer à 350 kr: +123 000 kr i høyt scenario.
- En eksplisitt paritetstest krever identisk utfall i kurs og standardmotor for Case A og kontrollerer at kjøpslånet er 90 % av 3 millioner kroner.
- AI-overblikk og beregningsdokumentasjon er oppdatert.

**Verifisert:** GitHub-readback av de endrede filene og en uavhengig kontrollregning av Case A.

**Ikke verifisert:** `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, mobilvisning, hele kursets faglige innhold og kjøpsflyten. Repository kunne ikke klones til tilgjengelig lokalt testmiljø. Dette er derfor ikke en godkjent eller komplett kursversjon 2.

**Neste kontrollport:** Kjør testene i et repository-miljø. Rett eventuelle regresjoner, og kvalitetssikre deretter regelkilder og de 53 kurssidene. Kursinnhold og produksjonsbetaling skal ikke endres i `main` ennå.

## Leveranser

### A. Økonomisk samsvar (første prioritet)

1. Kurskalkyle bruker samme standardforutsetninger og økonomimotor som objektsidene – kjøpslån fra kontant kjøpesum, eget oppussingslån, renter, resultat og maksbud.
2. Oppdater forklaringer, eksempler, fasit og automatisk testgrunnlag samlet. Ikke endre motorens generelle regler for å få gamle kurstall til å stemme.
3. Skille prosjektresultat fra verdsatt egeninnsats og skatt. Minstekrav til fortjeneste per egeninnsatstime er en **redigerbar maksbudgrense**, ikke en kostnad eller automatisk dom over om et prosjekt er lønnsomt.
4. Verifiser Case A/B/C, sluttcase, ukjente verdier og fellesgjeld uten dobbelttelling.

### B. Faglig kvalitet og kildearbeid

1. Gjennomgå alle 53 sidene, ordlisten, 11 modulquizer, sluttquiz og alle verktøy.
2. Finn primærkilder og datostempler for skatt, bud/akseptfrister, låneforskrift, eierformer, dokumentavgift, byggteknikk og elektro/våtrom. Skill vedtatt regel, anbefalt praksis og forslag.
3. Revider markeds- og kostnadstall med sporbare kildehenvisninger. Utdatert informasjon vises som historisk, ikke «dagsaktuelt».
4. Faglige spørsmål som ikke kan verifiseres skal synlig merkes **må fagkontrolleres**, ikke gis oppdiktet referanse.

### C. Pedagogisk versjon 2

1. For hver modul: tydelig læringsmål, oppgave med avgjørelsesgrunnlag, forklaring av fasit og konkret resultat studenten tar med videre.
2. Behold det gode: tekstbasert gjennomgang, opplåsbart bakgrunnsstoff, kalkulator, risikobudsjett, før-bud-sjekkliste og sluttcase.
3. Legg til realistiske, dokumenterte case etter samtykke/kildesjekk. Bruk **fiktive case merket fiktivt** inntil slik dokumentasjon finnes; ikke oppgi påståtte reelle oppnådde priser.
4. Sjekk mobil, navigasjon, tilgjengelighet og brukerens progresjon. Film/video er et separat innholdsarbeid og inngår ikke automatisk i første utviklingsleveranse.

### D. Trygg kommersiell overgang

1. Sikre kursinnhold på server, Vipps betalingsbekreftelse, kjøpshistorikk og progresjon per bruker før betalt produksjon.
2. Kurskjøp er varig; gamle kjøp gir også tilgang til ny utgave med mindre bruker eksplisitt bestemmer noe annet.
3. Verifiser migrering av lagrede oppgaver, quiz/progresjon og private tall før en eventuell ny progresjonsnøkkel tas i bruk.
4. Kurspriser i demo er ikke salgsbeslutning. Avklar mva, kjøpsvilkår, angrerett og det konkrete kurstilbudet særskilt.

## Ferdigkriterier

- `npm run typecheck`, `npm test`, `npm run build` og `npm run test:e2e` er grønne på hele grenen.
- Økonomien er sammenlignet direkte med standardmotoren og mot uavhengig regnegrunnlag.
- Alle undervisningspåstander med datoavhengige regler er verifisert og har synlig kilde eller tydelig forbehold.
- Kjøp og progresjon er bevart, og produksjonsflyten er testet før lansering.
- Brukeren har sett/godkjent versjon 2 før `main` endres eller gammel kode eventuelt fjernes.

## Arbeidsfordeling

- ChatGPT/prosjekt: styring, regelfaglig kontrollplan, avgrensning og QA.
- Codex: avgrensede kodeendringer, regnetester, fremdrift og regresjon.
- Claude: større innholdsrevisjon og sammenheng på tvers av hele kurset.
- GitHub: kilde for beslutning, endringer og dokumentasjon.

**Neste prioritet:** Økonomiporten for leveranse A er dokumentert under. Claude kan overta den brede faglige og pedagogiske revisjonen (B og C) før lanseringsarbeid D.


## Økonomiport 23. oktober 2026 – overlevering til faglig revisjon

Arbeidet viderefører `a52f782` på `kurs-v2` og oppgaven i [issue #3](https://github.com/loteand-jpg/Flippsjekk/issues/3). Historisk teststatus over gjelder den første endringspakken; denne delen beskriver den ferdig implementerte økonomien.

### Endringer og kontrollgrunnlag

- Kurskalkulatoren, kravpanelet og maksbud-siden bruker nå samme lagrede `calc.profitTarget` og `calc.minProfitPerOwnHour`. Den tidligere lokale 300 000-kronersinnstillingen på maksbud-siden er fjernet; hurtigvalgene endrer det lagrede målet.
- Standardmotoren beregner separat maksbud etter fortjenestemål og timekrav. Felles visning bruker `Evaluation.recommendedMaxBid`, viser laveste relevante grense og hva som begrenser. Prosjektavkastningsmålet er bare informativt. Lavt/normalt/høyt salg bruker samme mål og motor; det finnes ingen egen konkurrerende løser i kurset.
- Ingen timer, ukjente timer eller usatt timekrav gir ingen timegrense og blokkerer ikke fortjenestemålet. Et uoppnåelig krav gir «Ingen gjennomførbar pris», også når den andre grensen har en løsning. Ingen mål gir «Ikke beregnet», aldri et bud på 0 kr.
- `hourValue` er fortsatt separat illustrativ alternativverdi; det påvirker ikke prosjektresultat, egenkapitalbehov eller anbefalt maksbud. Timekravet legges ikke til kostnadene.
- Kalkulatoren viser fortjeneste per egeninnsatstime, egenkapitalbehov og finansieringsgap. Separate lån, finansiering av løpende kostnader, ukjent tilgjengelig egenkapital og fellesgjeld følger standardmodellen.
- Sluttcaset bruker samme anbefaling og har separate kjøps-/oppussingslån. Prisgrunnlaget beholdes etter omlasting. Uavklart rørrehabilitering markeres uttrykkelig som et betinget regneeksempel uten denne risikoen, før nøkkeltallene. Det er ikke et ubetinget anbefalt bud.
- Konkrete motsetninger i modul 6/8, Case A, ordlisten og økonomiforklaringer i sluttquizen er rettet. Quiz-ID-er, fasitindekser og fremdrift er uendret. Øvrig fagstoff og skatteregler er ikke revidert.

**Før/etter-eksempel:** Case A med fortjenestemål 100 000 kr, 250 egne timer og krav 2 000 kr/t gir fortjenestegrense **2 823 760 kr**, timegrense **2 443 206 kr**, og anbefalt modellert maksbud **2 443 206 kr**. Tidligere viste kurset bare fortjenestegrensen. Kjøpsbud ved den lavere grensen oppfyller begge mål. Et positivt resultat under timekravet ved en høyere pris er fortsatt positivt.

### Bevaring av lagrede data

Lagringsnøkkelen `${uid}.course.flipping-privat.v2`, kurs-ID `flipping-privat`, 11 moduler og 53 sider beholdes. Kurskjøp, abonnement og produksjonsdatabase endres ikke.

`hurdle.minHourValue` var et eget redigerbart krav til fortjeneste per time, mens `calc.minProfitPerOwnHour` normalt var null. Ved lesing av eldre tilstand overføres det eldre kravet til kalkulatoren når standardfeltet er null. Null og 0 beholdes. Hvis begge gamle felt har ulike eksplisitte tall, prioriteres standardfeltet, mens den gamle verdien fortsatt ligger urørt i `hurdle.minHourValue`. Illustrativ `hourValue` overføres aldri som timekrav.

`hourlyRequirementVersion: 1` markerer samordningen. Dermed kan studenten senere tømme eller endre det aktive kravet uten at eldre verdier gjeninnføres ved omlasting. Den gamle felles `finalCase.financingPct` beholdes og brukes som utgangspunkt for begge nye låneandeler når de ikke finnes. Bevisst ukjente andeler beholdes som null.

### Validering og avgrensning

Regresjonstester kontrollerer økonomisk paritet, uavhengig kontrollregning ved 90/0, 90/90 og 75/20 prosent lån, fellesgjeld, ukjente verdier, separate maksbudgrenser, lavere kjøpsbud, uoppnåelige mål og bevaring av lagrede arbeidsark/quiz/fremdrift. Nettlesertestene kontrollerer de samme kursmålene på PC og mobil, navigasjon, alle 53 sider, simulerte kjøp og lagring etter omlasting.

Skytestene bruker installert Chromium gjennom en ignorert lokal Playwright-konfigurasjon fordi den vanlige nettlesernedlastingen er sperret av nettverkspolicy. Ingen nettverksbegrensninger eller signaturkontroller omgås. CI-oppsettet som installerer Playwrights Chromium er uendret.

Dette er økonomiporten for overlevering til Claude. Full regel-/kildekontroll, pedagogisk gjennomgang av alle sider og kommersiell produksjonssetting inngår fortsatt i leveranse B–D. Versjon 1 og tidligere kursøkonomi kan gjenfinnes i Git-historikken. `main` endres ikke av denne leveransen.


**Faktiske lokale testresultater 23. oktober 2026:**

| Kontroll | Resultat |
|---|---|
| `npm run typecheck` | Bestått |
| `npm test` | 429 bestått i 22 testfiler, 0 feil (29 nye økonomiregresjoner) |
| `npm run build` | Bestått; eksisterende advarsler om pakkestørrelse og tredjepartskommentarer |
| `npm run test:e2e -- --config .cloud.local/playwright.config.ts --workers 1 --output .cloud.local/verified-results` | 61 bestått, 1 eksisterende mobiltest hoppet over, 0 feil |
| Visuell kontroll | Maksbudvisning på PC (1440 px) og mobil (393 px), uten avkuttet innhold |

Første samlede nettleserkjøring med to arbeidere fikk én `ERR_ABORTED` ved omlasting i en eksisterende kontotest (60 bestått, 1 hoppet over). De berørte kontotestene bestod deretter tre isolerte gjentakelser (6 testkjøringer totalt). En helt ny samlet kjøring med én arbeider bestod som vist over. Ingen assertions eller eksisterende kontokode ble endret for denne navigasjonsfeilen. GitHub Actions etter push er ikke verifisert av disse lokale testene.

**Endrede filer i denne pakken:**

- Beregning og lagring: `src/course/evaluate.ts`, `src/course/caseData.ts`, `src/course/progress.tsx`.
- Kursverktøy: `src/course/widgets/Calculator.tsx`, `MaxBidSummary.tsx` (ny), `Cases.tsx`, `Finish.tsx`.
- Økonomitekst: `src/course/content/m04-06.ts`, `m07-11.ts`, `finalQuiz.ts` og `src/course/glossary.ts`.
- Regresjoner: `src/course/economy.test.ts` (ny) og `e2e/kurs.spec.ts`.
- Dokumentasjon: `docs/kurs-v2.md` og `docs/scenarier-og-marked.md`.

**Vurdering:** Økonomidelen er klar til å overleveres til Claude for den avgrensede faglige og pedagogiske revisjonen. Dette er ikke en godkjenning for produksjonssetting; leveranse B–D og faglig kvalitetssikring av kilder gjenstår.
