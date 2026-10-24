# Datamodell

Det interne skjemaet er definert med Zod i [src/domain/schemas.ts](../src/domain/schemas.ts), og TypeScript-typene utledes derfra. Mockdatabasen ([src/data/db.ts](../src/data/db.ts)) har én tabell per entitet med samme navn og felt som det planlagte Postgres-skjemaet.

Konvensjoner:

- Ukjente tall og datoer er `null`. `0` er en faktisk opplysning.
- Tidspunkt lagres i UTC (ISO 8601). Lokale datoer (Europe/Oslo) lagres som `YYYY-MM-DD`.
- Beløp er i NOK. Prosentfelt i scenarioverdier er prosentpoeng (`7` = 7 %) og konverteres én gang til desimal i `toEngineInput`.
- Analyser er uforanderlige når de er publisert. Ny kunnskap gir ny versjon.

## Felles og private data

| Felles (skrives kun av autorisert backend/agent) | Private (eieravgrenset) |
|---|---|
| `properties`, `property_snapshots`, `analyses` (visibility = shared), `viewings`, `analysis_jobs` | `profiles`, `subscriptions`, `user_properties`, `scenarios`, `private_events`, `calendar_overrides`, `usage_events`, `analyses` (visibility = private: importerte utkast) |

Et scenario er et privat sett med inngangsverdier knyttet til en bestemt analyseversjon (`analysis_id` + `analysis_version`). Når en ny felles versjon publiseres, endres ingen scenarioer automatisk. Brukeren ser hva som er endret og velger enten «behold mine endringer» eller «erstatt alle» (`rebaseValues` i [src/calc/scenario.ts](../src/calc/scenario.ts)).

## Levetid for felles data

En felles analyse skal aldri forsvinne av seg selv eller av brukerhandlinger. Den ligger der så lenge objektet finnes, og kan først ryddes bort en måned etter at objektet er solgt eller trukket. En bruker som fjerner et objekt fra sin liste sletter bare egne rader. Slik opprydding er en backend-oppgave og er ikke implementert i demoen.

I demoen (lokal lagring) gjenopprettes en felles analyse som mangler for et demo-/syntetisk objekt automatisk ved oppstart ([src/services/mock/heal.ts](../src/services/mock/heal.ts)). Det skjer uten jobb og uten belastning på kvoten, og private scenarioer flyttes til den gjenopprettede analysen med uendrede verdier. Rader som ikke kan leses fjernes aldri uten sikkerhetskopi. Skjemaendringer må alltid leveres sammen med en migrering og økt skjemaversjon.

## Tabeller

### profiles
`user_id` (PK, = auth.users.id), `display_name`, `email`, `defaults` (jsonb, `ProfileDefaultsSchema`: kjøpertype per kategori, total prosjektvarighet, tid til økonomisk oppgjør, rente, låneandel kjøp og oppussing, lånefinansiering av løpende utgifter, tilgjengelig egenkapital, arbeidstimer per uke, minimum fortjeneste per egeninnsatstime, arbeidsmodus per kategori, maks egeninnsats, bekreftet kompetanse for regulert arbeid **per område** (`regulatedCompetence {ror, elektro, bad_vatrom}`), reserve, fortjenestemål, salgskostnader, kjøpsgebyrer, hjemområde). Eldre `financingPct` migreres til begge låneandelene; `hourValue` er utfaset og valgfri, `updated_at`.

### subscriptions
`id`, `user_id`, `plan_id`, `interval` (month/year), `status` (active, trialing, past_due, canceled, incomplete), `current_period_start`, `current_period_end`, `cancel_at_period_end`, `provider` (vipps), `provider_subscription_id` (Vipps `agreementId`), `created_at`, `updated_at`.

### course_purchases
`id`, `user_id`, `course_id`, `amount_paid` (hele kroner), `provider` (vipps), `payment_id` (Vipps-referanse, unik), `purchased_at`. Unik på (`user_id`, `course_id`) – ett kjøp gir varig tilgang. Tilgangen er uavhengig av `subscriptions`. Skrives bare av backend ved bekreftet Vipps-betaling (webhook). Brukeren kan bare lese egne rader.

Tilgang beregnes av status **og** betalt periode, ikke av oppsigelsesmarkeringen alene. Se `computeEntitlements` i [src/services/mock/context.ts](../src/services/mock/context.ts):

