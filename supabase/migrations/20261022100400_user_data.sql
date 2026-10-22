-- Flippsjekk backend fase 1, migrasjon 5/6: brukerens private data.
--
-- Scenarier, egne sammenlignbare objekter, egne risikoer, private hendelser og overstyring av buddag. Alt er eieravgrenset i databasen.
-- Eierskap og referanseintegritet håndheves med sammensatte fremmednøkler (virker også for service-rollen), ikke bare med policyer:
--   * (eier, eiendom) må finnes i user_properties        -> kun for bolig i egen liste
--   * (analyse, eiendom) må finnes i analyses            -> analysen gjelder samme eiendom
--   * user_properties.(bruker, eiendom, primary_scenario) -> primærscenarioet har samme eier og eiendom
-- Regelen «felles analyse eller egen privat analyse» sjekkes av en trigger (scenarios_check_refs).

-- ---------------------------------------------------------------------------
-- scenarios
-- ---------------------------------------------------------------------------
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null,
  analysis_id uuid not null,
  -- Må være versjonen til analysen scenarioet bygger på (kontrolleres av triggeren).
  analysis_version integer not null check (analysis_version > 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- «Nettsidens vurdering»: opprettes av systemet og kan ikke redigeres eller slettes av brukeren (kun flyttes til ny analyseversjon).
  locked boolean not null default false,
  -- ScenarioValuesSchema (jsonb).
  "values" jsonb not null check (jsonb_typeof("values") = 'object' and pg_column_size("values") <= 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Bare bolig i egen liste. Fjernes boligen fra listen, forsvinner scenarioene med den.
  constraint scenarios_owner_property_fk foreign key (owner_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade,
  -- Analysen må gjelde samme eiendom som scenarioet.
  constraint scenarios_analysis_fk foreign key (analysis_id, property_id)
    references public.analyses (id, property_id),
  -- Brukes av user_properties.primary_scenario_id.
  constraint scenarios_owner_property_id_key unique (owner_id, property_id, id)
);

create index scenarios_owner_property_idx on public.scenarios (owner_id, property_id);
create index scenarios_analysis_idx on public.scenarios (analysis_id, property_id);

-- primary_scenario_id: scenarioet må ha samme eier og samme eiendom som raden i user_properties.
-- Nullable (MATCH SIMPLE hopper over sjekken når primary_scenario_id er null). Slettes scenarioet, settes bare primary_scenario_id til null
-- (kolonnelisten i SET NULL krever PostgreSQL 15 eller nyere).
alter table public.user_properties
  add constraint user_properties_primary_scenario_fk
  foreign key (user_id, property_id, primary_scenario_id)
  references public.scenarios (owner_id, property_id, id)
  on delete set null (primary_scenario_id);

create index user_properties_primary_scenario_idx on public.user_properties (user_id, property_id, primary_scenario_id);

create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

create trigger scenarios_immutable
  before update on public.scenarios
  for each row execute function public.enforce_immutable_columns('owner_id', 'property_id', 'created_at');

-- Analysen må være en felles analyse (ikke utkast) eller en privat analyse som eieren selv har, og analysis_version må stemme.
-- Kjører som den som skriver (SECURITY INVOKER): en klient kan derfor bare referere analyser den faktisk har lesetilgang til.
create or replace function public.scenarios_check_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  a record;
begin
  select an.visibility, an.owner_id, an.status, an.version
    into a
    from public.analyses an
   where an.id = new.analysis_id and an.property_id = new.property_id;

  if not found then
    raise exception 'Scenarioet må bygge på en analyse for samme bolig som du har tilgang til.'
      using errcode = '42501';
  end if;
  if a.visibility = 'private' and a.owner_id is distinct from new.owner_id then
    raise exception 'Scenarioet kan ikke bygge på en annen brukers private analyse.'
      using errcode = '42501';
  end if;
  if a.visibility = 'shared' and a.status = 'draft' then
    raise exception 'Scenarioet kan ikke bygge på et felles analyseutkast.'
      using errcode = '42501';
  end if;
  if new.analysis_version is distinct from a.version then
    raise exception 'analysis_version (%) stemmer ikke med analysens versjon (%).', new.analysis_version, a.version
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.scenarios_check_refs() from public, anon, authenticated;

create trigger scenarios_check_refs
  before insert or update of analysis_id, analysis_version, owner_id, property_id on public.scenarios
  for each row execute function public.scenarios_check_refs();

-- Låst scenario: en innlogget bruker kan bare flytte det til en ny analyseversjon (samme som mocklaget: «rebase»), aldri
-- gi nytt navn, låse opp eller låse et vanlig scenario. Backend (service-rolle, auth.uid() er null) er ikke begrenset.
create or replace function public.scenarios_guard_locked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.locked is distinct from old.locked then
    raise exception 'Et scenario kan ikke låses eller låses opp av brukeren.' using errcode = '42501';
  end if;
  if old.locked then
    if new.name is distinct from old.name or new.analysis_id is not distinct from old.analysis_id then
      raise exception 'Scenarioet «%» er låst. Lagre det som nytt scenario for å lage din egen redigerbare versjon.', old.name
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.scenarios_guard_locked() from public, anon, authenticated;

create trigger scenarios_guard_locked
  before update on public.scenarios
  for each row execute function public.scenarios_guard_locked();

alter table public.scenarios enable row level security;

revoke all on table public.scenarios from anon, authenticated;
grant select, delete on table public.scenarios to authenticated;
grant insert (property_id, analysis_id, analysis_version, name, "values") on table public.scenarios to authenticated;
grant update (analysis_id, analysis_version, name, "values") on table public.scenarios to authenticated;

create policy scenarios_select_own on public.scenarios
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy scenarios_insert_own on public.scenarios
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not locked);

create policy scenarios_update_own on public.scenarios
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy scenarios_delete_own on public.scenarios
  for delete to authenticated
  using (owner_id = (select auth.uid()) and not locked);

-- ---------------------------------------------------------------------------
-- user_comparables (brukerens egne sammenlignbare objekter; aldri en del av felles analyse)
-- ---------------------------------------------------------------------------
create table public.user_comparables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  url text,
  -- solgt = faktisk salg, prisantydning, solgt_uten_sum
  kind text not null check (kind in ('solgt', 'prisantydning', 'solgt_uten_sum')),
  asking_price numeric(15, 2) check (asking_price is null or asking_price >= 0),
  sold_price numeric(15, 2) check (sold_price is null or sold_price >= 0),
  common_costs numeric(15, 2) check (common_costs is null or common_costs >= 0),
  sold_total_price numeric(15, 2) check (sold_total_price is null or sold_total_price >= 0),
  area numeric(8, 2) check (area is null or area > 0),
  date date,
  notes text not null default '' check (length(notes) <= 1000),
  -- Valgfrie felt til markedsvektingen. null = ukjent (aldri 0/«nei»).
  bedrooms integer check (bedrooms is null or bedrooms between 0 and 20),
  property_type text check (property_type is null or property_type in ('leilighet', 'rekkehus', 'tomannsbolig', 'enebolig')),
  tenure text check (tenure is null or tenure in ('selveier', 'borettslag', 'aksje', 'obligasjon', 'ukjent')),
  shared_debt numeric(15, 2) check (shared_debt is null or shared_debt >= 0),
  location_level text check (location_level is null or location_level in ('samme_bygg', 'mikroomrade', 'bydel', 'kommune', 'region')),
  standard_class text check (standard_class is null or standard_class in ('oppussingsobjekt', 'dagens_standard', 'middels', 'oppgradert', 'nyoppusset')),
  layout_match text check (layout_match is null or layout_match in ('lik', 'delvis', 'ulik')),
  floor integer,
  elevator boolean,
  balcony boolean,
  parking boolean,
  view_note text check (view_note is null or length(view_note) <= 500),
  data_quality text check (data_quality is null or data_quality in ('hoy', 'middels', 'lav')),
  market_adjustment numeric(6, 3) check (market_adjustment is null or (market_adjustment > 0 and market_adjustment <= 3)),
  original_asking_price numeric(15, 2) check (original_asking_price is null or original_asking_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Samme regler som validateComparable i appen: faktisk salg krever solgt pris (eller solgt totalpris), og andre typer kan ikke ha solgt pris.
  constraint user_comparables_sold_consistency check ((kind = 'solgt') = (sold_price is not null or sold_total_price is not null)),
  constraint user_comparables_total_not_below_cash check (sold_price is null or sold_total_price is null or sold_total_price >= sold_price),
  constraint user_comparables_owner_property_fk foreign key (user_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade
);

create index user_comparables_owner_property_idx on public.user_comparables (user_id, property_id);

-- ---------------------------------------------------------------------------
-- user_risks (brukerens private risikoer og endringer/skjuling av risikoer fra grunnlaget)
-- ---------------------------------------------------------------------------
create table public.user_risks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null,
  -- null = egen risiko. Ellers id-en til risikoen i grunnlaget (analyses.risks[].id) som brukeren endrer eller skjuler.
  base_risk_id text check (base_risk_id is null or length(base_risk_id) > 0),
  removed boolean not null default false,
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (category in (
    'vatrom', 'elektrisk', 'vann_avlop', 'tak_fasade', 'fukt_grunn', 'regulering',
    'sameie_borettslag', 'marked', 'prosjekt', 'dokumentasjon', 'finansiering', 'annet'
  )),
  level integer check (level is null or level between 1 and 10),
  cost_low numeric(15, 2) check (cost_low is null or cost_low >= 0),
  cost_high numeric(15, 2) check (cost_high is null or cost_high >= 0),
  rationale text not null default '' check (length(rationale) <= 1000),
  action text not null default '' check (length(action) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_risks_cost_order check (cost_low is null or cost_high is null or cost_low <= cost_high),
  constraint user_risks_removed_needs_base check (base_risk_id is not null or not removed),
  constraint user_risks_owner_property_fk foreign key (user_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade
);

-- Én endring/skjuling per risiko i grunnlaget (upsertBase i appen).
create unique index user_risks_base_key on public.user_risks (user_id, property_id, base_risk_id) where base_risk_id is not null;
create index user_risks_owner_property_idx on public.user_risks (user_id, property_id);

-- Tak på antall egne rader per bolig (samme grense som appen: 50). Beskytter mot at en klient hoper opp rader.
create or replace function public.enforce_row_limit_per_property()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  n integer;
begin
  execute format('select count(*) from public.%I where user_id = $1 and property_id = $2', tg_table_name)
    into n
    using new.user_id, new.property_id;
  if n >= max_rows then
    raise exception 'Du kan ha inntil % rader i % per bolig.', max_rows, tg_table_name
      using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_row_limit_per_property() from public, anon, authenticated;

create trigger user_comparables_row_limit
  before insert on public.user_comparables
  for each row execute function public.enforce_row_limit_per_property('50');

create trigger user_risks_row_limit
  before insert on public.user_risks
  for each row execute function public.enforce_row_limit_per_property('50');

-- ---------------------------------------------------------------------------
-- private_events (egne og importerte visninger) og calendar_overrides (privat overstyring av buddag)
-- ---------------------------------------------------------------------------
create table public.private_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null,
  kind text not null check (kind in ('private_viewing', 'imported_viewing')),
  start_at timestamptz not null,
  end_at timestamptz,
  note text not null default '' check (length(note) <= 500),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint private_events_end_after_start check (end_at is null or end_at > start_at),
  constraint private_events_owner_property_fk foreign key (user_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade
);

create index private_events_owner_property_idx on public.private_events (user_id, property_id, start_at);

create table public.calendar_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null,
  event_key text not null default 'bidday' check (event_key = 'bidday'),
  start_at timestamptz not null,
  note text not null default '' check (length(note) <= 500),
  origin text not null check (origin in ('manual', 'import_v1')),
  -- Kildeverdien (avledet prognose) da overstyringen ble lagt inn. Bevares for sporbarhet.
  derived_start_at_override timestamptz,
  created_at timestamptz not null default now(),
  -- Én overstyring per bolig og hendelse.
  constraint calendar_overrides_key unique (user_id, property_id, event_key),
  constraint calendar_overrides_owner_property_fk foreign key (user_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade
);

-- Eierskapsnøklene kan ikke flyttes etter opprettelse.
create trigger user_comparables_set_updated_at before update on public.user_comparables for each row execute function public.set_updated_at();
create trigger user_comparables_immutable before update on public.user_comparables for each row execute function public.enforce_immutable_columns('user_id', 'property_id', 'created_at');
create trigger user_risks_set_updated_at before update on public.user_risks for each row execute function public.set_updated_at();
create trigger user_risks_immutable before update on public.user_risks for each row execute function public.enforce_immutable_columns('user_id', 'property_id', 'base_risk_id', 'created_at');
create trigger private_events_immutable before update on public.private_events for each row execute function public.enforce_immutable_columns('user_id', 'property_id', 'created_at');
create trigger calendar_overrides_immutable before update on public.calendar_overrides for each row execute function public.enforce_immutable_columns('user_id', 'property_id', 'event_key', 'created_at');

-- ---------------------------------------------------------------------------
-- RLS og rettigheter for de fire tabellene over (kun eier; klienten velger aldri id, eier eller tidsstempler)
-- ---------------------------------------------------------------------------
alter table public.user_comparables enable row level security;
alter table public.user_risks enable row level security;
alter table public.private_events enable row level security;
alter table public.calendar_overrides enable row level security;

revoke all on table public.user_comparables from anon, authenticated;
revoke all on table public.user_risks from anon, authenticated;
revoke all on table public.private_events from anon, authenticated;
revoke all on table public.calendar_overrides from anon, authenticated;

grant select, delete on table public.user_comparables, public.user_risks, public.private_events, public.calendar_overrides to authenticated;

grant insert (
  property_id, name, url, kind, asking_price, sold_price, common_costs, sold_total_price, area, date, notes,
  bedrooms, property_type, tenure, shared_debt, location_level, standard_class, layout_match, floor, elevator, balcony,
  parking, view_note, data_quality, market_adjustment, original_asking_price
) on table public.user_comparables to authenticated;
grant update (
  name, url, kind, asking_price, sold_price, common_costs, sold_total_price, area, date, notes,
  bedrooms, property_type, tenure, shared_debt, location_level, standard_class, layout_match, floor, elevator, balcony,
  parking, view_note, data_quality, market_adjustment, original_asking_price
) on table public.user_comparables to authenticated;

grant insert (property_id, base_risk_id, removed, title, category, level, cost_low, cost_high, rationale, action) on table public.user_risks to authenticated;
grant update (removed, title, category, level, cost_low, cost_high, rationale, action) on table public.user_risks to authenticated;

grant insert (property_id, kind, start_at, end_at, note, confirmed) on table public.private_events to authenticated;
grant update (kind, start_at, end_at, note, confirmed) on table public.private_events to authenticated;

grant insert (property_id, event_key, start_at, note, origin, derived_start_at_override) on table public.calendar_overrides to authenticated;
grant update (start_at, note, origin, derived_start_at_override) on table public.calendar_overrides to authenticated;

create policy user_comparables_select_own on public.user_comparables for select to authenticated using (user_id = (select auth.uid()));
create policy user_comparables_insert_own on public.user_comparables for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_comparables_update_own on public.user_comparables for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_comparables_delete_own on public.user_comparables for delete to authenticated using (user_id = (select auth.uid()));

create policy user_risks_select_own on public.user_risks for select to authenticated using (user_id = (select auth.uid()));
create policy user_risks_insert_own on public.user_risks for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_risks_update_own on public.user_risks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_risks_delete_own on public.user_risks for delete to authenticated using (user_id = (select auth.uid()));

create policy private_events_select_own on public.private_events for select to authenticated using (user_id = (select auth.uid()));
create policy private_events_insert_own on public.private_events for insert to authenticated with check (user_id = (select auth.uid()));
create policy private_events_update_own on public.private_events for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy private_events_delete_own on public.private_events for delete to authenticated using (user_id = (select auth.uid()));

create policy calendar_overrides_select_own on public.calendar_overrides for select to authenticated using (user_id = (select auth.uid()));
create policy calendar_overrides_insert_own on public.calendar_overrides for insert to authenticated with check (user_id = (select auth.uid()));
create policy calendar_overrides_update_own on public.calendar_overrides for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy calendar_overrides_delete_own on public.calendar_overrides for delete to authenticated using (user_id = (select auth.uid()));
