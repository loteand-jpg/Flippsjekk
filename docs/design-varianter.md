# Designvarianter

Flippsjekk har flere visuelle varianter oppå **samme** produktlogikk. Denne siden beskriver hvordan det er bygget, hvordan dagens versjon hentes tilbake, og hvordan en ny variant legges til.

## Gjenopprette dagens versjon (Original)

| Hva | Hvor |
| --- | --- |
| Baseline-tag (aldri flytt) | `pre-design-baseline` (annotert tag, peker på `8b138b9`, siste commit før designarbeidet) |
| Original-varianten | `main` (uendret) |
| Finance-varianten | gren `design-finance`, permanent restore-tag `design-finance-v1` (annotert, peker på `2cc9015`) |
| Investment-varianten | gren `design-investment` (bygger på Finance-headen og inneholder Original, Finance og Investment) |

```bash
git checkout pre-design-baseline          # nøyaktig slik det var før designarbeidet
git switch -c gjenopprett-original pre-design-baseline   # eller start en ny gren derfra
git checkout design-finance-v1                           # ferdig Finance, uavhengig av Investment
git checkout design-investment                           # Original + Finance + Investment
```

Designgrener merges ikke til `main` uten en egen beslutning. Slett aldri `main`, taggen eller andre designgrener.

## Åpne variantene

| Adresse | Viser |
| --- | --- |
| `#/design` | Designgalleri (Original, Finance og «kommer senere» for Investment og Property) |
| `#/design/original` | Sender til Original (`#/`) |
| `#/design/finance` | Finance (alle sider ligger under dette prefikset, f.eks. `#/design/finance/objekter/<id>`) |
| `#/design/investment` | Investment (alle sider under prefikset, f.eks. `#/design/investment/objekter/<id>?fane=kalkyle`) |
| `#/design/property` | «Kommer senere» |

Hash-ruting gjør at direkte åpning og oppdatering av siden virker også på GitHub Pages. «Designforslag»-lenken i demolinjen (kun demomodus) og i Finance fører til galleriet.

## Arkitektur

**Delt (ingen kopier):** presentasjonshjelpere i `src/design/shared` (`present.ts`, `riskView.ts`, `useRiskDimensions.ts`), domenemodell, `src/calc` (kalkylemotor, markedsvekting, rangering), tjenester (`src/services`), datalag, auth/abonnement/kvoter, private/felles data, agentkontrakt, formattering (`src/lib/format.ts`) og alle sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import).

**Per variant:** layout, presentasjon, rutertre og designtokens.

- `src/design/variants.ts` – register over varianter (`VARIANTS`), `routingVariantFromHash`, `variantHref`.
- `src/design/routerRegistry.ts` – hver variant har sin egen ruter; bare én er aktiv. Ruterne opprettes ved første bruk og kastes ved variantbytte.
- `src/App.tsx` – `RoutedApp` velger rutertre ut fra adressen. Finance lastes lazy, så Original ikke blir tyngre av den.
- **`basename` per variant.** Finance bruker `createHashRouter(routes, { basename: '/design/finance' })`. Delte sider bruker absolutte stier (`<Link to="/oversikt">`, `navigate('/objekter/…')`), og de havner dermed automatisk inne i Finance uten at kallstedene er endret.
- **Visningsspor på objektsiden.** `PropertyPage` eier alle data, tilstand og dialoger og kan få en `view`-komponent (`PropertyViewProps`). Uten `view` (Original) er DOM-en identisk med før. Finance sender inn `FinanceProperty`.
- **Tokens via CSS-variabler.** Tailwind v4 eksponerer fargene som CSS-variabler. `.fin { --color-pine-*: marineblå; --color-slate-*: varm grå; … }` i `src/design/finance/finance.css` gir delte komponenter Finance-utseende uten kopiering. Finance-egne tokens: `--fin-line`, `--fin-pos/neg/warn/info`.
- **Presentasjon regner ingenting.** `src/design/finance/present.ts` og `riskView.ts` formulerer eksisterende tall (maksbudgrense, timesats, egenkapitalgap, risikodimensjoner) som tekst og tone.

