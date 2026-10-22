# Supabase – backend fase 1 (databasegrunnmur)

Denne siden beskriver databasegrunnmuren som ligger i repoet: migrasjoner, RLS, tester og et lite klientgrunnlag. **Alt er implementert og testet bare i repositoryet.** Det er ikke anvendt i, og ikke verifisert mot, et faktisk Supabase-prosjekt. Appen bruker fortsatt mocktjenestene i demo, og `createAppServices()` returnerer fortsatt `null` i produksjonsmodus.

## Status i ett blikk

| | Status |
|---|---|
| Skjema, constraints, indekser (15 tabeller) | 6 migrasjoner (anvendt og verifisert i utviklingsprosjektet av ChatGPT) + migrasjon 7 med eksplisitte `service_role`-rettigheter (korrigering etter den verifiseringen; ikke anvendt ennå) |
| RLS og eksplisitte rettigheter | Skrevet; 37 policyer; RLS på alle tabeller |
| SQL-testmatrise (bruker A mot B m.m.) | `supabase/tests/rls_matrix.sql`, 204 sjekker – lokalt kjørt mot PGlite (PostgreSQL 18 i WASM). Den første versjonen (176 sjekker) og migrasjon 1–6 er kjørt mot faktisk Supabase av ChatGPT; **migrasjon 7 og den utvidede matrisen er ikke kjørt mot Supabase ennå** |
| Statiske SQL-kontroller og skjema-mot-Zod-sjekk | Kjører i `npm test` |
| Supabase-klientgrunnlag (`@supabase/supabase-js` 2.118.0) | Konfigurasjon og klientfabrikk finnes, men ingen tjenester bruker dem ennå |
| Anvendt i Supabase / RLS bekreftet / Auth testet | **Nei.** Skal gjøres separat mot utviklingsprosjektet (se «Må verifiseres i faktisk Supabase») |

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
  tests/
    rls_matrix.sql                    testmatrise (kan kjøres mot Supabase)
    support/local_supabase_stub.sql   etterligning av Supabase-roller/auth – KUN for lokal testing, aldri i Supabase
    support/local_rls_auto_enable_stub.sql   omtrentlig etterligning av Supabase-funksjonen rls_auto_enable() (kun lokal testing)
src/services/supabase/
  config.ts, client.ts, index.ts      klientgrunnlag (offentlig nøkkel, validering)
  *.test.ts                           konfigurasjon, statiske SQL-kontroller, PGlite-kjøring av migrasjoner og matrise
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

Hostede Supabase-prosjekter kan ha ulike standardrettigheter på nye tabeller (`default privileges`), og de er ikke noe vi kan stole på. Ved faktisk verifisering manglet `service_role` tabellrettigheter på de nye tabellene, så alle backendtester stoppet på `42501 permission denied` før fremmednøkler, unike indekser og guard-triggere ble prøvd. Derfor definerer migrasjonene **eksplisitt rettighetene til alle tre rollene**: `anon` og `authenticated` i migrasjon 1–6, og `service_role` i migrasjon 7 (`20261022100600_service_role_grants.sql`). GitHub er autoritativ for grants, ikke Supabase-standardene.

- **`service_role`** er backendrollen. Den omgår RLS, men GRANT, fremmednøkler, check-constraints, unike indekser og triggere (uforanderlige analyser, låste scenarioer, radgrenser) gjelder fortsatt. Rettighetene er det planlagte backendbruket krever, ikke `ALL`: full CRUD på `properties`, `analyses`, `viewings`, `user_properties`, `scenarios`, de fire private detaljtabellene og `analysis_jobs`; `SELECT/INSERT/UPDATE` på `profiles`, `property_snapshots` og `subscriptions`; bare `SELECT/INSERT` på `course_purchases` og `usage_events` (regnskap og betalingshistorikk endres ikke bakover). Aldri `TRUNCATE`, `REFERENCES` eller `TRIGGER`. Begrunnelse per tabell står i migrasjonen. Sekvenser trengs ikke (alle id-er er uuid), og funksjonene er bare trigger-funksjoner, så ingen EXECUTE-grants er gitt.
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
- `src/services/supabase/client.ts`: `createSupabaseClient` laster `@supabase/supabase-js` dynamisk (den havner ikke i demoens bunt) og bruker PKCE som standard (`?code=` i spørringen fungerer sammen med hash-ruteren; **må verifiseres mot faktisk Google-OAuth**). Ingen tjenester bruker klienten ennå.
- Produksjonsmodus viser fortsatt «Produksjonsbackend er ikke koblet til», nå også med en linje om Supabase-konfigurasjonen er funnet (verdiene vises aldri).
- Pakker lagt til: `@supabase/supabase-js` 2.118.0 (dependencies, pinnet) og `@electric-sql/pglite` 0.5.11 (devDependencies, pinnet; kun til lokal SQL-testing).

