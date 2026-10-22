-- Flippsjekk backend fase 1, migrasjon 4/6: annonsefakta, analyser og visninger.
--
-- property_snapshots, felles analyser og viewings er FELLES data uten klientskriving.
-- Private (importerte) analyser er eieravgrenset og kan skrives av eieren, men aldri gjøres felles av klienten.

create table public.property_snapshots (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  version integer not null check (version > 0),
  observed_at timestamptz not null,
  fetched_at timestamptz not null,
  source_url text,
  origin text not null check (origin in ('demo', 'synthetic', 'import', 'source')),
  asking_price numeric(15, 2),
  shared_debt numeric(15, 2) check (shared_debt is null or shared_debt >= 0),
  -- Annonsens totalbeløp INKL. kjøpskostnader – ikke det samme som pris inkl. fellesgjeld.
  listing_total_incl_costs numeric(15, 2),
  monthly_common_costs numeric(15, 2),
  area_bra_i numeric(8, 2) check (area_bra_i is null or area_bra_i > 0),
  rooms integer check (rooms is null or rooms >= 0),
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  floor integer,
  build_year integer check (build_year is null or build_year between 1600 and 2100),
  plot_area numeric(10, 2) check (plot_area is null or plot_area > 0),
  sale_status text not null check (sale_status in ('aktiv', 'solgt', 'trukket', 'ukjent')),
  sale_status_note text,
  energy_label text,
  -- felt -> { status, sourceId, page?, note? }
  fact_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(fact_sources) = 'object'),
  constraint property_snapshots_property_version_key unique (property_id, version),
  -- Brukes av analyses for å sikre at snapshotet tilhører samme eiendom.
  constraint property_snapshots_id_property_key unique (id, property_id)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete restrict,
  snapshot_id uuid not null,
  version integer not null check (version > 0),
  schema_version integer not null check (schema_version > 0),
  model_version text not null check (length(model_version) > 0),
  status text not null check (status in ('published', 'superseded', 'draft')),
  -- shared = felles grunnanalyse (ingen eier). private = brukerens importerte utkast (alltid med eier).
  visibility text not null check (visibility in ('shared', 'private')),
  owner_id uuid references auth.users (id) on delete cascade,
  origin text not null check (origin in ('agent', 'demo', 'synthetic', 'import_v1')),
  analysis_kind text check (analysis_kind is null or analysis_kind in ('full', 'market_refresh')),
  derived_from_version integer check (derived_from_version is null or derived_from_version > 0),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  -- null = ikke vurdert; bare tillatt i private utkast og i felles analyser som ikke er publisert.
  recommendation text check (recommendation is null or recommendation in ('interessant', 'folg_med', 'avklar_forst', 'avsta')),
  recommendation_rationale text not null default '',
  summary text not null default '',
  strategy text not null default '',
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  -- Historisk salgsestimat, oppussingsalternativer, scenarier (basis + alternativer), scenariojakt m.m. (SharedAnalysis.estimates)
  estimates jsonb not null check (jsonb_typeof(estimates) = 'object'),
  risks jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array'),
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  comparables jsonb not null default '[]'::jsonb check (jsonb_typeof(comparables) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
  assumptions jsonb not null default '[]'::jsonb check (jsonb_typeof(assumptions) = 'array'),
  uncertainties jsonb not null default '[]'::jsonb check (jsonb_typeof(uncertainties) = 'array'),
  report jsonb not null default '[]'::jsonb check (jsonb_typeof(report) = 'array'),
  bid_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(bid_steps) = 'array'),
  next_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(next_steps) = 'array'),
  raw_import jsonb,
  unmapped_fields jsonb check (unmapped_fields is null or jsonb_typeof(unmapped_fields) = 'object'),
  history jsonb check (history is null or jsonb_typeof(history) = 'object'),
  -- Snapshotet må tilhøre samme eiendom som analysen.
  constraint analyses_snapshot_fk foreign key (snapshot_id, property_id) references public.property_snapshots (id, property_id),
  -- Brukes av scenarios for å sikre at scenarioets eiendom er den samme som analysens.
  constraint analyses_id_property_key unique (id, property_id),
  constraint analyses_visibility_owner_check check (
    (visibility = 'shared' and owner_id is null) or (visibility = 'private' and owner_id is not null)
  ),
  constraint analyses_recommendation_required check (
    visibility = 'private' or status = 'draft' or recommendation is not null
  ),
  -- Et privat utkast hører til en bolig i eierens egen liste, og forsvinner når boligen fjernes fra listen
  -- (som removeMine i mocklaget). For felles analyser (owner_id null) sjekkes ingenting (MATCH SIMPLE).
  constraint analyses_owner_property_fk foreign key (owner_id, property_id)
    references public.user_properties (user_id, property_id) on delete cascade
);

