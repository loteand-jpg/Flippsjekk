-- Flippsjekk backend fase 1, migrasjon 3/6: eiendommer (felles) og brukerens liste (privat).
--
-- properties er FELLES data: klienten kan bare lese, og bare eiendommer som ligger i egen liste (user_properties).
-- Skriving skjer senere fra autorisert backend (service-rolle). Se docs/supabase.md for hvorfor lesing er begrenset til egen liste.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  -- Appens Zod-skjema godtar 6–12 sifre (docs/datamodell.md foreslo ^[1-9][0-9]{5,11}$; vi følger koden som faktisk brukes).
  finn_id text not null unique check (finn_id ~ '^[0-9]{6,12}$'),
  canonical_url text not null check (canonical_url ~* '^https?://'),
  address text not null check (length(btrim(address)) > 0),
  postal_code text,
  city text not null check (length(btrim(city)) > 0),
  district text,
  municipality text not null check (length(btrim(municipality)) > 0),
  country_code text not null default 'NO' check (country_code = 'NO'),
  property_type text not null check (property_type in ('leilighet', 'rekkehus', 'tomannsbolig', 'enebolig')),
  tenure text not null check (tenure in ('selveier', 'borettslag', 'aksje', 'obligasjon', 'ukjent')),
  -- demo = fiktivt seed-objekt, synthetic = generert fra ukjent FINN-ID, import = kun identitet fra import, source = fra datakilde
  data_origin text not null check (data_origin in ('demo', 'synthetic', 'import', 'source')),
  created_at timestamptz not null default now()
);

create table public.user_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete restrict,
  favorite boolean not null default false,
  work_status text not null default 'vurderes' check (work_status in ('vurderes', 'visning_planlagt', 'bud_vurderes', 'avvist', 'kjopt')),
  notes text not null default '' check (length(notes) <= 5000),
  -- Må peke på brukerens EGET scenario for SAMME eiendom. Håndheves av en sammensatt fremmednøkkel (legges til i migrasjon 5).
  primary_scenario_id uuid,
  label text check (label is null or length(label) <= 200),
  archived_at timestamptz,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Settes av backend når brukerens analyse er ferdig (ikke skrivbar fra klienten).
  analyzed_at timestamptz,
  last_seen_analysis_version integer check (last_seen_analysis_version is null or last_seen_analysis_version > 0),
  -- Brukerens private avkrysninger: sjekklistenøkkel -> { confirmedAt, note }. Endrer aldri kildestatus i felles analyse.
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object' and pg_column_size(checks) <= 65536),
  constraint user_properties_user_property_key unique (user_id, property_id)
);

create index user_properties_property_id_idx on public.user_properties (property_id);

create trigger user_properties_set_updated_at
  before update on public.user_properties
  for each row execute function public.set_updated_at();

create trigger user_properties_immutable
  before update on public.user_properties
  for each row execute function public.enforce_immutable_columns('user_id', 'property_id', 'added_at');

-- ---------------------------------------------------------------------------
-- RLS: properties (felles, kun lesing for medlemmer)
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;

revoke all on table public.properties from anon, authenticated;
grant select on table public.properties to authenticated;

create policy properties_select_member on public.properties
  for select to authenticated
  using (
    exists (
      select 1 from public.user_properties up
      where up.property_id = properties.id and up.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: user_properties (privat, eier)
-- ---------------------------------------------------------------------------
alter table public.user_properties enable row level security;

revoke all on table public.user_properties from anon, authenticated;
grant select, delete on table public.user_properties to authenticated;
-- Klienten velger ikke id, bruker, tidsstempler eller analyzed_at. user_id får alltid default auth.uid().
grant insert (property_id, favorite, work_status, notes, label, last_seen_analysis_version, checks) on table public.user_properties to authenticated;
grant update (favorite, work_status, notes, primary_scenario_id, label, archived_at, last_seen_analysis_version, checks) on table public.user_properties to authenticated;

create policy user_properties_select_own on public.user_properties
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_properties_insert_own on public.user_properties
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_properties_update_own on public.user_properties
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_properties_delete_own on public.user_properties
  for delete to authenticated
  using (user_id = (select auth.uid()));