## Auth

Planlagt produksjonsauth er Google OAuth og e-post med engangskode (ingen passord), gjennom eksisterende `AuthService`. I fase 1 finnes bare grunnlaget: tabellen `profiles` med trigger på `auth.users`, klientkonfigurasjon og PKCE-valget. `SupabaseAuthService` er ikke skrevet. Leverandører, e-postmal for engangskode, rate limits og redirect-URL-er settes i Dashboard i neste fase.

## Tester

```bash
npm run test:sql        # bare Supabase-testene (statiske kontroller, PGlite, konfigurasjon)
npm test                # alt, inkludert over
```

- **`supabase/tests/rls_matrix.sql`** (204 sjekker): bruker A mot bruker B for hver tabell, `anon`, `authenticated` og `service_role`. Hver avvisning forventes med en bestemt SQLSTATE (42501 rettighet/RLS/guard, 23503 fremmednøkkel, 23505 unik, 23514 check, 54000 radgrense), så en skrivefeil i testen ikke teller som «avvist». Den dekker blant annet: A leser/endrer egne data; B får nektet å lese, endre og slette As scenarioer, referanser og risikoer; B kan ikke sette As scenario som primært; vanlig bruker kan ikke skrive `properties` eller felles analyser; vanlig bruker kan ikke sette abonnementet til `active` eller skrive forbruk/kurs; privat analyse kan ikke bli felles; unik versjon, dedupe og idempotens; cascade ved fjerning av bolig og sletting av bruker. En innledende inventarsjekk (0.x) kontrollerer RLS, rettigheter og funksjonsrettigheter.
- **Lokal kjøring:** `src/services/supabase/supabase.pglite.test.ts` anvender stub + migrasjoner + matrisen mot PGlite (PostgreSQL 18). Stubben etterligner Supabase-roller, `auth.uid()` og standardrettighetene til `anon`/`authenticated` – men gir **`service_role` ingen standardrettigheter** (alle må komme fra migrasjonene). Mutasjonstest utført manuelt: 17 bevisste feil (RLS av, policy `true`, manglende fremmednøkkel, fjernet indeks, for mye eller for lite til `service_role`, åpen `rls_auto_enable()` m.fl.) ble alle fanget. En egen negativ kontroll kjører de seks første migrasjonene alene mot den strammede stubben og krever at matrisen feiler (39 feil, i de samme områdene som i faktisk Supabase).
- **Statiske kontroller** (`migrations.static.test.ts`): RLS og REVOKE på hver tabell, ingen grants til `anon`/`public`, ingen `using (true)`, SECURITY DEFINER bare der det er begrunnet, ingen hemmeligheter, og at CHECK-listene i SQL er de samme som appens enum-er/Zod-skjemaer.

### Kjøre matrisen mot Supabase

Etter at migrasjonene er anvendt i utviklingsprosjektet: kjør `supabase/tests/rls_matrix.sql` som `postgres` (SQL-editor, `psql` eller MCP `execute_sql`). Scriptet lager egne testbrukere (`@rls-test.invalid`) og testdata i en transaksjon og avslutter med `ROLLBACK`. Det siste uttrykket returnerer én rad per test; kolonnen `ok` skal være `true` på alle (forventet 204 rader). Hopper verktøyet over `begin`/`rollback`, må testbrukerne slettes manuelt. Kjør aldri mot et prosjekt med ekte brukerdata uten å lese gjennom scriptet.

## Må verifiseres i faktisk Supabase

Ingenting under er gjort av Claude; alt skal kontrolleres mot utviklingsprosjektet:

