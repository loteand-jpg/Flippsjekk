# Kursversjon 2 – forbedring og trygg innføring

**Status 22. oktober 2026:** Under arbeid på grenen `kurs-v2`. `main` og dagens kurs er referanse og skal ikke erstattes før faglig, teknisk og kommersiell godkjenning.

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

**Neste prioritet:** Fullfør leveranse A og kjør automatisk og manuell faglig kontroll. Deretter leveranse B og C før lanseringsarbeid D.