Samme input gir samme økonomi i alle varianter. E2E-testen i `e2e/design.spec.ts` sammenligner maksbud og fortjeneste mellom Original og Finance.

## Finance: viktigste grep

- **Beslutningen først** på objektsiden: anbefalt maksbud (stort, avrundet ned til hele tusen som i Original) med én setning om hva som begrenser det, forventet salgsverdi, kostnad, fortjeneste, prosjektavkastning, kr per egeninnsatstime, egenkapitalbehov, risiko, datagrunnlag, salgsverdiens sikkerhet og beste scenario.
- **Scenariosammenligning** (Basis / Alt A / Alt B) som tabell på desktop og kompakte, sammenleggbare kort på mobil.
- **Gruppert kalkulator** (Kjøp, Oppussing, Finansiering, Salg, Mål og budplan) med opprinnelsesmerke («Din verdi», «Fra annonsen», «Modellregel» …) og tilbakestilling per felt.
- **Marked** med primære, sekundære og aktive referanser og forklaring på hvorfor hver referanse er relevant.
- **Risiko** i seks rolige dimensjoner: teknisk, kostnad, tid, myndighet/godkjenning, marked og dokumentasjon. Hver forklarer hva, hvorfor og hva som bør avklares; nivå står som tekst, ikke bare farge.
- **Objektliste** som tabell på desktop og kompakte kort på mobil. Ukjent vises som «Mangler grunnlag» eller «Ikke avklart», aldri som 0.
- Tall bruker tabellsiffer (`.fin-fig`), og lange, negative og ukjente verdier er håndtert (minustegn U+2212, ingen overlapp ned til 320 px).

## Investment: viktigste grep

Investment er et eget presentasjonslag med annen informasjonsarkitektur enn Finance: sidestolpe og mørk navigasjon, tett dashboard og diagrammer. Alle tall kommer fra kalkylemotoren; ingenting regnes på nytt i frontend utenom at motorens egen `computeCore` kalles med en annen kjøpspris (sensitivitet).

- **Mulighet først.** Objektsiden åpner med et mørkt *investeringscase*: anbefalt maksbud (stort), hva som begrenser det (alle maksbudgrenser på én akse), fortjeneste, prosjektavkastning, kr per egeninnsatstime, kapitalbehov, varighet, salgsverdi og utfallsspenn (oppside/nedside). Adresse og boligfakta er sekundære. På mobil kommer caset før status og bilde, så maksbudet alltid ligger i første skjermbilde.
- **Maksbudgrenser.** Fortjenestemål og timekrav avgjør anbefalt maksbud (laveste vinner). Avkastning 15 % / 20 % fra motorens maksbudtabell vises kun som «til informasjon» og inngår ikke i anbefalingen.
- **Case-scorecard** (`model/scorecard.ts`): Økonomi, Markedsgrunnlag, Gjennomførbarhet, Kapitalbehov, Risiko og Arbeidsintensitet. Hver vurdering har nivå som tekst og ikon, stolpemåler, «hvorfor» med tallene den bygger på og en åpnebar regel. Grensene står samlet i `SCORE_RULES` og er enhetstestet. Ukjent er «uavklart», aldri «middels» eller «lav».
- **Scenarioer som delta** (`model/delta.ts`): tabell med verdier side om side og endring mot basis under hvert tall, pluss «hva får jeg igjen?» per alternativ som en regnskapsoppdeling av endringen i fortjeneste (salgsverdi, oppussing, renter og drift, kjøpspris/kjøpskostnader, salgskostnader). Linjene summerer alltid til netto. Når kalkylene bruker ulik kjøpspris (privat overstyring i basis, grunnlaget i alternativet) står det eksplisitt.
- **Sensitivitet mot kjøpspris:** glideren er en forhåndsvisning. Hvert punkt regnes av motoren (`computeCore`), alle andre forutsetninger er uendret, og ingenting lagres før «Bruk i kalkylen» (ulagret privat endring, som å skrive i feltet).
- **Hva driver caset?** (`model/drivers.ts`): faktapunkter fra scenario, kalkyle, marked, risiko og datagrunnlag – ingen fritekst fra AI.
- **Pipeline:** KPI-bånd (aktive case, samlet egenkapitalbehov, snitt prosjektavkastning, høyeste fortjeneste, neste visninger – bare utledet av objekter med komplett kalkyle), tabell på ≥ 1280 px med små stolper, kort under.
- **Marked:** oversikt (normalverdi, spenn, sikkerhet, konkurranse), referanser på akse (kr/m²) med form (sirkel/firkant/trekant) som bærer rollen, og referanser med begrunnelse. Aktive annonser er merket «Ikke faktisk salgspris». Markedstrend vises ikke (finnes ikke i grunnlaget). Egenkapitalavkastning vises ikke: motoren definerer bare prosjektavkastning.
- **Risiko som nedside:** base, downside (salgspris −10 %) og stress (kombinert) fra motorens stresstester, og seks dimensjoner.
- **Kalkulator:** sammenleggbare grupper, sticky levende resultat på desktop, slank resultatstripe på mobil.