| Tilstand | Tilgang |
|---|---|
| active / trialing innenfor perioden | Full (også når `cancel_at_period_end` er satt) |
| active etter periodeslutt, past_due, canceled, incomplete, ingen rad | Lesemodus: se, sortere og eksportere egne data. Ingen ny analyse, gjenbruk, oppfrisking eller lagring. |

### properties
`id` (uuid), `finn_id` (unik), `canonical_url`, `address`, `postal_code`, `city`, `district`, `municipality`, `country_code`, `property_type`, `tenure` (selveier, borettslag, aksje, obligasjon, ukjent), `data_origin` (source, demo, synthetic, import), `created_at`.

### property_snapshots
Versjonerte annonsefakta: `id`, `property_id`, `version` (unik per eiendom), `observed_at`, `fetched_at`, `source_url`, `origin`, `asking_price`, `shared_debt`, `listing_total_incl_costs` (annonsens totalbeløp *inkl. kjøpskostnader*, ikke det samme som pris inkl. fellesgjeld), `monthly_common_costs`, `area_bra_i`, `rooms`, `bedrooms`, `floor`, `build_year`, `plot_area`, `sale_status` (aktiv, solgt, trukket, ukjent), `sale_status_note`, `energy_label`, `fact_sources` (jsonb: felt → `{status, sourceId, page}`).

Salgsstatus er annonsens status og er adskilt fra brukerens arbeidsstatus. En utilgjengelig annonse gir status `ukjent`, ikke `solgt`.

### analyses
`id`, `property_id`, `snapshot_id`, `version` (unik per eiendom for felles analyser), `schema_version`, `model_version`, `status` (published, superseded, draft), `visibility` (shared, private), `owner_id` (kun private), `origin` (agent, demo, synthetic, import_v1), `analysis_kind` (full, market_refresh; valgfri), `derived_from_version` (valgfri; hvilken versjon en markedsoppfriskning bygger på), `created_at`, `published_at`, `recommendation`, `recommendation_rationale`, `summary`, `strategy`, `conditions`, `estimates` (jsonb: historisk salgsestimat lav/normal/høy + prisgrunnlag, oppussingsalternativer med tiltak, månedsfordeling, kjøpsgebyrer, gjeld ved salg, dokumentavgiftsregel, valgfritt `scenarios[]` med sluttprodukt inkl. `standardClass`, scenariorisiko, screening, ankerjustering og referanseklassifisering, og `scenarioSearch`), `risks`, `checklist` (12 faste punkter), `comparables`, `sources`, `facts`, `assumptions`, `uncertainties`, `report`, `bid_steps`, `next_steps`, `raw_import`, `unmapped_fields`, `history`.

Publisering skjer atomisk. Den nye analysen valideres med `PublishableAnalysisSchema`, og i samme transaksjon skrives ny analyse, nytt snapshot, forrige versjon settes til `superseded`, brukere kobles og forbruk registreres. Feiler valideringen, merkes bare jobben som feilet.

### viewings
`id`, `property_id`, `kind` (official), `start`, `end`, `status` (planlagt, avlyst), `source_id`, `source_label`, `verified_at`, `replaces_viewing_id`, `note`. En flyttet visning lagres som avlyst gammel rad og ny rad med `replaces_viewing_id`.

### user_properties
Unik (`user_id`, `property_id`): `favorite`, `work_status` (vurderes, visning_planlagt, bud_vurderes, avvist, kjopt), `notes`, `primary_scenario_id` (må peke på brukerens eget scenario for samme eiendom), `label` (privat visningsnavn), `archived_at`, `added_at`, `updated_at`, `last_seen_analysis_version`, `checks` (jsonb: brukerens private avkrysninger, som aldri endrer kildestatus).

### scenarios
`id`, `owner_id`, `property_id`, `analysis_id`, `analysis_version`, `name`, `values` (jsonb, `ScenarioValuesSchema`), `created_at`, `updated_at`.

`values` har fra modell 1.1: `analysisScenarioId` (hvilket agentscenario – basis eller alternativ – kalkylen bygger på), `purchaseFinancingPct`, `renovationFinancingPct`, `financeRunningCosts`, `availableEquity`, `settlementMonths`, `weeklyOwnHours`, `minProfitPerOwnHour`, `laborModes`, `maxOwnWork`, `regulatedCompetence {ror, elektro, bad_vatrom}` (modell 1.2; erstatter det samlede `regulatedSelfWorkConfirmed`). `financingPct` er migrert bort, og `hourValue` er utfaset. `purchaseFinancingPct` gjelder kun kjøpesummen P fra modell 1.2. Se [scenarier-og-marked.md](scenarier-og-marked.md) for migreringen (databaseversjon 5).

