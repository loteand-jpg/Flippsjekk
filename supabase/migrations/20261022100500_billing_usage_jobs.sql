-- Flippsjekk backend fase 1, migrasjon 6/6: abonnement, kurskjøp, forbruk og analysejobber.
--
-- Alle fire tabellene LESES av eieren (jobber: av de som har bedt om analysen), men KLIENTEN KAN IKKE SKRIVE noe av dem.
-- Skriving skjer senere fra autorisert backend (Vipps-webhook, jobbkø, serverfunksjoner med service-rolle).
-- Dermed kan en vanlig bruker ikke sette abonnementet sitt til «active», gi seg selv kvote eller lage kurskjøp.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null check (length(plan_id) > 0),
  interval text not null check (interval in ('month', 'year')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  -- «mock» finnes for eldre simulerte rader i appens modell. Produksjonsbackend skal bare skrive «vipps».
  provider text not null check (provider in ('mock', 'vipps')),
  -- Vipps' avtale-ID (agreementId) når provider er vipps.
  agreement_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_order check (current_period_end >= current_period_start)
);

create index subscriptions_user_idx on public.subscriptions (user_id);
create unique index subscriptions_agreement_key on public.subscriptions (provider, agreement_id) where agreement_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- course_purchases
-- ---------------------------------------------------------------------------
create table public.course_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null check (length(course_id) > 0),
  -- Beløp betalt i hele kroner.
  amount_paid integer not null check (amount_paid >= 0),
  provider text not null default 'vipps' check (provider = 'vipps'),
  -- Vipps' betalings-ID (referanse). Unik: samme betaling kan aldri gi to kjøp.
  payment_id text not null unique check (length(payment_id) > 0),
  purchased_at timestamptz not null default now(),
  -- Ett kjøp gir varig tilgang.
  constraint course_purchases_user_course_key unique (user_id, course_id)
);

-- ---------------------------------------------------------------------------
-- analysis_jobs (felles jobber; brukeren ser jobbene hen har bedt om)
-- ---------------------------------------------------------------------------
create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  finn_id text not null check (length(finn_id) > 0),
  type text not null check (type in ('full_analysis', 'light_refresh', 'linked_analysis', 'market_refresh')),
  schema_version integer not null check (schema_version > 0),
  model_version text not null check (length(model_version) > 0),
  target_analysis_version integer check (target_analysis_version is null or target_analysis_version > 0),
  -- property_id:type:v<målversjon>:s<skjema>:m<modell> (linked_analysis får i tillegg :u<bruker>).
  dedupe_key text not null check (length(dedupe_key) > 0),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  step_index integer not null default 0 check (step_index >= 0),
  step_duration_ms integer not null default 0 check (step_duration_ms >= 0),
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  -- { code, message } eller null
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  -- Nullable (avvik fra appens modell): en slettet bruker skal ikke ta med seg jobber andre er koblet til.
  created_by uuid references auth.users (id) on delete set null,
  -- Alle brukere som er koblet til jobben. Tabellen kan ikke ha fremmednøkkel på array-elementer: backend må rydde ved kontosletting.
  requested_by uuid[] not null default '{}',
  result_analysis_id uuid references public.analyses (id) on delete set null,
  result_snapshot_id uuid references public.property_snapshots (id) on delete set null,
  -- market_refresh: brukerId -> 'new_analysis' | 'refresh'
  charges jsonb check (charges is null or jsonb_typeof(charges) = 'object')
  -- Appens «simulatedFailure» finnes bare i demoen og er bevisst ikke med.
);

-- Det kan ikke finnes to aktive jobber (queued/running) med samme dedupe_key. Nye forespørsler kobles til den som kjører.
create unique index analysis_jobs_active_dedupe on public.analysis_jobs (dedupe_key) where status in ('queued', 'running');
create index analysis_jobs_property_idx on public.analysis_jobs (property_id);
create index analysis_jobs_requested_by_idx on public.analysis_jobs using gin (requested_by);
create index analysis_jobs_created_by_idx on public.analysis_jobs (created_by);
create index analysis_jobs_result_analysis_idx on public.analysis_jobs (result_analysis_id);
create index analysis_jobs_result_snapshot_idx on public.analysis_jobs (result_snapshot_id);

create trigger analysis_jobs_set_updated_at
  before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- usage_events (forbruk og kvote)
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('new_analysis', 'refresh', 'reuse')),
  -- RESTRICT: forbruk er en regnskapsopplysning. Opprydding av en eiendom må eksplisitt håndtere (arkivere) forbruket først.
  property_id uuid not null references public.properties (id) on delete restrict,
  job_id uuid references public.analysis_jobs (id) on delete set null,
  analysis_id uuid references public.analyses (id) on delete set null,
  -- Unik: samme hendelse registreres aldri to ganger (ingen dobbel belastning, trygge nye forsøk).
  idempotency_key text not null check (length(idempotency_key) > 0),
  chargeable boolean not null,
  created_at timestamptz not null default now(),
  constraint usage_events_idempotency_key unique (idempotency_key)
);

create index usage_events_user_created_idx on public.usage_events (user_id, created_at);
create index usage_events_property_idx on public.usage_events (property_id);
create index usage_events_job_idx on public.usage_events (job_id);
create index usage_events_analysis_idx on public.usage_events (analysis_id);

-- ---------------------------------------------------------------------------
-- RLS: kun lesing for klienten
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.course_purchases enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.usage_events enable row level security;

revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.course_purchases from anon, authenticated;
revoke all on table public.analysis_jobs from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;

grant select on table public.subscriptions to authenticated;
grant select on table public.course_purchases to authenticated;
grant select on table public.analysis_jobs to authenticated;
grant select on table public.usage_events to authenticated;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy course_purchases_select_own on public.course_purchases
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy usage_events_select_own on public.usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Jobben er felles, men brukeren ser bare jobber hen er koblet til. (@> bruker GIN-indeksen.)
create policy analysis_jobs_select_requested on public.analysis_jobs
  for select to authenticated
  using (requested_by @> array[(select auth.uid())]);