1. Migrasjonene (1–7) kan anvendes i rekkefølge uten feil, spesielt triggerne på `auth.users` og `ON DELETE SET NULL (kolonne)`. Postgres-versjonen i prosjektet er ≥ 15 og stemmer med `supabase/config.toml`.
2. Faktisk skjema: 15 tabeller, constraints, indekser og kolonnetyper som i migrasjonene. RLS er på for alle; `list_tables` og `pg_policies` viser 37 policyer, alle for `authenticated`.
3. **Standardrettigheter i det hostede prosjektet.** Inventarsjekkene `0.2–0.5` i matrisen kontrollerer at `REVOKE`-ene faktisk fjernet det Supabase gir på nye tabeller.
4. Kjør `rls_matrix.sql` (alle rader `ok = true`). Avvik skyldes ofte miljøforskjeller: ekstra `NOT NULL`-kolonner i `auth.users`, hvem som kan `set role`, eller at triggeren på `auth.users` ikke fyrer.
5. Kjør Supabase **security- og performance-advisors**. Forventet: ingen funn om RLS av, policy uten RLS, `search_path`, SECURITY DEFINER som kan kalles av klient, `auth.uid()` uten `select`, fremmednøkler uten indeks eller dupliserte indekser. «Unused index» på nye indekser er forventet.
6. Test med **ekte JWT-er via PostgREST**: to testbrukere (A og B) opprettet gjennom Auth. Gjenta matrisens kjerne som REST-kall: B leser/endrer/sletter ikke As rader; B kan ikke sette As scenario som primært; klienten får feil når den sender `id`, `user_id`, `owner_id`, `locked` eller `updated_at`; ingen skriving til `properties`, `analyses` (felles), `subscriptions`, `usage_events`, `analysis_jobs`.
7. Trigger for profil: ny Auth-bruker (e-post og Google) får profil med riktig visningsnavn; e-postendring synkroniseres; sletting av Auth-bruker fjerner private rader (cascade).
8. PostgREST: `public` er eksponert, skjemacache er lastet, og feilkodene (403/409/23xxx) er forståelige i klienten. Verifiser at klientens PKCE-valg fungerer med Googles OAuth og hash-ruteren.
9. Bekreft at ingen `anon`-tilgang finnes via REST på noen av de 15 tabellene.
9b. **Migrasjon 7:** anvend den, kjør hele matrisen på nytt (inventar `0.8–0.14` og seksjon `8` er nye; `service_role`-testene skal nå nå constraintene med SQLSTATE 23505/23514/23503, ikke `permission denied`), kontroller at `has_function_privilege` for `anon`/`authenticated`/`PUBLIC` på `public.rls_auto_enable()` er false, at event-triggeren `ensure_rls` fortsatt slår på RLS på en ny testtabell i `public`, og kjør Security Advisor og Performance Advisor på nytt.
10. Bekreft at **anonyme innlogginger er slått av** i Auth-innstillingene: anonyme brukere får rollen `authenticated`, og ville dermed passert alle policyer som sjekker `auth.uid()`, inkludert å opprette egne lister (se «Kjente begrensninger»).

## Bevisst ikke implementert

Vipps (avtaler og betaling) og webhooks, ekte FINN-henting, analyseagent og jobbkø, ekte markedsdata, `has_active_subscription()` og kvotelogikk, serverfunksjoner for «legg til bolig» og analyseforespørsel, Realtime (`DataEvents`), Storage for private dokumenter, produksjonsdeploy, `SupabaseAuthService` og de øvrige `Supabase*`-repositoriene, rad-mappere mellom `snake_case` og domenemodellen, genererte databasetyper, seed-data, opprydding av eiendommer som er solgt, eksport/sletting av data (personvern), og rate limiting. Ingen halvferdige repositories er lagt inn; `createAppServices()` er uendret.

## Kjente begrensninger

- Lesing av felles data bygger på medlemskap i egen liste, og klienten kan opprette medlemskap selv (se over). Alle med rollen `authenticated` (også eventuelle anonyme Auth-brukere, hvis den innstillingen skrus på) omfattes.
- Private analyser skrives av eieren uten størrelsesgrense på jsonb (grenser finnes bare på `profiles.defaults`, `scenarios.values` og `user_properties.checks`). Et privat utkast trenger også et snapshot, og snapshots kan bare opprettes av backend, så privat import må gå via serverfunksjon.
- «Et objekt må ha minst ett scenario» og planens scenariogrense er appregler og ligger ikke i databasen.
- `scenarios_check_refs` kjører som skriveren, så den avhenger av at analysen er lesbar med dagens RLS. Strammes `analyses`-policyen inn senere (f.eks. abonnement), må triggeren vurderes på nytt.
- Låsesjekken i `scenarios_guard_locked` skiller bruker fra backend ved at `auth.uid()` er `null` for service-rollen.
- Lokal testing bruker PostgreSQL 18 (PGlite), mens Supabase kan kjøre en annen versjon; migrasjonene bruker bare funksjoner fra PostgreSQL 15.
- `analysis_jobs.requested_by` (array) må ryddes av backend når en bruker slettes.

## Neste backendfase

1. ChatGPT: anvende migrasjonene i utviklingsprosjektet, verifisere punktene over og rapportere avvik. Eventuelle rettelser kommer som en ny, avgrenset oppgave.
2. Genererte databasetyper og rad-mappere (`snake_case` ↔ domenemodell) med tester mot Zod-skjemaene.
3. Serverfunksjoner (RPC/edge) for «legg til bolig» og analyseforespørsel med abonnement og kvote; deretter strammes klientens INSERT på `user_properties` og lese-policyene inn.
4. `SupabaseAuthService` (Google og e-postkode) og `Supabase*`-repositoriene mot `Services`, valgt i `createAppServices()` i produksjonsmodus; kontrakttestene i `services.test.ts` kjøres mot begge implementasjonene.
5. Deretter Vipps, jobbkø/agent og datakildeavklaring (se [integrasjoner.md](integrasjoner.md)).
