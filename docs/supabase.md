# Supabase – backend (fase 1: databasegrunnmur, fase 2A: Auth og profil)

Denne siden beskriver backend som ligger i repoet: databasegrunnmuren (fase 1: migrasjoner, RLS, tester, klientgrunnlag) og Auth + profil (fase 2A: `SupabaseAuthService` og `SupabaseProfileService`). **Fase 1 er live-verifisert av ChatGPT og merget til `main`** (restore-tag `backend-foundation-v1`). **Fase 2A er implementert på branch `backend-supabase-auth` og e-post-OTP + profil er live-verifisert mot utviklingsprosjektet 24. oktober 2026**: ny bruker, 6-sifret OTP via egen SMTP, profiltrigger, lesing/oppdatering av egen profil, oppfrisking, utlogging, ny innlogging og vedvarende sesjon i samme nettleser er bekreftet. **Google OAuth er fortsatt ikke live-verifisert.** Demoen bruker fortsatt mocktjenestene uendret. I produksjonsmodus (`VITE_FLIPPROM_MODE=production`) brukes ekte Supabase Auth og profil; alle andre tjenester er eksplisitt «ikke koblet til».

## Status i ett blikk

| | Status |
|---|---|
| Skjema, constraints, indekser (15 tabeller) | 6 migrasjoner + migrasjon 7 (eksplisitte `service_role`-rettigheter), alle anvendt i utviklingsprosjektet av ChatGPT (rapportert; Claude har ikke selv sett det). Migrasjon 8 (REVOKE før GRANT for `service_role`, deny-by-default for nye tabeller) er skrevet som korrigering etter at live-matrisen ga 202/204 og er **ikke anvendt ennå** |
| RLS og eksplisitte rettigheter | Skrevet; 37 policyer; RLS på alle tabeller |
| SQL-testmatrise (bruker A mot B m.m.) | `supabase/tests/rls_matrix.sql`, 223 sjekker – lokalt kjørt mot PGlite (PostgreSQL 18 i WASM). ChatGPT rapporterte 202/204 for den forrige versjonen mot migrasjon 1–7 live (feil: `0.8` og `8.20`, se «Rettigheter»). **Migrasjon 8 og den utvidede matrisen (223) er ikke kjørt mot Supabase ennå** |
| Statiske SQL-kontroller og skjema-mot-Zod-sjekk | Kjører i `npm test` |
| Supabase-klientgrunnlag (`@supabase/supabase-js` 2.118.0) | Konfigurasjon og lat klientfabrikk; brukes nå av Auth- og profiltjenestene (fase 2A) |
| Backend fase 1 (migrasjon 1–8, 15 tabeller, 37 policyer, matrise 223/223, Security Advisor 0 funn) | **Live-verifisert av ChatGPT og merget til `main`** (rapportert; Claude har ikke selv sett det) |
| Backend fase 2A: `SupabaseAuthService` (Google + e-postkode) og `SupabaseProfileService` | Implementert og lokalt testet. **E-post-OTP, profil og sesjon er live-verifisert 24.10.2026 mot utviklingsprosjektet. Google OAuth gjenstår.** |
| Produksjonskomposisjon | Ekte Auth og profil; abonnement, kurs, objekter, scenarioer, referanser, risikoer, analyse, kalender og import er `not_configured` (se «Backend fase 2A») |
| Anvendt i Supabase / Auth testet | Migrasjon 1–8: ja (ChatGPT). Fase 2A e-post-OTP/profil/sesjon: **ja, live-verifisert i utviklingsprosjektet 24.10.2026**. Google OAuth: **nei**. |

## Filer

```
supabase/
  config.toml                         lokal CLI-konfigurasjon (ingen hemmeligheter)
  migrations/
    20261022100000_helpers.sql                     set_updated_at, enforce_immutable_columns
    20261022100100_profiles.sql                    profiles + trigger på auth.users
    20261022100200_properties_and_user_properties.sql
    20261022100300_shared_analysis_data.sql        property_snapshots, analyses, viewings
    20261022100400_user_data.sql                   scenarios, user_comparables, user_risks, private_events, calendar_overrides
    20261022100500_billing_usage_jobs.sql          subscriptions, course_purchases, analysis_jobs, usage_events
    20261022100600_service_role_grants.sql         eksplisitte rettigheter til service_role + lukket EXECUTE på rls_auto_enable()
    20261022100700_service_role_privilege_reset.sql   REVOKE ALL før GRANT for service_role + deny-by-default for nye tabeller
  tests/
    rls_matrix.sql                    testmatrise (kan kjøres mot Supabase)
    support/local_supabase_stub.sql   etterligning av Supabase-roller/auth med brede standardrettigheter – KUN for lokal testing, aldri i Supabase
    support/local_service_role_no_defaults.sql          variant: service_role uten standardrettigheter (kun lokal testing)
    support/local_service_role_extra_defaults_only.sql  variant: bare TRUNCATE/REFERENCES/TRIGGER ekstra, som i live-feilen (kun lokal testing)
    support/local_rls_auto_enable_stub.sql   omtrentlig etterligning av Supabase-funksjonen rls_auto_enable() (kun lokal testing)
src/services/supabase/
  config.ts, client.ts, index.ts      klientgrunnlag (offentlig nøkkel, validering, lat klient)
  authService.ts                      SupabaseAuthService (Google, e-postkode, sesjon, utlogging)
  profileService.ts                   SupabaseProfileService + ProfileRow + resolveProfileDefaults
  userMapping.ts, errors.ts           Supabase-bruker → domene-bruker; Supabase-feil → ServiceError
  redirect.ts                         retur fra Google (PKCE) med hash-ruter
  events.ts, notConfigured.ts         DataEvents fra Auth-hendelser; stand-ins som kaster not_configured
  compose.ts                          createSupabaseServices(): produksjonskomposisjonen
  testing.ts                          FakeSupabase (kun tester)
  *.test.ts                           konfigurasjon, statiske SQL-kontroller, PGlite, adaptertester, kontraktparitet, sikkerhet
e2e/produksjon.spec.ts                produksjonsmodus med stubbet Supabase-nettverk (eget Playwright-prosjekt «produksjon», port 5199)
.env.example                          kun offentlige variabler
```

Migrasjonene er små, deterministiske (ingen tilfeldige ID-er, ingen utvidelser) og kan anvendes i filrekkefølge. De forutsetter PostgreSQL 15 eller nyere (`ON DELETE SET NULL` med kolonneliste). Alt kan rekonstrueres fra GitHub; ingenting skal klikkes sammen i Dashboard.

## Tabeller

Felles = skrives bare av backend (service-rolle). Privat = eieravgrenset i databasen.

