# Designvarianter

Flippsjekk har flere visuelle varianter oppå **samme** produktlogikk. Denne siden beskriver hvordan det er bygget, hvordan dagens versjon hentes tilbake, og hvordan en ny variant legges til.

## Gjenopprette dagens versjon (Original)

| Hva | Hvor |
| --- | --- |
| Baseline-tag (aldri flytt) | `pre-design-baseline` (annotert tag, peker på `8b138b9`, siste commit før designarbeidet) |
| Original-varianten | `main` (uendret) |
| Finance-varianten | gren `design-finance`, permanent restore-tag `design-finance-v1` (annotert, peker på `2cc9015`) |
| Investment-varianten | gren `design-investment` (bygger på Finance-headen og inneholder Original, Finance og Investment), permanente restore-tagger `design-investment-v1` (`44d6cd2`) og `design-investment-v2` (`cc745d4`, etter felles scenario-, fellesgjelds- og statusrettelser) |
| Property-varianten | gren `design-property` (bygger på `design-investment-v2` og inneholder alle fire variantene) |

```bash
git checkout pre-design-baseline          # nøyaktig slik det var før designarbeidet
git switch -c gjenopprett-original pre-design-baseline   # eller start en ny gren derfra
git checkout design-finance-v1                           # ferdig Finance, uavhengig av Investment
git checkout design-investment-v2                        # ferdig Investment (med delte rettelser), uavhengig av Property
git checkout design-property                             # Original + Finance + Investment + Property
```

Designgrener merges ikke til `main` uten en egen beslutning (**Property merges ikke til `main`**). Slett aldri `main`, taggene eller andre designgrener.

## Åpne variantene

| Adresse | Viser |
| --- | --- |
| `#/design` | Designgalleri (alle fire: Original, Finance, Investment og Property) |
| `#/design/original` | Sender til Original (`#/`) |
| `#/design/finance` | Finance (alle sider ligger under dette prefikset, f.eks. `#/design/finance/objekter/<id>`) |
| `#/design/investment` | Investment (alle sider under prefikset, f.eks. `#/design/investment/objekter/<id>?fane=kalkyle`) |
| `#/design/property` | Property (alle sider under prefikset, f.eks. `#/design/property/oversikt` og `#/design/property/objekter/<id>?fane=kalkyle`) |

Hash-ruting gjør at direkte åpning og oppdatering av siden virker også på GitHub Pages. «Designforslag»-lenken i demolinjen (kun demomodus) og i Finance fører til galleriet.

## Arkitektur

**Delt (ingen kopier):** presentasjonshjelpere i `src/design/shared` (`present.ts`, `riskView.ts`, `useRiskDimensions.ts`, `caseModel.ts` for pris- og maksbudmodellen, `scenarioDelta.ts`, `signed.ts`, `useMarketFacts.ts`, `hooks.ts` og `CountUp.tsx`), domenemodell, `src/calc` (kalkylemotor, markedsvekting, rangering), tjenester (`src/services`), datalag, auth/abonnement/kvoter, private/felles data, agentkontrakt, formattering (`src/lib/format.ts`) og alle sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import).

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

## Property: viktigste grep

Property svarer på «Hva kan denne boligen bli, hva må gjøres, og er transformasjonen verdt investeringen?» Uttrykket er redaksjonelt og varmt: off-white/sand/kalkstein som flater, mørk brun-grå som blekk, dempet grønn som primærfarge og arkitektblå som aksent for plan og informasjon. Overskrifter står i systemets serif-skrift (ingen nedlastede fonter), tall i tabulær sans. Alle tokens ligger i `src/design/property/prop.css` under `.prop`.