### comparables (i analysen) og user_comparables
Sammenlignbare objekter har samme felt i grunnlaget og hos brukeren: `name`, `url`, `kind` (solgt = faktisk salg, prisantydning, solgt_uten_sum), `asking_price` (prisantydning), `sold_price` (oppnådd kontantpris), `common_costs` (felleskostnader per måned), `sold_total_price` (oppnådd pris inkl. fellesgjeld, uten kjøpskostnader), `area`, `date` og `notes`. kr/m² lagres ikke, men beregnes: solgt totalpris → solgt pris → prisantydning.

- I den felles analysen ligger de som `comparables` (med `source_id` og `is_demo`).
- Brukerens egne ligger i `user_comparables` (`id`, `user_id`, `property_id`, feltene over, `created_at`, `updated_at`). Private og eieravgrenset, og de blir aldri en del av en felles analyse. Maks 50 per bolig.
- Valideringsregler (`validateComparable`): faktisk salg krever solgt pris eller solgt totalpris, andre typer kan ikke ha solgt pris, ingen negative beløp, areal over 0, og solgt totalpris kan ikke være lavere enn solgt pris. Ukjent er `null`, aldri 0.
- Median kr/m² regnes bare for faktiske salg, og totalpris og kontantpris blandes ikke.
- Valgfrie felt til markedsvektingen (modell 1.1), både i analysen og hos brukeren: `original_asking_price` (aktive annonser; prisnedsatt hvis høyere enn nåværende), `bedrooms`, `property_type`, `tenure`, `shared_debt`, `location_level` (samme bygg, mikroområde, bydel, kommune, region), `standard_class`, `layout_match`, `floor`, `elevator`, `balcony`, `parking`, `view_note`, `data_quality`, `market_adjustment`. Ukjent = utelatt (aldri 0/«nei»). Vektingen er beskrevet i [scenarier-og-marked.md](scenarier-og-marked.md).

### private_events og calendar_overrides
- `private_events`: brukerens egne og importerte visninger (`confirmed` bevares fra import). De påvirker aldri den avledede buddagen.
- `calendar_overrides`: privat overstyring av buddag med `derived_start_at_override` (kildeprognosen da overstyringen ble lagt inn) og `origin` (manual, import_v1).

### analysis_jobs
`id`, `property_id`, `finn_id`, `type` (full_analysis, light_refresh, linked_analysis, **market_refresh**), `schema_version`, `model_version`, `target_analysis_version`, `dedupe_key`, `status`, `steps`, `step_index`, `attempt`, `started_at`, `finished_at`, `error`, `created_by`, `requested_by` (uuid[]), `result_analysis_id`, `result_snapshot_id`, `charges` (market_refresh: hvordan hver bruker belastes, `new_analysis` eller `refresh`).

`dedupe_key = property_id:type:v<målversjon>:s<skjema>:m<modell>`. Nye forespørsler mens en jobb med samme nøkkel er aktiv kobles til jobben. Et nytt forsøk etter feil gjenbruker jobben (`attempt + 1`).

`linked_analysis` er brukerens egen analyse av en bolig som allerede er analysert: samme trinn og tempo som en ny analyse, privat per bruker (nøkkelen får `:u<user>`), og den vises ikke for andre. Er annonseopplysningene over ett døgn gamle, eller har en visning vært siden de ble hentet, oppdateres pris, visninger og salgsstatus først (uten egen belastning). Brukerens analysedato (`user_properties.analyzed_at`) settes når jobben er ferdig. 

`market_refresh` er en **grundig markedsoppfriskning** av en analyse som er eldre enn 30 dager: den oppdaterer annonseopplysningene, publiserer en ny analyseversjon (`analysisKind = market_refresh`, `derivedFromVersion`, ny analysedato) med uendret teknisk grunnlag, og lar koden regne salgsverdi per scenario og økonomien på nytt. Den leser ikke tekniske dokumenter på nytt og lager ikke nye scenarioer. En bruker som ber om en analyse belastes som ny analyse; en bruker som oppfrisker en analyse han/hun har fra før belastes som oppfriskning. En full teknisk analyse (`full_analysis`) opprettes bare når analysen mangler, er inkompatibel, eller kilden melder nye/endrede dokumenter eller endrede kritiske fakta (se [scenarier-og-marked.md](scenarier-og-marked.md) §6).