| Tabell | Type | Klientens tilgang (rolle `authenticated`) |
|---|---|---|
| `profiles` | privat | Leser egen rad. Endrer bare `display_name` og `defaults`. Ingen insert/delete (raden opprettes av trigger). |
| `properties` | felles | Leser bare eiendommer i egen liste. Ingen skriving. |
| `property_snapshots` | felles | Som `properties`. |
| `viewings` | felles | Som `properties`. |
| `analyses` | felles + privat | Leser felles analyser (ikke utkast) for bolig i egen liste, og egne private analyser. Kan bare opprette, endre og slette **egne private** analyser. |
| `user_properties` | privat | Leser/sletter egne rader. Oppretter/endrer et utvalg kolonner (se under). |
| `scenarios` | privat | Leser egne. Oppretter og endrer et utvalg kolonner; sletter ikke-låste. |
| `user_comparables`, `user_risks`, `private_events`, `calendar_overrides` | privat | Full CRUD på egne rader, uten å kunne velge id, eier eller tidsstempler. |
| `subscriptions`, `course_purchases`, `usage_events` | privat | **Bare lesing** av egne rader. |
| `analysis_jobs` | felles | Leser jobber hen er koblet til (`requested_by`). Ingen skriving. |

`anon` har ingen rettigheter på noen tabell. Hver tabell får `revoke all … from anon, authenticated` rett etter at den er opprettet, og deretter bare de rettighetene som trengs (Supabase gir ellers alt til `anon`/`authenticated` på nye tabeller). Skriving av felles data og av abonnement, kurs, forbruk og jobber skal senere skje med service-rollen fra backend; den omgår RLS, men stoppes fortsatt av fremmednøkler, check-constraints og triggere.

Kolonnerettigheter (klienten kan aldri sette `id`, eier, `created_at`, `updated_at` eller `locked`):

- `profiles`: update `display_name`, `defaults`.
- `user_properties`: insert `property_id, favorite, work_status, notes, label, last_seen_analysis_version, checks`; update `favorite, work_status, notes, primary_scenario_id, label, archived_at, last_seen_analysis_version, checks`. `analyzed_at` settes bare av backend.
- `scenarios`: insert `property_id, analysis_id, analysis_version, name, values`; update `analysis_id, analysis_version, name, values`.
- De fire andre private tabellene: alle innholdskolonner (se `20261022100400_user_data.sql`).

## Eierskap og referanseintegritet

Eierskap håndheves med **sammensatte fremmednøkler** (virker også for service-rollen) i tillegg til RLS, ikke bare med policyer:

- `scenarios (owner_id, property_id) → user_properties (user_id, property_id)`: bare bolig i egen liste. Det samme gjelder `user_comparables`, `user_risks`, `private_events`, `calendar_overrides` og private analyser. Fjernes boligen fra listen (`delete`), forsvinner brukerens egne rader med den (som `removeMine` i mocklaget); felles data og andres data berøres ikke.
- `scenarios (analysis_id, property_id) → analyses (id, property_id)`: analysen gjelder samme eiendom.
- `analyses (snapshot_id, property_id) → property_snapshots (id, property_id)`: snapshotet tilhører samme eiendom.
- Triggeren `scenarios_check_refs` krever at analysen er en **felles analyse (ikke utkast) eller brukerens egen private analyse**, og at `analysis_version` stemmer med analysens versjon. Den kjører som den som skriver (SECURITY INVOKER), så en klient bare kan referere analyser den faktisk kan lese.

### `primary_scenario_id`

Valgt løsning: en **sammensatt, nullable fremmednøkkel** `user_properties (user_id, property_id, primary_scenario_id) → scenarios (owner_id, property_id, id)` med `ON DELETE SET NULL (primary_scenario_id)`. Dermed kan primærscenarioet bare være brukerens eget scenario for samme eiendom, uten trigger og uten å stole på klienten. Når primærscenarioet slettes settes bare `primary_scenario_id` til `null` (appen velger ny primær før sletting, som i mocklaget). Fremmednøkkelsjekken omgår RLS, så den fungerer selv om bruker B ikke kan se As scenario; feilmeldingen gjengir bare nøkkelen B selv sendte inn.

### Låst scenario («Nettsidens vurdering»)

En innlogget bruker kan ikke opprette, låse opp, gi nytt navn eller redigere verdiene i et låst scenario, og kan ikke slette det. Brukeren kan bare flytte det til ny analyseversjon (endre `analysis_id` og `values`), slik mocklaget gjør ved «rebase». Backend (service-rolle, `auth.uid()` er `null`) er ikke begrenset av triggeren.

### Analyser: felles og private, versjonering

- `visibility = 'shared'` krever `owner_id is null`; `visibility = 'private'` krever eier. Felles analyser kan klienten aldri skrive (policyene tillater bare `visibility = 'private' and owner_id = auth.uid()`), og en privat analyse kan aldri bli felles (`visibility`, `owner_id` og `property_id` er uforanderlige).
- Felles analyser er **uforanderlige etter publisering** (`guard_published_analysis`, gjelder også backend): eneste endring er `published → superseded`.
- Unik versjon per eiendom for felles analyser: `create unique index analyses_shared_version_key on analyses (property_id, version) where visibility = 'shared'`.
- Publisert/felles analyse uten anbefaling avvises (`recommendation` er bare valgfri i private utkast og felles utkast).

### Jobb-dedupe og idempotens

- `analysis_jobs_active_dedupe`: unik delvis indeks på `dedupe_key` der `status in ('queued','running')`. Det kan aldri finnes to aktive jobber med samme nøkkel; ferdige og mislykkede jobber kan ha samme nøkkel.
- `usage_events.idempotency_key` er unik. Strukturen støtter at samme hendelse ikke registreres to ganger og at nye forsøk ikke belaster på nytt. Selve kvotelogikken (telling per periode, belastning ved publisering) er **ikke** implementert.
- `usage_events.property_id` er `ON DELETE RESTRICT`: forbruk er regnskapsopplysninger og må eksplisitt håndteres før en eiendom ryddes bort.

### Radgrense

`user_comparables` og `user_risks` har en trigger som begrenser antall rader per bolig og bruker til 50 (samme grense som appens tjenester), så en klient ikke kan hope opp rader. Planens grense for antall scenarioer per bolig (`limits.scenariosPerProperty`) kommer fra konfigurasjonen i appen og er ikke i databasen.

## Felles data: konservativ lesepolicy i fase 1

Mocklaget lar enhver innlogget bruker slå opp en eiendom og lese felles analyser; abonnement håndheves «server-side». Siden `has_active_subscription()` ikke er forsvarlig å implementere før Vipps og abonnementsdata finnes, er lesing av felles tabeller (`properties`, `property_snapshots`, `viewings`, felles `analyses`) begrenset til **eiendommer brukeren har i egen liste** (`user_properties`). Det er smalere enn mocklaget:

- **Oppslag av en eiendom brukeren ikke har** (f.eks. `getByFinnId` før «legg til») må i fase 2 gå via en serverfunksjon (RPC/edge function) som sjekker abonnement og kvote, oppretter eiendom og analyse med service-rollen og legger boligen i listen.
- **Kjent begrensning:** `user_properties` kan opprettes av klienten (som spesifisert), så en innlogget bruker som kjenner en eiendoms UUID kan legge den i egen liste og dermed lese de felles dataene, uavhengig av abonnement. UUID-er kan ikke listes opp (ingen lesing av `properties` uten medlemskap), men dette må lukkes før lansering, enten ved å fjerne klientens INSERT på `user_properties` når serverfunksjonen finnes, eller ved å legge abonnementssjekk inn i policyene. Testen `3.13` i matrisen dokumenterer dagens oppførsel.
- Mock-semantikken «leserettigheter etter utløpt abonnement» (se egne data, ikke endre) kan ikke uttrykkes i databasen ennå; endring av egne data er ikke abonnementsstyrt i fase 1.