### Diagrammer

Alle diagrammer er tegnet i ren SVG/HTML i `src/design/investment/charts` (ingen diagrambibliotek): kostnadsfordeling (stablet mot salgsverdi), maksbudgrenser, utfallsspenn, nullsentrerte stolper (delta og stress), sensitivitet (linje med markører for kjøpspris, maksbud og forhåndsvisning) og referanser på akse. Hvert diagram har tallene som synlig tekst og en «Vis som tall»-tabell; punkter i referanseplottet kan velges med tastatur. Fargene er den validerte kategoriske paletten fra datavisualiseringsmetoden (fast rekkefølge, validert i lys og mørk modus) med sekundær koding (tekst, form, mellomrom).

### Animasjon og biblioteker (Investment)

- **GSAP: ikke brukt.** Tall som endres (maksbud, fortjeneste m.m.) animeres med en egen liten `CountUp` (requestAnimationFrame, ca. 1 kB) og et lysglimt via CSS. Det dekker «animasjon skal forklare endring» uten 70 kB bibliotek. Første visning er alltid det endelige tallet; animasjon skjer bare når verdien endres. `prefers-reduced-motion` hopper over alt, og dette er testet.
- **Lenis: ikke brukt.** Appen er et dashboard med vanlig rulling; Lenis ville ikke gitt en klart bedre presentasjon og ville svekket native rulling på mobil.
- **React Bits: ikke brukt** (ingen kode kopiert; `CountUp` er skrevet fra bunnen). Ingen partikler, aurora eller lignende.
- **Nye avhengigheter: ingen.** `package.json` er uendret.

### Delte endringer for å støtte Investment

- `riskView.ts`, `present.ts` (og en ny `useRiskDimensions`-hook) flyttet fra `src/design/finance` til `src/design/shared`. Finance importerer derfra og re-eksporterer `present`; ingen visuell endring (bekreftet med skjermbildesammenligning av Original og Finance).
- `variants.ts`: `RoutingVariant` og `routingVariantFromHash` utvidet med `investment`.
- `App.tsx`: lazy `InvestmentApp` og tredje gren i `RoutedApp`.
- `DesignGallery.tsx`: Investment er tilgjengelig; footeren nevner tagger og grener.

### Tilgjengelighet og kontroll (Investment)

- **Kontrast (automatisk, i e2e):** alle synlige tekstnoder på forside, pipeline, objektside og fanene Kalkyle, Marked og Risiko måles mot effektiv bakgrunn (WCAG AA: 4,5:1, 3:1 for stor tekst). Mørke flater med gradient måles mot den lyseste gradientfargen (verste tilfelle). Testen feilet først på `text-slate-500` (4,12:1), som er byttet til `slate-600`.
- **axe-core (manuelt):** kjørt mot forside, pipeline, objektside og alle faner på desktop og mobil (WCAG 2.0/2.1/2.2 A/AA og beste praksis). Gjenstående funn: `region` (demostripen øverst ligger utenfor landemerke – delt kode, lik i Original), og en forbigående `target-size` der den klebrige resultatstripen på mobil delvis dekker en gruppeoverskrift mens du ruller. Rullbare tabeller i delte blokker får tabindex/rolle/navn via `useScrollableAccess`.
- **Tastatur og skjermleser:** faner med piltaster/Home/End, glideren, referansepunktene (Tab + lesefelt med `aria-live`), «Vis som tall» for alle diagrammer, `aria-label` på alle diagrammer, statuser som tekst og ikon.
- **Berøringsflater:** ≥ 44 px på mobil (testet), ≥ 24 px overalt.