- **Boligen først.** Første skjermbilde har adresse, fakta, hovedbilde (eller plassholder), tilgang til plantegning og «Muligheten»: anbefalt versjon, anbefalt maksbud, forventet salgsverdi, fortjeneste, risiko og prosjektavkastning. På mobil står boligen kompakt øverst og muligheten rett under; maksbud og fortjeneste ligger i tillegg i en fast stripe nederst.
- **Tre versjoner av boligen.** Basis, Alternativ A og Alternativ B vises som tre kort (ARIA-faner med piltaster). Å velge en versjon er en *forhåndsvisning*: hero, «fra → til», oppussing, økonomi, marked, salg og risiko følger med, men kalkylen din endres først med «Bruk i kalkylen». Deltaet mot Basis (ekstra oppussing, egne timer, tid, salgsverdi, fortjeneste og risiko) er differansen mellom to motorresultater (`scenarioDelta`) fra den delte scenariosammenligningen: samme kjøpspris, finansiering, egenkapital, mål, timekrav og oppgjørstid for alle tre.
- **Fra dette → til dette.** Boligen i dag (annonsens fakta, risikoer registrert i analysen merket «dokumentert» eller «antatt», oppussingsbehov) mot sluttproduktet (soverom, sluttstandard, kjøkken/bad, planløsning, viktigste tiltak og forventet salgsverdi). Ingen bilder før/etter, ingen oppdiktede rom; mangler data står det «ikke avklart».
- **Oppussing etter rom, arbeidstype og mulig rekkefølge.** Alt fra `RenovationItem` og motorens `itemEconomics`; summene stemmer med `renovationTotals` (testet for alle seed-scenarioer). «Mulig rekkefølge» er arbeidstypene i veiledende rekkefølge og er tydelig *ikke* en tidsplan – ingen varighet anslås per steg.
- **Prosjektøkonomi som fast sidestolpe** (desktop) eller stripe som kan foldes ut (mobil): kjøpspris, oppussing, samlet kostnad, salgsverdi, fortjeneste, avkastning, kr per egeninnsatstime, maksbud og egenkapitalbehov. Stripen ligger over bunnmenyen og siden har ekstra bunnmarg, så den aldri dekker innhold (testet).
- **«Hvor høyt kan du gå?»** viser maksbudet, grensene (fortjenestemål og timekrav, laveste vinner) og resultatet ved akkurat det budet, regnet av motorens `computeCore` med bare kjøpsprisen byttet.
- **Marked som boligkort** (adresse, solgt/aktiv, størrelse, soverom, standard, pris, kr/m², match og hvorfor referansen er relevant), primærreferanser først. Aktive annonser er merket «Aktiv annonse – ikke oppnådd salgspris».
- **«Slik kan den selges»**: standard, soverom, kvaliteter, markedsgrunnlag og lavt/normalt/høyt utfall. Språket er «modellert», «forventet» og «anslått» (testet mot «vil selges for», «sikker gevinst» og ikke-negert «garantert»). Målgruppe finnes ikke i datamodellen og vises som «Ikke angitt i analysen».
- **Risiko knyttet til boligen** (bad, planløsning og godkjenning, kjøkken, elektrisk, vann, tak/fasade, fukt, marked) bare der analysen støtter koblingen (risikokategori, scenarioets bad-/kjøkkenendring, krav og godkjenningsrisiko). Ellers vises kun de seks delte risikodimensjonene. Under dem: «Hva vet vi? Hva antar vi? Hva må sjekkes?» fra fakta, sjekkliste, antakelser og usikkerheter.
- **«Ta med på visning»**: huskeliste fra risikoenes tiltak, sjekklistepunkter som mangler dokumentasjon og krav til versjonen. Avkryssing lagres kun i nettleseren (med try/catch).
- **Detaljer og redigering** nederst: Min kalkyle (lagre, nytt navn, tilbakestill), og fanene Oversikt, Kalkyle, Oppussing, Risiko og sjekkliste, Marked, Rapport og kilder, Visninger og bud – de delte komponentene under Property-tokens.
- **Fellesgjeld ved salg** vises med den delte `saleDebtStatuses` (samme tittel, forklaring og alvorlighet som i de tre andre variantene) både over maksbudet i hero og som merknad i sidestolpen.
- **Forside** («Se potensialet før du byr») har FINN-feltet og et eksempel «fra dette → til dette» regnet av samme motor på demoobjektet Elvekanten 17 B, tydelig merket «Eksempel · demodata». **Boligliste:** tabell med plassholder, adresse, type, sluttprodukt i kalkylen, salgsverdi, fortjeneste, maksbud, risiko og visning på desktop, store kort på mobil.