## Rettigheter (grants) og `service_role`

Hostede Supabase-prosjekter kan ha ulike standardrettigheter på nye tabeller (`default privileges`), og de er ikke noe vi kan stole på. Derfor definerer migrasjonene **eksplisitt rettighetene til alle tre rollene**: `anon` og `authenticated` i migrasjon 1–6, og `service_role` i migrasjon 7 og 8. GitHub er autoritativ for grants, ikke Supabase-standardene.

**Historikk (to funn ved faktisk verifisering, rapportert av ChatGPT):**

1. *Migrasjon 7 (første korrektur).* `service_role` manglet tabellrettigheter på de nye tabellene, så alle backendtester stoppet på `42501 permission denied`. Migrasjon 7 gir derfor eksplisitte `GRANT`-er.
2. *Migrasjon 8 (denne korrekturen).* Etter migrasjon 7 var live-matrisen 202/204: test `0.8` (`service_role` har nøyaktig de bestemte tabellrettighetene) og `8.20` (`TRUNCATE` skal avvises) feilet, fordi det hostede prosjektet allerede hadde gitt `service_role` ekstra rettigheter (bl.a. `TRUNCATE`, også `REFERENCES` og `TRIGGER`). **Et `GRANT` legger bare til og fjerner aldri eksisterende rettigheter**, så migrasjon 7 alene kunne ikke gi den modellen vi har bestemt. Hvor rettighetene kommer fra er ikke bekreftet av Claude (mest sannsynlig Supabases standardrettigheter på nye tabeller); modellen er laget slik at det ikke spiller noen rolle.

**Løsning i migrasjon 8** (`20261022100700_service_role_privilege_reset.sql`; migrasjon 1–7 er urørt):

- `REVOKE ALL PRIVILEGES ON TABLE … FROM service_role` på alle 15 tabeller (fjerner også kolonnerettigheter), og **deretter** nøyaktig de bestemte rettighetene (samme sett som migrasjon 7). Resultatet er det samme uansett hva `service_role` hadde fra før.
- `service_role` beholder `USAGE` på schema `public` (gis eksplisitt), men får ikke `CREATE` (fjernes hvis det finnes): vanlig backend oppretter ikke skjemaobjekter, DDL skjer i migrasjoner.
- `anon`, `authenticated`, policyer, funksjoner, triggere og `public.rls_auto_enable()` er ikke endret av migrasjon 8 (låst av statiske tester og en før/etter-test).

- **`service_role`** er backendrollen. Den omgår RLS, men GRANT, fremmednøkler, check-constraints, unike indekser og triggere (uforanderlige analyser, låste scenarioer, radgrenser) gjelder fortsatt. Rettighetene er det planlagte backendbruket krever, ikke `ALL`: full CRUD på `properties`, `analyses`, `viewings`, `user_properties`, `scenarios`, de fire private detaljtabellene og `analysis_jobs`; `SELECT/INSERT/UPDATE` på `profiles`, `property_snapshots` og `subscriptions`; bare `SELECT/INSERT` på `course_purchases` og `usage_events` (regnskap og betalingshistorikk endres ikke bakover). Aldri `TRUNCATE`, `REFERENCES` eller `TRIGGER`. Begrunnelse per tabell står i migrasjon 7. Sekvenser trengs ikke (alle id-er er uuid), og funksjonene er bare trigger-funksjoner, så ingen EXECUTE-grants er gitt. Least privilege er valgt bevisst fremfor «alt unntatt det farlige»: nye rettigheter må gis eksplisitt i en migrasjon som kan vurderes.
- **Standardrettigheter for fremtidige tabeller (deny-by-default).** Migrasjon 8 kjører `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM service_role, anon, authenticated` (tre setninger). En ny tabell som `postgres` oppretter i `public` har da ingen rettigheter for disse rollene før migrasjonen som oppretter den gir dem eksplisitt, slik at samme avvik ikke kan oppstå på neste tabell. Vurdert og valgt slik:
  - Det endrer *bare* standarden for fremtidige tabeller opprettet av `postgres` i `public`. **Ingen eksisterende tabell, sekvens eller funksjon endres av disse setningene**, og objekter opprettet av andre roller (f.eks. `supabase_admin`) påvirkes ikke (begge deler er testet).
  - Sekvenser og funksjoner er bevisst ikke berørt. Funksjoner får fortsatt PostgreSQLs standard `EXECUTE` for `PUBLIC`; hver migrasjon som lager en funksjon må derfor `REVOKE EXECUTE` eksplisitt (migrasjon 1–6 gjør det).
  - Konsekvens: en tabell opprettet manuelt i Dashboard blir ikke automatisk tilgjengelig via Data API. Det er ønsket. RLS slås fortsatt på av event-triggeren `ensure_rls`, og migrasjonene gjør det eksplisitt uansett.
  - Gjelder bare standarder satt `FOR ROLE postgres IN SCHEMA public`. En eventuell *global* standard (uten `IN SCHEMA`) ville ikke fjernes; testene `0.15` (katalog) og `0.16` (oppretter en prøvetabell og leser ACL-en) feiler da synlig i stedet for å gå ubemerket.
- **Klientrollene** er uendret: `anon` har ingenting, `authenticated` har fortsatt least privilege (tabell- og kolonnerettigheter er fastlåst av testene 0.10 og 0.11).
- **`public.rls_auto_enable()`** er en Supabase-funksjon i det hostede prosjektet (SECURITY DEFINER, brukt av event-triggeren `ensure_rls` til å slå på RLS på nye tabeller), ikke en Flippsjekk-funksjon. Den hadde standard `EXECUTE` for `PUBLIC`, så `anon` og `authenticated` kunne kalt den som RPC. Migrasjon 7 fjerner EXECUTE for `PUBLIC`, `anon` og `authenticated` **betinget** (bare hvis funksjonen finnes), uten å røre funksjonen, kroppen, eieren eller event-triggeren.
- Merk: i et prosjekt med `ensure_rls` får nye tabeller RLS automatisk. Migrasjonene slår likevel på RLS eksplisitt, og en statisk test sikrer at hver tabell har `enable row level security`, siden matrisen alene ikke ville avdekket en glemt linje i et slikt miljø.

## SECURITY DEFINER

Bare to funksjoner er `SECURITY DEFINER`, begge med tom `search_path` (alt skjemakvalifisert) og `REVOKE EXECUTE … FROM public, anon, authenticated`:

- `handle_new_user()` (trigger på `auth.users`, insert) oppretter `profiles`-raden.
- `handle_user_email_change()` (trigger på `auth.users`, e-postendring) holder `profiles.email` i takt.