-- Én versjon per eiendom for felles analyser (publiserte, erstattede og utkast).
create unique index analyses_shared_version_key on public.analyses (property_id, version) where visibility = 'shared';
create index analyses_property_id_idx on public.analyses (property_id);
create index analyses_owner_property_idx on public.analyses (owner_id, property_id);
create index analyses_snapshot_idx on public.analyses (snapshot_id, property_id);

create table public.viewings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null default 'official' check (kind = 'official'),
  -- start/end i domenemodellen; «end» er et reservert ord i SQL.
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null check (status in ('planlagt', 'avlyst')),
  source_id text,
  source_label text not null default '',
  verified_at timestamptz not null,
  -- En flyttet visning lagres som avlyst gammel rad og ny rad som peker tilbake hit.
  replaces_viewing_id uuid references public.viewings (id) on delete set null,
  note text,
  constraint viewings_end_after_start check (end_at is null or end_at >= start_at)
);

create index viewings_property_start_idx on public.viewings (property_id, start_at);
create index viewings_replaces_idx on public.viewings (replaces_viewing_id);

-- ---------------------------------------------------------------------------
-- Publiserte felles analyser er uforanderlige («ny kunnskap gir ny versjon»)
-- ---------------------------------------------------------------------------
-- Gjelder alle roller, også backend. Eneste tillatte endring etter publisering er published -> superseded.
-- Utkast (draft) og private analyser kan endres fritt.
create or replace function public.guard_published_analysis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.visibility = 'shared' and old.status in ('published', 'superseded') then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'En publisert felles analyse kan ikke endres. Publiser en ny versjon i stedet.'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (old.status = 'published' and new.status = 'superseded') then
      raise exception 'En felles analyse kan bare gå fra published til superseded.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_published_analysis() from public, anon, authenticated;

create trigger analyses_guard_published
  before update on public.analyses
  for each row execute function public.guard_published_analysis();

-- En privat analyse kan ikke bytte eier, eiendom eller synlighet (den kan aldri «bli felles»).
create trigger analyses_immutable_keys
  before update on public.analyses
  for each row execute function public.enforce_immutable_columns('property_id', 'visibility', 'owner_id');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_snapshots enable row level security;
alter table public.analyses enable row level security;
alter table public.viewings enable row level security;

revoke all on table public.property_snapshots from anon, authenticated;
revoke all on table public.analyses from anon, authenticated;
revoke all on table public.viewings from anon, authenticated;

grant select on table public.property_snapshots to authenticated;
grant select on table public.viewings to authenticated;
-- analyses: lesing, og skriving av EGNE private utkast (policyene under avviser alt annet).
grant select on table public.analyses to authenticated;
grant insert, update, delete on table public.analyses to authenticated;

create policy property_snapshots_select_member on public.property_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.user_properties up
      where up.property_id = property_snapshots.property_id and up.user_id = (select auth.uid())
    )
  );

create policy viewings_select_member on public.viewings
  for select to authenticated
  using (
    exists (
      select 1 from public.user_properties up
      where up.property_id = viewings.property_id and up.user_id = (select auth.uid())
    )
  );

-- Felles analyser (ikke utkast) for bolig i egen liste, og egne private analyser.
create policy analyses_select on public.analyses
  for select to authenticated
  using (
    (
      visibility = 'shared'
      and status <> 'draft'
      and exists (
        select 1 from public.user_properties up
        where up.property_id = analyses.property_id and up.user_id = (select auth.uid())
      )
    )
    or (visibility = 'private' and owner_id = (select auth.uid()))
  );

-- Skriving: bare private rader med innlogget bruker som eier. Felles analyser kan klienten aldri skrive.
create policy analyses_insert_own_private on public.analyses
  for insert to authenticated
  with check (visibility = 'private' and owner_id = (select auth.uid()));

create policy analyses_update_own_private on public.analyses
  for update to authenticated
  using (visibility = 'private' and owner_id = (select auth.uid()))
  with check (visibility = 'private' and owner_id = (select auth.uid()));

create policy analyses_delete_own_private on public.analyses
  for delete to authenticated
  using (visibility = 'private' and owner_id = (select auth.uid()));