### Bilder og plantegninger (medielag)

Datamodellen (`Property`, `PropertySnapshot`, `SharedAnalysis`) har ingen bilder, plantegninger eller dokumentbilder, og demoen leser ikke fra FINN. Property viser derfor **merkede plassholdere** («Annonsebilde kommer fra datakilden», «Plantegning ikke tilgjengelig i demo») – ingen bilder fra nettet, ingen realistisk plantegning og ingen genererte rom. Grensesnittet for ekte media ligger klart i `src/design/property/media`:

- `types.ts`: `ListingMedia { mainImage, images[], floorPlans[], documentImages[], rooms[] }` med `FloorPlanMedia` (dagens plan eller foreslått plan for et scenario), `DocumentImage` og `RoomInfo`.
- `useListingMedia(propertyId)`: eneste koblingspunkt. Returnerer i dag `EMPTY_MEDIA`; en datakilde kan returnere data her uten redesign og uten å endre domenemodellen.
- `Media.tsx`: `HeroMedia` (hovedbilde + miniatyrer, tastaturvennlige), `FloorPlanPanel` (rullbar og zoom-klar beholder med lenke til full størrelse; plan per scenario) og `DocumentImages`. Alle velger selv mellom ekte media og plassholder. Plassholderne har `role="img"` og tilgjengelig navn. Dekket av enhetstester (med og uten media).

### Animasjon og biblioteker (Property)

Ingen nye avhengigheter. **GSAP, Lenis og React Bits er ikke brukt**, etter en konkret vurdering:

- *GSAP* (målt: kjerne 72,9 kB rå / 28,4 kB gzip, pluss ScrollTrigger 44,6 / 18,0) ville nesten doblet Property-bunten (36,0 kB gzip). Det vi trenger – et rolig innsvev ved versjonsbytte, pilen i «fra → til», tall som glir mot ny verdi og toning av plantegning – dekkes av korte CSS-animasjoner (`prop-swap`, `prop-arrow`, `prop-fadein`, `prop-flash`) og den delte `CountUp` (requestAnimationFrame, ca. 1 kB). Ingen tidslinjer, ingen scrollkoblet animasjon.
- *Lenis* (18,8 kB rå / 5,4 kB gzip) ville gitt jevn rulling på en lang objektside, men også risiko for å bryte sticky-oppførsel, nettleserens ankerhopp, mobilens egen rulling og hash-ruteren, uten tydelig gevinst. Siden bruker vanlig rulling; innholdsfortegnelsen er knapper som kaller `scrollIntoView` (rolig kun uten «reduser bevegelse») og flytter fokus til overskriften.
- *React Bits* er en samling kopierbare komponenter, ikke et bibliotek. Ingen av dem (aurora, partikler, glitch, effekttekst osv.) passer en rolig, redaksjonell boligflate.
- Alle overganger er korte (≤ 0,9 s), reverserbare og slås av med `prefers-reduced-motion` (testet: ingen animasjon, ingen lysglimt, tall hopper rett til sluttverdi). Ingen scrolljacking (testet).

### Delte endringer for å støtte Property

Rene modeller som Investment allerede brukte er flyttet til `src/design/shared` så Property kan bruke dem uten å importere fra Investment: `caseModel.ts` (kostnadsfordeling, pris- og maksbudmodell, `atPurchasePrice`, `limitRows`), `scenarioDelta.ts`, `signed.ts`, `useMarketFacts.ts`, `hooks.ts` (`usePrefersReducedMotion`) og `CountUp.tsx` (variantens lysglimt sendes inn som `flashClass`). Investment har tynne re-eksporter på de gamle stedene, så koden der er uendret. Bevis: 28 lokale skjermbilder av Investment (desktop og mobil, alle faner) er pikselidentiske med `design-investment-v2`, og de lokale skjermbildene av Original (32) og Finance (28) er uendret.