Begrunnelse: rollen som oppretter Auth-brukere (`supabase_auth_admin`) har ingen rettigheter på `public.profiles`, og klienten skal ikke kunne opprette profiler selv. Funksjonene gjør bare insert/update av profilraden til samme bruker. Visningsnavn hentes fra metadata (Google leverer `full_name`/`name`); metadata kan redigeres av brukeren og brukes **bare til visning**, aldri til tilgang. Alle andre funksjoner er vanlige trigger-funksjoner (SECURITY INVOKER) uten klientrettigheter, og ingen policy stoler på `authenticated` alene – alle bruker `auth.uid()`.

## Avvik fra `docs/datamodell.md` og appens modell

| Hva | Valg | Hvorfor |
|---|---|---|
| `properties.finn_id` | `^[0-9]{6,12}$` | Appens Zod-skjema godtar 6–12 sifre; dokumentets `^[1-9][0-9]{5,11}$` ville avvist data appen aksepterer. |
| `viewings.start/end`, `private_events.start/end`, `calendar_overrides.start` | `start_at` / `end_at` | `end` er et reservert ord i SQL. |
| `scenarios.values` | kolonnen heter `"values"` (må siteres i SQL) | Samme navn som i appen. |
| `profiles.defaults` | nullable | Trigger kan ikke kjenne `NEW_ACCOUNT_DEFAULTS` (ligger i appen); `null` betyr «bruk standard». |
| `profiles` | ekstra `created_at` | Nyttig; ikke i Zod-skjemaet. |
| `analysis_jobs.created_by` | nullable, `ON DELETE SET NULL` | En slettet bruker skal ikke ta med seg jobber andre er koblet til. |
| `analysis_jobs.simulated_failure` | utelatt | Kun demo. |
| `analysis_jobs.requested_by` | `uuid[]` uten fremmednøkkel | Postgres kan ikke ha fremmednøkkel på array-elementer; backend rydder ved kontosletting. |
| Scenario-policy fra dokumentet (`exists`-sjekker i policyen) | sammensatte fremmednøkler + trigger | Håndheves også for service-rollen og er uavhengig av hvilke policyer som gjelder. |
| `has_active_subscription()` i lese-policyer (dokumentets eksempel) | medlemskap i `user_properties` | Se «konservativ lesepolicy». |
| `user_properties.analyzed_at` | ikke skrivbar fra klient | Settes av backend når analysen er ferdig. |
| `calendar_overrides` | unik (`user_id`, `property_id`, `event_key`) | Appen har én overstyring per bolig. |
| `subscriptions.provider` | tillater `mock` | Finnes i appens modell for eldre rader; produksjonsbackend skal bare skrive `vipps`. |
| Felter som ikke kan være tomme | `check` på tekst som ikke kan være blank, beløp ≥ 0, `kind`-regler for sammenlignbare objekter m.m. | Speiler `validateComparable`, `validateRisk` og Zod. |

Appens kolonner følger `camelCase → snake_case` bortsett fra `areaBRAi → area_bra_i`, `start/end → start_at/end_at`. Testen `tabellene dekker appens datamodell` sjekker at hvert Zod-felt har en kolonne og at påkrevde felt er `NOT NULL`.

## Klientgrunnlag og miljøvariabler

- `.env.example`: `VITE_FLIPPROM_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Bare offentlige verdier. Kopier til `.env.local` (git-ignorert). Aldri `service_role`, `sb_secret_…` eller database-passord.
- `src/services/supabase/config.ts`: validerer URL (https, unntatt lokal utviklingsserver) og nøkkel. Den **avviser `sb_secret_…` og JWT med rolle `service_role`** og gjengir aldri nøkkelen i feilmeldinger. Mangler eller feiler konfigurasjonen, avviser `getSupabaseClient()` med `ServiceError('not_configured')`.
- `src/services/supabase/client.ts`: `createSupabaseClient` laster `@supabase/supabase-js` dynamisk og bruker PKCE som standard (`?code=` i spørringen fungerer sammen med hash-ruteren; **må verifiseres mot faktisk Google-OAuth**). Pakken ligger i en egen chunk (`supabase-*.js`, ca. 219 kB) som ikke forhåndslastes, så demoen laster den aldri. Klienten brukes av `SupabaseAuthService` og `SupabaseProfileService` (fase 2A).
- Produksjonsmodus uten gyldig Supabase-konfigurasjon viser «Produksjonsmodus mangler Supabase-konfigurasjon» med årsaken (verdiene vises aldri). Med gyldig konfigurasjon starter appen med ekte Auth og profil (se «Backend fase 2A»).
- Pakker lagt til: `@supabase/supabase-js` 2.118.0 (dependencies, pinnet) og `@electric-sql/pglite` 0.5.11 (devDependencies, pinnet; kun til lokal SQL-testing).

### Lokal oppkobling mot utviklingsprosjektet

1. Lag `.env.local` (git-ignorert via `.env.*`) med `VITE_FLIPPROM_MODE=production`, `VITE_SUPABASE_URL=https://<prosjekt-ref>.supabase.co` og `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…` (Project Settings → API Keys). Aldri `service_role`, `sb_secret_…` eller database-passord; `config.ts` avviser dem.
2. Start med `npm run dev -- --host 127.0.0.1` (appen på `http://127.0.0.1:5173/`). Mangler URL eller nøkkel, viser appen «Produksjonsmodus mangler Supabase-konfigurasjon» med årsaken – ikke en hvit skjerm. Vite starter serveren på nytt når `.env.local` endres.
3. I Supabase Dashboard (manuelt, ikke kontrollert av Claude): Authentication → URL Configuration, med Site URL og Redirect URL lik **nøyaktig** adressen i nettleseren, `http://127.0.0.1:5173/` (appen bygger `redirectTo` fra adressen, så `localhost` og `127.0.0.1` er forskjellige). E-postinnlogging på, nye brukere tillatt, anonyme innlogginger av, og e-postmalene må sende `{{ .Token }}` (se «Må konfigureres i Supabase Auth»).
4. Første testbruker opprettes gjennom den ekte flyten (e-post → kode → Supabase Auth), aldri med SQL mot `auth.users`. Brukeren er en vanlig `authenticated`-bruker; RLS gjelder fullt ut.
5. `.env.local` styrer også `npm run build` (bygger da i produksjonsmodus, uten demo/mock i bunten). Enhetstestene (`vite.config.ts`) og demo-e2e (`playwright.config.ts`) festes eksplisitt til demo, så en lokal `.env.local` ikke endrer testsuiten; e2e i produksjonsmodus setter sin egen stubbede konfigurasjon.

## Backend fase 2A: Auth og profil

En ekte bruker skal kunne logge inn (Google eller e-post med engangskode), få sesjonen gjenopprettet etter oppfrisking, logge ut, lese sin egen `profiles`-rad og endre navn og standardforutsetninger – og aldri nå andres profil. Ingen boligdata er koblet til Supabase ennå.