### usage_events
`id`, `user_id`, `kind` (new_analysis, refresh, reuse), `property_id`, `job_id`, `analysis_id`, `idempotency_key` (unik), `chargeable`, `created_at`.

- Ny analyse belastes først ved vellykket publisering, med nøkkel `new_analysis:<dedupe_key>`. Mislykkede og dupliserte jobber gir derfor ikke dobbelt forbruk.
- **Hver bruker som ber om en analyse belastes for en ny analyse**, uavhengig av om grunnlaget fantes fra før eller andre har analysert samme bolig (nøkkel `new_analysis:<dedupe_key>[:<user>]`). Åpner brukeren en bolig som allerede ligger i egen liste (eller er betalt tidligere), belastes ikke på nytt. `reuse`-hendelser registreres ikke lenger for nye forespørsler og vises ikke for brukeren.
- Kvoten for nye analyser telles som belastede hendelser i perioden pluss egne pågående analysejobber (også de brukeren er koblet til).

## Supabase-skjemaet (backend fase 1)

Postgres-skjemaet med RLS, constraints og indekser ligger nå i [supabase/migrations](../supabase/migrations) og er beskrevet i [supabase.md](supabase.md), inkludert **avvikene fra denne siden** (bl.a. `start_at`/`end_at`, `profiles.defaults` nullable, `finn_id`-regex etter Zod, sammensatte fremmednøkler i stedet for `exists`-policyer, og konservative lese-policyer uten `has_active_subscription()`). Skjemaet er skrevet og testet i repoet, men ikke anvendt eller verifisert i Supabase ennå. Skjemaendringer leveres alltid som en ny migrasjon.

SQL-utdragene under er det opprinnelige forslaget og er erstattet av migrasjonene.

## Forslag til Postgres/Supabase (opprinnelig utkast)

```sql
create table properties (
  id uuid primary key default gen_random_uuid(),
  finn_id text not null unique check (finn_id ~ '^[1-9][0-9]{5,11}$'),
  canonical_url text not null,
  -- …
  created_at timestamptz not null default now()
);

create table user_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  property_id uuid not null references properties on delete restrict,
  primary_scenario_id uuid,
  unique (user_id, property_id)
);

create table scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  property_id uuid not null references properties,
  analysis_id uuid not null references analyses,
  -- …
);

create unique index usage_events_idem on usage_events (idempotency_key);
create unique index analysis_jobs_active_dedupe on analysis_jobs (dedupe_key) where status in ('queued', 'running');
create unique index analyses_shared_version on analyses (property_id, version) where visibility = 'shared';
```

### Rad-nivå-sikkerhet (RLS)

```sql
alter table scenarios enable row level security;

create policy "egne scenarioer" on scenarios
  for all using (owner_id = auth.uid()) with check (
    owner_id = auth.uid()
    and exists (select 1 from user_properties up where up.user_id = auth.uid() and up.property_id = scenarios.property_id)
    and exists (
      select 1 from analyses a
      where a.id = scenarios.analysis_id and a.property_id = scenarios.property_id
        and (a.visibility = 'shared' or a.owner_id = auth.uid())
    )
  );

-- Felles tabeller: abonnenter kan bare lese. Skriving skjer med service-rolle fra backend/agent.
create policy "les felles analyser" on analyses
  for select using (
    (visibility = 'shared' and status <> 'draft' and public.has_active_subscription(auth.uid()))
    or owner_id = auth.uid()
  );
```

Tilsvarende gjelder for `user_properties`, `private_events`, `calendar_overrides`, `usage_events` (bare lesing for eier) og `profiles`. (I den implementerte modellen, `supabase/migrations`, kan klienten IKKE opprette rader i `user_properties` – medlemskap opprettes bare av backend; se migrasjon 9 og docs/supabase.md.) `primary_scenario_id` kontrolleres med en trigger eller sjekk som krever at scenarioet har samme eier og eiendom. Abonnement og kvoter håndheves i databasefunksjoner/edge functions, ikke i frontend.
