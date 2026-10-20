# Designvarianter

Flippsjekk har flere visuelle varianter oppå **samme** produktlogikk. Denne siden beskriver hvordan det er bygget, hvordan dagens versjon hentes tilbake, og hvordan en ny variant legges til.

## Gjenopprette dagens versjon (Original)

| Hva | Hvor |
| --- | --- |
| Baseline-tag (aldri flytt) | `pre-design-baseline` (annotert tag, peker på `8b138b9`, siste commit før designarbeidet) |
| Original-varianten | `main` (uendret) |
| Finance-varianten | gren `design-finance` |

```bash
git checkout pre-design-baseline          # nøyaktig slik det var før designarbeidet
git switch -c gjenopprett-original pre-design-baseline   # eller start en ny gren derfra
```

Designgrener merges ikke til `main` uten en egen beslutning. Slett aldri `main`, taggen eller andre designgrener.

## Åpne variantene

| Adresse | Viser |
| --- | --- |
| `#/design` | Designgalleri (Original, Finance og «kommer senere» for Investment og Property) |
| `#/design/original` | Sender til Original (`#/`) |
| `#/design/finance` | Finance (alle sider ligger under dette prefikset, f.eks. `#/design/finance/objekter/<id>`) |
| `#/design/investment`, `#/design/property` | «Kommer senere» |

Hash-ruting gjør at direkte åpning og oppdatering av siden virker også på GitHub Pages. «Designforslag»-lenken i demolinjen (kun demomodus) og i Finance fører til galleriet.

## Arkitektur

**Delt (ingen kopier):** domenemodell, `src/calc` (kalkylemotor, markedsvekting, rangering), tjenester (`src/services`), datalag, auth/abonnement/kvoter, private/felles data, agentkontrakt, formattering (`src/lib/format.ts`) og alle sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import).

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

## Legge til en ny variant (f.eks. Investment)

1. Legg varianten i `VARIANTS` i `src/design/variants.ts` (sett `status: 'available'`) og utvid `RoutingVariant`/`routingVariantFromHash` med et eget prefiks (`/design/investment`).
2. Lag `src/design/<variant>/<Variant>App.tsx` med eget rutertre og `basename`, og last den lazy i `App.tsx` som Finance.
3. Lag layout og, om ønskelig, en `view` for objektsiden. Bruk `PropertyViewProps` – ikke kopier data- eller kalkylelogikk.
4. Definer tokens som CSS-variabler under en egen klasse (som `.fin`), og gjenbruk delte komponenter.
5. Bruk vanlige `<a href="#/design/…">`-lenker mellom varianter (ikke `<Link>`), siden hver variant har sin egen ruter.
6. Legg til e2e-tester i samme stil som `e2e/design.spec.ts`, inkludert paritet mot Original.

## Biblioteker og animasjon

Ingen nye avhengigheter er lagt til. GSAP, Lenis og React Bits er **ikke** brukt: Finance er bevisst rolig, og CSS-overganger (kun chevron-rotasjon og fokus/hover) dekker behovet. Bevegelse slås av med `prefers-reduced-motion`. Skulle et bibliotek bli aktuelt, skal det lastes lazy inne i varianten og aldri påvirke Original.

## Kjente begrensninger

- Datamodellen har ingen annonsebilder eller plantegninger, og demoen leser ikke fra FINN. Finance viser derfor en tydelig merket **illustrasjon** av bolig der bildet og plantegningen skal sitte. Plassen er reservert og byttes ut når bilder hentes.
- Sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import) gjenbrukes med Finance-farger og -typografi, men beholder Originals oppbygging.
- Fanene Kalkyle, Oppussing, Marked og Risiko i Finance gjenbruker delte blokker (f.eks. oppussingstiltak og tre-verdi-tabellen) under Finance-tokens; tre-verdi-tabellen i Marked kan scrolle sideveis i smal visning.