### Implementert (i kode)

- **`SupabaseAuthService`** ([authService.ts](../src/services/supabase/authService.ts)) bak eksisterende `AuthService`. UI importerer aldri Supabase; det kjenner bare kontrakten.
  - *Google:* `signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })` gir en adresse som UI sender nettleseren til (kontrakten har allerede `{ kind: 'redirect', url }`). `redirectTo` er alltid siden selv uten hash og spørring (`origin + pathname`, ikke hardkodet vertsnavn). Adressen må ligge på Supabase-prosjektets egen opprinnelse, ellers avvises den. PKCE brukes (fra klienten).
  - *Retur fra Google med hash-ruter:* Supabase sender brukeren tilbake til `redirectTo?code=…` (PKCE). `supabase-js` bytter koden mot en sesjon selv (`detectSessionInUrl`), og `getSession()` venter på det. Ved avbrutt/feilet innlogging legger Supabase `error`/`error_code`/`error_description` både i spørringen og i fragmentet (`#error=…`, som hash-ruteren ellers ville tolket som en rute). `redirect.ts` leser utfallet én gang ved oppstart, fjerner feilparameterne fra adressen, og `AuthReturn` (App.tsx) sender brukeren til `/logg-inn`, som viser feilen («Innloggingen med Google ble avbrutt.») eller sender videre når sesjonen er på plass. Dette er en valgfri kontraktmetode `AuthService.takeRedirectResult?()`; mocken har ingen omdirigering og implementerer den ikke.
  - *E-post med engangskode:* `signInWithOtp({ email, options: { shouldCreateUser: true } })` og `verifyOtp({ email, token, type: 'email' })`. Kontoen opprettes første gang koden bekreftes. Svaret fra `requestEmailCode` er likt for ny og eksisterende konto (UI avslører ikke om kontoen finnes). Ingen egen OTP-validering: klienten sjekker bare formatet (6 siffer, produktbeslutning); om koden er riktig avgjør Supabase.
  - *`challengeId`:* Supabase har ingen challenge, og koden bekreftes mot e-postadressen. `challengeId` er derfor e-postadressen i en nøytral innpakning (`otp:<e-post>`). Den er ikke en hemmelighet og gir ingen rettigheter, og den kan gjenopprettes uten lagring (også etter oppfrisking). Selve koden lagres, logges og returneres aldri.
  - *`expiresAt` / `resendAfter`:* kontrakten krever dem. De er **UI-hint fra adapteren** (10 minutter / 60 sekunder), ikke verdier lest fra Supabase og ikke sikkerhetskontroll. UI bruker bare `resendAfter` til å holde «send ny kode»-knappen inaktiv en stund. Serveren er autoritativ: faktisk levetid for koden, tid mellom nye koder og rate limits settes i Supabase Auth. Rate limit-svar fra Supabase («only request this after N seconds») vises med ventetiden. UI-teksten «Koden varer i 10 minutter» vises bare i demoen.
  - *Gyldig/utløpt kode:* Supabase svarer `otp_expired` («Token has expired or is invalid») for **både** feil og utløpt kode. Vi kan ikke skille dem og mapper begge til `invalid_code` med en melding som nevner begge, slik at brukeren kan rette en skrivefeil uten å miste skjemaet. `code_expired` brukes for en ukjent `challengeId` og for utløpt/feil-startet OAuth-flyt.
  - *Sesjon:* `session()` leser `getSession()` (lokal sesjon, fornyes av `supabase-js`); ingen JWT kopieres til egen lagring eller datamodell, og ingenting i appen lagrer tokens. Anonyme Auth-brukere regnes ikke som innlogget. UI-sperren (`RequireAuth`) er en bekvemmelighet: **autorisasjon er RLS** (PostgREST validerer JWT-en på hver forespørsel). `SessionProvider` oppdateres av `DataEvents` fra `onAuthStateChange` (`SIGNED_IN` for en annen bruker enn sist, `SIGNED_OUT`, `USER_UPDATED`; også fra andre faner).
  - *Utlogging:* `signOut({ scope: 'local' })` – bare denne nettleseren. Supabase sin standard (`global`) ville logget brukeren ut på alle enheter.
- **Bruker-mapping** ([userMapping.ts](../src/services/supabase/userMapping.ts)): Supabase `User` → domenets `User` (`id`, `email`, `displayName`, `isDemoAccount: false`, `createdAt`), validert mot `UserSchema`. Supabase-typen sprer seg ikke videre. `id` er Supabase Auth sin bruker-ID og er det RLS bruker (`auth.uid()`). `displayName` her kommer fra leverandør-metadata (Google leverer navn) og er **bare til visning**: brukeren kan redigere `user_metadata` selv, så det brukes aldri til tilgangsstyring. Autoritativt visningsnavn er `profiles.display_name`, og header viser profilens navn når den er lest.
- **`SupabaseProfileService`** ([profileService.ts](../src/services/supabase/profileService.ts)) bak eksisterende `ProfileService`, mot `public.profiles`.
  - *Les:* `select user_id, display_name, email, defaults, updated_at` filtrert på innlogget bruker; RLS (`profiles_select_own`) håndhever eierskap uansett.
  - *Skriv:* `update` av **bare** `display_name` og/eller `defaults` (kolonnene `authenticated` har UPDATE på). `user_id`, `email`, `created_at` og `updated_at` sendes aldri; bruker-ID brukes som filter, ikke data. Ingen rad tilbake = feil (`not_found`), ikke stille suksess. Varsler appen etter lagring (`events.emit()`), så sesjon og profil hentes på nytt.
  - *`defaults = null`:* betyr «ingen egne lagrede standarder ennå» og gir en kopi av `NEW_ACCOUNT_DEFAULTS`. Et lagret objekt (komplett eller delvis) legges oppå `NEW_ACCOUNT_DEFAULTS` og valideres av `ProfileDefaultsSchema`; et delvis objekt gir dermed alltid et komplett sett. Ugyldige verdier gir `ServiceError('validation')`, aldri halvferdige standarder. Økonomiske standardverdier er uendret. En delvis endring leser gjeldende standarder, legger endringen oppå, validerer og skriver hele settet; siste skriver vinner (ingen optimistisk låsing – ikke verifisert mot ekte tidsstempelformat).
  - *Validering:* alle rader fra databasen valideres (`ProfileRowSchema` og deretter `ProfileSchema`); ingen `as Profile`.
  - *Profilopprettelse:* skjer i databasen (trigger `on_auth_user_created`, migrasjon 2, i samme transaksjon som Auth-brukeren). Frontend oppretter aldri profil. Fordi raden finnes før en sesjon kan finnes, er det ingen race å håndtere; mangler raden likevel, gir `get()` `not_found`, og Konto viser sin eksisterende «Prøv å laste inn på nytt»-boks.