### Tilgjengelighet og kontroll (Property)

- **Kontrast (automatisk, i e2e):** all synlig tekst på forside, liste, objektside (også Alt B) og fanene Kalkyle, Marked og Risiko måles mot effektiv bakgrunn (WCAG AA). Mørk «tittelblokk» er heldekkende (13,4:1 for hovedtekst).
- **axe-core (manuelt):** forside, liste, objektside (også Alt B, åpne tiltak) og alle syv faner på desktop og mobil. Eneste gjenstående funn er `region` (demostripen øverst ligger utenfor landemerke – delt kode, lik i Original). Funn underveis som er rettet: `dl` med ugyldige barn, `aria-controls` med mellomrom i id, `role=region` på `<nav>`, og målstørrelse < 24 px på sammenleggbare overskrifter og frittstående lenker i delte faner.
- **Tastatur:** versjonsvelgeren (piltaster, Home, End), moduser for oppussing, innholdsfortegnelse (flytter fokus til overskriften), alle avkrysninger og faner. Statuser står som tekst og ikon.
- **Berøringsflater:** ≥ 44 px på mobil for knapper, faner, versjoner og avkrysning (testet).
- **Overflow:** ingen sideveis rulling ned til 320 px (forside, liste, objektside, alle faner, utfoldet stripe, begge status for fellesgjeld). Edge-tilfeller kjørt manuelt ved å endre mockdatabasen: negativ fortjeneste, manglende salgsverdi, ett scenario, 25+ tiltak med lange rom- og tiltaksnavn, ukjent og umulig fellesgjeld, ingen risikoer, lav dokumentasjon, 18 risikoer, 24 referanser, store beløp, svært lang adresse, finansieringsgap og ingen egne timer.

## Legge til en ny variant

1. Legg varianten i `VARIANTS` i `src/design/variants.ts` (sett `status: 'available'`) og utvid `RoutingVariant`/`routingVariantFromHash` med et eget prefiks (som `/design/property`).
2. Lag `src/design/<variant>/<Variant>App.tsx` med eget rutertre og `basename`, og last den lazy i `App.tsx` som Finance.
3. Lag layout og, om ønskelig, en `view` for objektsiden. Bruk `PropertyViewProps` – ikke kopier data- eller kalkylelogikk.
4. Definer tokens som CSS-variabler under en egen klasse (som `.fin`), og gjenbruk delte komponenter.
5. Bruk vanlige `<a href="#/design/…">`-lenker mellom varianter (ikke `<Link>`), siden hver variant har sin egen ruter.
6. Legg til e2e-tester i samme stil som `e2e/design.spec.ts`, inkludert paritet mot Original.

## Biblioteker og animasjon

Ingen nye avhengigheter er lagt til (verken for Finance, Investment eller Property). GSAP, Lenis og React Bits er **ikke** brukt (Propertys vurdering står under «Animasjon og biblioteker (Property)»). Finance er bevisst rolig, og CSS-overganger (kun chevron-rotasjon og fokus/hover) dekker behovet; Investment bruker en egen liten `CountUp` (se over). Bevegelse slås av med `prefers-reduced-motion`. Skulle et bibliotek bli aktuelt, skal det lastes lazy inne i varianten og aldri påvirke Original.

### Bundlestørrelse (produksjonsbygg, kB, gzip i parentes)