## Legge til en ny variant (f.eks. Property)

1. Legg varianten i `VARIANTS` i `src/design/variants.ts` (sett `status: 'available'`) og utvid `RoutingVariant`/`routingVariantFromHash` med et eget prefiks (`/design/investment`).
2. Lag `src/design/<variant>/<Variant>App.tsx` med eget rutertre og `basename`, og last den lazy i `App.tsx` som Finance.
3. Lag layout og, om ønskelig, en `view` for objektsiden. Bruk `PropertyViewProps` – ikke kopier data- eller kalkylelogikk.
4. Definer tokens som CSS-variabler under en egen klasse (som `.fin`), og gjenbruk delte komponenter.
5. Bruk vanlige `<a href="#/design/…">`-lenker mellom varianter (ikke `<Link>`), siden hver variant har sin egen ruter.
6. Legg til e2e-tester i samme stil som `e2e/design.spec.ts`, inkludert paritet mot Original.

## Biblioteker og animasjon

Ingen nye avhengigheter er lagt til (verken for Finance eller Investment). GSAP, Lenis og React Bits er **ikke** brukt. Finance er bevisst rolig, og CSS-overganger (kun chevron-rotasjon og fokus/hover) dekker behovet; Investment bruker en egen liten `CountUp` (se over). Bevegelse slås av med `prefers-reduced-motion`. Skulle et bibliotek bli aktuelt, skal det lastes lazy inne i varianten og aldri påvirke Original.

### Bundlestørrelse (produksjonsbygg, kB, gzip i parentes)

| | Hovedbunt JS | Hovedstilark CSS | Lazy variantbunt |
| --- | --- | --- | --- |
| `pre-design-baseline` | 767,96 (221,66) | 53,89 (10,04) | – |
| `design-finance-v1` | 777,65 (224,49) | 64,42 (11,51) | Finance 89,85 (25,57) + 2,07 CSS |
| `design-investment` | 778,47 (224,82) | 79,59 (13,71) | Finance 84,86 (23,87) + 2,07 CSS, Investment 145,19 (41,12) + 3,67 CSS, delt chunk 5,42 (2,33) |

Merk: Tailwind v4 genererer ett felles stilark for hele appen, så utility-klassene Investment bruker ligger i hovedstilarket (ca. +15 kB rå / +2,2 kB gzip mot Finance) selv om komponentene lastes lazy. JS for Investment og Finance lastes først når variantene åpnes. Hovedbunten for JS vokste bare ca. 0,8 kB (gzip 0,3 kB) fra Finance.

## Kjente begrensninger

- Datamodellen har ingen annonsebilder eller plantegninger, og demoen leser ikke fra FINN. Finance viser derfor en tydelig merket **illustrasjon** av bolig der bildet og plantegningen skal sitte. Plassen er reservert og byttes ut når bilder hentes.
- Sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import) gjenbrukes med Finance- og Investment-farger og -typografi, men beholder Originals oppbygging.
- Finance: «Detaljert kalkyle» (åpnet) har tabeller fra Original som kan bli bredere enn 360 px; Investment løser det med rullbare tabeller, Finance er uendret.
- Investment: kr/time og EK-behov kan ikke sorteres i pipeline-tabellen (delt sorteringsmodell har ikke nøklene), og markedstrend/egenkapitalavkastning vises ikke fordi grunnlaget mangler.
- Fanene Kalkyle, Oppussing, Marked og Risiko i Finance gjenbruker delte blokker (f.eks. oppussingstiltak og tre-verdi-tabellen) under Finance-tokens; tre-verdi-tabellen i Marked kan scrolle sideveis i smal visning.