- **Databasetyper:** ingen genererte typer finnes i repoet, og Claude kan ikke generere dem uten Supabase-tilgang. Adapteren bruker en smal, håndskrevet `ProfileRow`/`ProfileUpdate` ved grensen, som ikke er «generert». ChatGPT kan generere de faktiske typene fra det live-verifiserte prosjektet, f.eks. `npx supabase gen types typescript --project-id <prosjekt-ref> --schema public > src/services/supabase/database.types.ts` (krever Supabase CLI og tilgangstoken; er ikke en del av build eller test). `client.ts` har en TODO for å type klienten med dem.
- **Feilmapping** ([errors.ts](../src/services/supabase/errors.ts)): Supabase-feil → `ServiceError` med norske meldinger (ugyldig/utløpt kode, rate limit, ikke innlogget, avbrutt OAuth, nettverksfeil, ikke konfigurert, rettighet/RLS, manglende tabell). Rå Supabase-tekst vises aldri; et trygt utdrag (navn, kode, status, melding) ligger i `details.cause` til feilsøking, aldri tokens eller radinnhold.

### Produksjonskomposisjon og uimplementerte tjenester

`createAppServices()` returnerer i produksjonsmodus `createSupabaseServices()` når Supabase-konfigurasjonen er gyldig, ellers `null` (da viser appen forklaringen). Komposisjonen har ekte Auth, profil og `DataEvents`; alle andre tjenester er stand-ins ([notConfigured.ts](../src/services/supabase/notConfigured.ts)) som avviser hvert kall med `ServiceError('not_configured', …)` og en forståelig melding. De gir aldri tomme eller falske data og aldri tilgang (abonnementet kan ikke «bli aktivt» av at tjenesten mangler). `Services.unavailable` lister områdene, og UI bruker den til å si ærlig fra:

- `RequireBackend` (App.tsx) erstatter sider som trenger objekter, scenarioer, kalender, kurs eller import med «Denne delen er ikke koblet til ennå» – ingen feilside, ingen tomme lister, ingen hvit skjerm.
- Konto viser ekte profil, men «Abonnement og betaling er ikke koblet til ennå» (ingen «Velg abonnement», ingen påstand om «ingen abonnement»), og skjuler eksport/import og kursliste.
- Etter innlogging starter brukeren på Konto (`homePath`) i stedet for Oversikt, så lenge objekter ikke er koblet til. Header, forside og knapper bruker samme regel.
- En kort «Tidlig produksjonsversjon»-boks vises i appen, og analyseknappen skjules når analyse ikke finnes.
- `SessionProvider` fanger nå feil fra `getEntitlements()` (som `getSubscription()` og `profile.get()` allerede ble), slik at et uimplementert område ikke logger brukeren ut av visningen.

### Endringer i eksisterende servicekontrakter (alle additive)

- `ServiceErrorCode` har fått `'unavailable'` (nettverksfeil/midlertidig feil hos leverandøren). Mocken kaster den aldri.
- `AuthService.takeRedirectResult?()` (valgfri, se over). Mocken implementerer den ikke.
- `Services.unavailable: readonly ServiceArea[]` (tom i demoen).
- Ingen eksisterende metode er endret, og demoen er funksjonelt uendret (alle eksisterende tester og demo-e2e er grønne).

### Supabase Auth-konfigurasjon – status

Status etter live-test i utviklingsprosjektet 24.10.2026:

1. **Google-provider:** ikke aktivert/live-verifisert ennå. Når den tas i bruk må Client ID/Secret konfigureres i Google Cloud og Supabase; Google-konsollens «Authorized redirect URI» er Supabase sin callback `https://<prosjekt-ref>.supabase.co/auth/v1/callback`.
2. **URL-er:** konfigurert for lokal utvikling med `http://127.0.0.1:5173/` som Site URL/Redirect URL. Produksjonsadressen må legges inn når hosting er valgt. `localhost` og `127.0.0.1` er ulike origins og deler ikke nettlesersesjon.
3. **E-postkode:** konfigurert og live-verifisert. E-postmalen bruker `{{ .Token }}`, kodelengden er satt til **6**, og ny bruker har mottatt og brukt koden med `verifyOtp({ type: 'email' })`.
4. **OTP-levetid og rate limits:** Email OTP Expiration er satt til **600 sekunder (10 minutter)**. Rate-limit-grenser er ikke belastningstestet; serverinnstillingene er autoritative, mens appens tider bare er UI-hint.
5. **SMTP:** egen SMTP via **Resend** er konfigurert med verifisert sendingsdomene og sending er live-verifisert. SMTP/API-hemmeligheten ligger utenfor repository og frontend.
6. **Nye brukere:** «Allow new users to sign up» er på, og **anonyme innlogginger er av** i utviklingsprosjektet.
7. **Captcha/bot-beskyttelse:** ikke implementert i frontend. Hvis den slås på i Supabase, vil innlogging feile (`captcha_failed`) til frontend sender captcha-token.

### Live-verifisering fase 2A

**Bekreftet 24.10.2026 mot utviklingsprosjektet:** egen SMTP leverer e-post; 6-sifret OTP fungerer for ny bruker; Auth-bruker blir bekreftet; profiltrigger oppretter én `profiles`-rad; egen profil kan leses og oppdateres fra appen; oppdaterte profilverdier består refresh; lokal utlogging fungerer; ny OTP-innlogging fungerer; og Supabase-sesjonen gjenopprettes etter at Safari lukkes og åpnes igjen på samme origin. Live-databasen viste én bekreftet Auth-bruker, profil og aktive sesjoner under kontrollen.

**Gjenstår før produksjonsklar Auth:** Google OAuth (inkludert avbrutt flyt og redirect), eksplisitt nettlesertest med bruker A mot bruker B for profil-RLS/kolonnerettigheter, rate-limit/utløpt-kode-kanttilfeller mot live Auth, og produksjons-URL når hosting er valgt. Database-RLS er separat verifisert gjennom fase-1-matrisen.

### Teststrategi (lokal)

- Adaptertester mot `FakeSupabase` (tilstandsfull etterligning av Auth og `profiles` med RLS og kolonnerettigheter): sesjon, brukermapping, Google-redirect, bestilling og bekreftelse av kode, feil kode, utløpt kode, rate limit, nettverksfeil, utlogging, auth state changes, manglende konfigurasjon, challenge-gjenoppretting, profil (les, `null`, delvis, korrupt, oppdatering, ugyldig, RLS/Supabase-feil).
- **Kontraktparitet** (`authProfile.contract.test.ts`): samme tester kjøres mot mocken og mot Supabase-adapterne.
- **Statiske sikkerhetstester** (`adapters.static.test.ts`): ingen `service_role`/hemmeligheter, ingen egen lagring av tokens/koder, `user_metadata` bare til visningsnavn, bare tillatte profilkolonner, ingen skriving utenom `display_name`/`defaults`, UI importerer aldri Supabase.
- **E2E** (`e2e/produksjon.spec.ts`, Playwright-prosjektet «produksjon»): ekte `supabase-js` mot stubbet GoTrue/PostgREST – oppstart, innloggingsside, e-postkode (feil og riktig), ekte profil på Konto, profilendring, oppfrisking, utlogging, uimplementerte deler, Google (PKCE-retur) og avbrutt Google. Bevarer ikke noe mot ekte Supabase.
- Mutasjonstest utført manuelt: 31 bevisste feil i adapterne (feil `scope`, `shouldCreateUser`, uvalidert URL, `user_id` sendt som data, manglende validering, manglende varsel osv.) ble alle fanget.