| | Hovedbunt JS | Hovedstilark CSS | Lazy variantbunt |
| --- | --- | --- | --- |
| `pre-design-baseline` | 767,96 (221,66) | 53,89 (10,04) | – |
| `design-finance-v1` | 777,65 (224,49) | 64,42 (11,51) | Finance 89,85 (25,57) + 2,07 CSS |
| `design-investment` | 778,47 (224,82) | 79,59 (13,71) | Finance 84,86 (23,87) + 2,07 CSS, Investment 145,19 (41,12) + 3,67 CSS, delt chunk 5,42 (2,33) |
| `design-investment-v2` (målt på nytt) | 785,91 (227,19) | 80,15 (13,76) | Finance 86,05 (24,18) + 2,07 CSS, Investment 146,72 (41,56) + 3,70 CSS, delt chunk 5,42 (2,33) |
| `design-property` | 786,46 (227,54) | 93,66 (15,74) | Finance 86,09 (24,19) + 2,07 CSS, Investment 141,77 (39,72) + 3,70 CSS, **Property 132,55 (35,96) + 4,84 CSS**, delte chunks 5,32 (2,40) + 4,75 (2,07) + 0,76 (0,44) |

Merk: Tailwind v4 genererer ett felles stilark for hele appen, så utility-klassene Investment bruker ligger i hovedstilarket (ca. +15 kB rå / +2,2 kB gzip mot Finance) selv om komponentene lastes lazy. JS for Investment og Finance lastes først når variantene åpnes. Hovedbunten for JS vokste bare ca. 0,8 kB (gzip 0,3 kB) fra Finance.

Effekten av Property: JS i hovedbunten +0,55 kB (gzip +0,35 kB) mot `design-investment-v2` (lazy rute, galleri og variantregister); Property-bunten (132,55 kB, 35,96 kB gzip) og dens stilark (4,84 kB) lastes først på `#/design/property`. Hovedstilarket vokser med 13,5 kB rå / 2,0 kB gzip fordi Tailwind-klassene Property bruker havner i det felles stilarket. Delte modeller (scenariodelta, risikovisning) ligger i egne små chunks som både Investment og Property bruker; Investment-bunten ble 5 kB mindre. Ingen av de andre variantene laster GSAP, Lenis eller noe fra Property.

## Kjente begrensninger

- Datamodellen har ingen annonsebilder eller plantegninger, og demoen leser ikke fra FINN. Finance og Investment viser derfor en tydelig merket **illustrasjon** av bolig der bildet og plantegningen skal sitte; Property har merkede plassholdere og et ferdig medielag (se over). Plassen er reservert og byttes ut når bilder hentes.
- Sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import) gjenbrukes med Finance- og Investment-farger og -typografi, men beholder Originals oppbygging.
- Finance: «Detaljert kalkyle» (åpnet) har tabeller fra Original som kan bli bredere enn 360 px; Investment løser det med rullbare tabeller, Finance er uendret.
- Investment: kr/time og EK-behov kan ikke sorteres i pipeline-tabellen (delt sorteringsmodell har ikke nøklene), og markedstrend/egenkapitalavkastning vises ikke fordi grunnlaget mangler.
- Fanene Kalkyle, Oppussing, Marked og Risiko i Finance gjenbruker delte blokker (f.eks. oppussingstiltak og tre-verdi-tabellen) under Finance-tokens; tre-verdi-tabellen i Marked kan scrolle sideveis i smal visning.
- Property: «Standard i dag» finnes ikke som egen klasse i analysen (bare sluttstandard), og målgruppe for salg finnes ikke i datamodellen – begge vises som «ikke avklart/angitt». Rekkefølgen i «Mulig rekkefølge» er veiledende og bygger på arbeidstype, ikke på en tidsplan fra analysen. Delte faner (Kalkyle, Marked, Rapport) beholder Originals oppbygging under Property-tokens; tabeller i dem ruller sideveis på smale skjermer.
- Property: stripen for prosjektøkonomi på mobil ligger alltid synlig over bunnmenyen. Siden har ekstra bunnmarg, så den dekker aldri innhold når den er lukket; foldet ut dekker den bevisst en del av skjermen (maks 58 % av høyden) til du lukker den med samme knapp. Dialoger (f.eks. «Analyser bolig») ligger i nettleserens topplag og dekker stripen.