## Tester

```bash
npm run test:sql        # bare Supabase-testene (statiske kontroller, PGlite, konfigurasjon, Auth/profil-adaptere)
npm run test:e2e        # inkluderer produksjonsmodus (stubbet Supabase-nettverk)
npm test                # alt, inkludert over
```

- **`supabase/tests/rls_matrix.sql`** (223 sjekker): bruker A mot bruker B for hver tabell, `anon`, `authenticated` og `service_role`. Hver avvisning forventes med en bestemt SQLSTATE (42501 rettighet/RLS/guard, 23503 fremmednøkkel, 23505 unik, 23514 check, 54000 radgrense), så en skrivefeil i testen ikke teller som «avvist». Den dekker blant annet: A leser/endrer egne data; B får nektet å lese, endre og slette As scenarioer, referanser og risikoer; B kan ikke sette As scenario som primært; vanlig bruker kan ikke skrive `properties` eller felles analyser; vanlig bruker kan ikke sette abonnementet til `active` eller skrive forbruk/kurs; privat analyse kan ikke bli felles; unik versjon, dedupe og idempotens; cascade ved fjerning av bolig og sletting av bruker. En innledende inventarsjekk (0.x) kontrollerer RLS, rettigheter og funksjonsrettigheter, blant annet `0.8` (`service_role` har nøyaktig de bestemte tabellrettighetene, uten `TRUNCATE`/`REFERENCES`/`TRIGGER`), `0.8b` (ingen kolonnerettigheter), `0.9b` (ikke `CREATE` på schema `public`), `0.15` (ingen standardrettigheter for nye tabeller i katalogen) og `0.16` (en prøvetabell opprettet av `postgres` får ingenting; opprettes og slettes i transaksjonen). `8.20b` avviser `TRUNCATE` på alle 15 tabeller med «permission denied».
- **Lokal kjøring:** `src/services/supabase/supabase.pglite.test.ts` anvender stub + migrasjoner + matrisen mot PGlite (PostgreSQL 18). Stubben etterligner Supabase-roller, `auth.uid()` og **brede standardrettigheter (inkludert `TRUNCATE`, `REFERENCES`, `TRIGGER`) for `anon`, `authenticated` og `service_role`**. Det er med vilje: en stubb uten dem lot migrasjon 7 se komplett ut lokalt, selv om den ikke fjerner det Supabase hadde gitt. To varianter avgrenser dem: `local_service_role_no_defaults.sql` (ingen for `service_role`) og `local_service_role_extra_defaults_only.sql` (bare de tre ekstra, som gjengir live-utfallet nøyaktig). Negative kontroller i testfilen: migrasjon 1–7 med de ekstra rettighetene feiler på nøyaktig `0.8` og `8.20` av de opprinnelige 204 testene (pluss de nye); 1–7 med brede standarder feiler bredere; 1–7 uten standarder for `service_role` feiler bare på `0.15`/`0.16` (det forklarer hvorfor avviket ikke ble sett før). Med migrasjon 1–8 består hele matrisen i alle tre miljøene. Mutasjonstest utført manuelt: de 17 opprinnelige og 23 nye bevisste feil (bl.a. fjernet `REVOKE ALL`, tilbakegitt `TRUNCATE`, fjernede standardregler, utvidet `anon`/`authenticated`, droppet eller endret `rls_auto_enable()`) ble alle fanget; at matrisen i seg selv ikke fanger en droppet `rls_auto_enable()` (0.13/0.14 hopper over der den mangler) er dekket av den statiske testen og før/etter-testen.
- **Statiske kontroller** (`migrations.static.test.ts`): RLS og REVOKE på hver tabell, ingen grants til `anon`/`public`, ingen `using (true)`, SECURITY DEFINER bare der det er begrunnet, ingen hemmeligheter, og at CHECK-listene i SQL er de samme som appens enum-er/Zod-skjemaer.

### Kjøre matrisen mot Supabase

Etter at migrasjonene er anvendt i utviklingsprosjektet: kjør `supabase/tests/rls_matrix.sql` som `postgres` (SQL-editor, `psql` eller MCP `execute_sql`; test `0.16` oppretter en prøvetabell som `postgres` og feiler hvis den kjøres som en annen rolle). Scriptet lager egne testbrukere (`@rls-test.invalid`) og testdata i en transaksjon og avslutter med `ROLLBACK`. Det siste uttrykket returnerer én rad per test; kolonnen `ok` skal være `true` på alle (forventet 223 rader). Hopper verktøyet over `begin`/`rollback`, må testbrukerne slettes manuelt. Kjør aldri mot et prosjekt med ekte brukerdata uten å lese gjennom scriptet.

## Må verifiseres i faktisk Supabase

Ingenting under er gjort av Claude; alt skal kontrolleres mot utviklingsprosjektet:

1. Migrasjonene (1–8) kan anvendes i rekkefølge uten feil, spesielt triggerne på `auth.users` og `ON DELETE SET NULL (kolonne)`. Postgres-versjonen i prosjektet er ≥ 15 og stemmer med `supabase/config.toml`.
2. Faktisk skjema: 15 tabeller, constraints, indekser og kolonnetyper som i migrasjonene. RLS er på for alle; `list_tables` og `pg_policies` viser 37 policyer, alle for `authenticated`.
3. **Standardrettigheter i det hostede prosjektet.** Inventarsjekkene `0.2–0.5` i matrisen kontrollerer at `REVOKE`-ene faktisk fjernet det Supabase gir på nye tabeller.
4. Kjør `rls_matrix.sql` (alle rader `ok = true`). Avvik skyldes ofte miljøforskjeller: ekstra `NOT NULL`-kolonner i `auth.users`, hvem som kan `set role`, eller at triggeren på `auth.users` ikke fyrer.
5. Kjør Supabase **security- og performance-advisors**. Forventet: ingen funn om RLS av, policy uten RLS, `search_path`, SECURITY DEFINER som kan kalles av klient, `auth.uid()` uten `select`, fremmednøkler uten indeks eller dupliserte indekser. «Unused index» på nye indekser er forventet.
6. Test med **ekte JWT-er via PostgREST**: to testbrukere (A og B) opprettet gjennom Auth. Gjenta matrisens kjerne som REST-kall: B leser/endrer/sletter ikke As rader; B kan ikke sette As scenario som primært; klienten får feil når den sender `id`, `user_id`, `owner_id`, `locked` eller `updated_at`; ingen skriving til `properties`, `analyses` (felles), `subscriptions`, `usage_events`, `analysis_jobs`.
7. Trigger for profil: ny Auth-bruker (e-post og Google) får profil med riktig visningsnavn; e-postendring synkroniseres; sletting av Auth-bruker fjerner private rader (cascade).
8. PostgREST: `public` er eksponert, skjemacache er lastet, og feilkodene (403/409/23xxx) er forståelige i klienten. Verifiser at klientens PKCE-valg fungerer med Googles OAuth og hash-ruteren.
9. Bekreft at ingen `anon`-tilgang finnes via REST på noen av de 15 tabellene.
9b. **Migrasjon 7:** anvend den, kjør hele matrisen på nytt (inventar `0.8–0.14` og seksjon `8` er nye; `service_role`-testene skal nå nå constraintene med SQLSTATE 23505/23514/23503, ikke `permission denied`), kontroller at `has_function_privilege` for `anon`/`authenticated`/`PUBLIC` på `public.rls_auto_enable()` er false, at event-triggeren `ensure_rls` fortsatt slår på RLS på en ny testtabell i `public`, og kjør Security Advisor og Performance Advisor på nytt.
9c. **Migrasjon 8** (live-verifisert av ChatGPT; beholdt som kontrollpunkt): anvend den, kjør hele matrisen på nytt (forventet 223 rader, alle `ok = true`; `0.8` og `8.20` er de to som feilet live), kontroller ACL-en (`relacl`) på alle 15 tabeller for `service_role` mot tabellen i migrasjonen (ingen `D` truncate, `x` references eller `t` trigger; ingen kolonne-ACL), at `anon`/`authenticated` er som før, at `pg_default_acl` for `postgres` i `public` ikke gir `service_role`/`anon`/`authenticated` noe på tabeller (`0.15`/`0.16`), og at `rls_auto_enable()` og `ensure_rls` er som etter migrasjon 7. Kjør Security Advisor og Performance Advisor på nytt.
9d. **Fase 2A** (Auth og profil): e-post-OTP, profil og vedvarende nettlesersesjon er live-verifisert 24.10.2026. Google OAuth og eksplisitt A-mot-B profiltest via nettleseren gjenstår; se «Supabase Auth-konfigurasjon – status» og «Live-verifisering fase 2A».
10. Bekreft at **anonyme innlogginger er slått av** i Auth-innstillingene: anonyme brukere får rollen `authenticated`, og ville dermed passert alle policyer som sjekker `auth.uid()`, inkludert å opprette egne lister (se «Kjente begrensninger»).

## Bevisst ikke implementert

Vipps (avtaler og betaling) og webhooks, ekte FINN-henting, analyseagent og jobbkø, ekte markedsdata, `has_active_subscription()` og kvotelogikk, serverfunksjoner for «legg til bolig» og analyseforespørsel, Realtime (data-hendelser utover Auth), Storage for private dokumenter, produksjonsdeploy, `SupabaseSubscriptionService` og repositoriene for objekter, scenarioer, referanser, risikoer, kalender og import (alle `not_configured`), rad-mappere utover profil, genererte databasetyper, seed-data, opprydding av eiendommer som er solgt, eksport/sletting av data (personvern), rate limiting og captcha. Ingen halvferdige repositories er lagt inn: det som ikke er koblet til, avviser med `not_configured`.

## Kjente begrensninger

- Lesing av felles data bygger på medlemskap i egen liste, og klienten kan opprette medlemskap selv (se over). Alle med rollen `authenticated` (også eventuelle anonyme Auth-brukere, hvis den innstillingen skrus på) omfattes.
- Private analyser skrives av eieren uten størrelsesgrense på jsonb (grenser finnes bare på `profiles.defaults`, `scenarios.values` og `user_properties.checks`). Et privat utkast trenger også et snapshot, og snapshots kan bare opprettes av backend, så privat import må gå via serverfunksjon.
- «Et objekt må ha minst ett scenario» og planens scenariogrense er appregler og ligger ikke i databasen.
- `scenarios_check_refs` kjører som skriveren, så den avhenger av at analysen er lesbar med dagens RLS. Strammes `analyses`-policyen inn senere (f.eks. abonnement), må triggeren vurderes på nytt.
- Låsesjekken i `scenarios_guard_locked` skiller bruker fra backend ved at `auth.uid()` er `null` for service-rollen.
- Standardrettighets-regelen i migrasjon 8 gjelder tabeller opprettet av `postgres` i `public`. Tabeller opprettet av andre roller (f.eks. `supabase_admin`) eller i andre skjemaer følger Supabases egne standarder; en global standard (uten `IN SCHEMA`) fjernes ikke. Lokalt er det bare modellert at standardene finnes som `postgres`-standarder i `public`; hvordan det hostede prosjektet faktisk er satt opp er ikke verifisert av Claude.
- **Fase 2A:** `SupabaseProfileService.update` for forutsetninger er «les, slå sammen, skriv hele settet» – to faner som lagrer samtidig kan overskrive hverandre (siste vinner).
- **Fase 2A:** Supabase skiller ikke feil fra utløpt e-postkode (`otp_expired`), så UI kan ikke si hvilken av de to det var. Kodelengde 6 er en produktbeslutning som også må være satt i Supabase.
- **Fase 2A:** `expiresAt`/`resendAfter` for e-postkode er UI-hint, ikke Supabase-verdier; ventetiden fra Supabase vises bare når en forespørsel faktisk avvises med rate limit.
- **Fase 2A:** `getSession()` bruker den lokale sesjonen (fornyes av `supabase-js`). En bruker som er slettet eller sperret på serveren kan stå innlogget i visningen til tokenet utløper eller fornyes; RLS/PostgREST avviser uansett alle kall.
- **Fase 2A:** Captcha/bot-beskyttelse, Vipps, mobil/Apple-innlogging og en grundigere gjenoppretting av mislykket OAuth enn en enkel melding er ikke implementert. Forsidens markedsføringstekster (f.eks. eksempelpriser «i demoen») er uendret.
- Lokal testing bruker PostgreSQL 18 (PGlite), mens Supabase kan kjøre en annen versjon; migrasjonene bruker bare funksjoner fra PostgreSQL 15.
- `analysis_jobs.requested_by` (array) må ryddes av backend når en bruker slettes.

## Neste backendfase

1. **Fase 2A avsluttes med merge til `main`** etter den dokumenterte live-verifiseringen. Google OAuth kan fullføres som egen Auth-oppgave senere og skal ikke blokkere e-post-OTP-grunnmuren.
2. **Fase 2B:** genererte databasetyper/rad-mappere og ekte Supabase-repositorier for brukerens objektliste og scenarioer, med kontraktparitet og relevante live-tester.
3. Før klienten får reell «legg til bolig»-flyt skal den kjente UUID-omgåelsen lukkes: klienten skal ikke kunne opprette `user_properties` vilkårlig uten serverstyrt kontroll. Serverfunksjon/RPC/edge skal senere håndheve abonnement/kvote når dette finnes.
4. Koble deretter risiko, egne sammenlignbare og kalender én tjeneste om gangen; fjern tilsvarende `not_configured` bare når hele flyten fungerer.
5. Vipps/abonnement, jobbkø/analyseagent og datakildeavklaring kommer etter at datalagring/eierskap er stabilt (se [integrasjoner.md](integrasjoner.md)).
