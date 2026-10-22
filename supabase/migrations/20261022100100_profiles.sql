-- Flippsjekk backend fase 1, migrasjon 2/6: profiler.
--
-- profiles.user_id = auth.users.id. Raden opprettes av en trigger når brukeren opprettes i Supabase Auth, og klienten kan verken
-- opprette eller slette profiler. Brukeren kan lese sin egen profil og endre visningsnavn og standardforutsetninger.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  -- Kopi av e-posten i Auth (for visning). Vedlikeholdes av triggere, aldri av klienten.
  email text not null default '',
  -- ProfileDefaultsSchema (jsonb). null = brukeren har ikke tilpasset noe ennå; appen bruker da NEW_ACCOUNT_DEFAULTS.
  defaults jsonb check (defaults is null or (jsonb_typeof(defaults) = 'object' and pg_column_size(defaults) <= 16384)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_immutable
  before update on public.profiles
  for each row execute function public.enforce_immutable_columns('user_id', 'created_at');

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, defaults) on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ingen insert- eller delete-policy: profiler opprettes av triggeren under og slettes via cascade fra auth.users.

-- ---------------------------------------------------------------------------
-- Profil ved ny bruker (og synkronisering av e-post)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER er nødvendig her: rollen som oppretter auth.users-raden (supabase_auth_admin) har ingen rettigheter på
-- public.profiles. Funksjonen gjør bare to ting (sette inn og oppdatere profilraden til samme bruker), har tom search_path
-- (alt er skjemakvalifisert), og EXECUTE er tatt fra alle klientroller, så den bare kan kjøres av triggeren.
-- Visningsnavnet hentes fra metadata (Google leverer «full_name»/«name»). Metadata kan redigeres av brukeren og brukes
-- bare til visning – aldri til tilgangsstyring.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Bruker'
      ),
      200
    ),
    coalesce(new.email, '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where user_id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Engangs-etterfylling for brukere som finnes fra før (f.eks. testbrukere opprettet før denne migrasjonen).
insert into public.profiles (user_id, display_name, email)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Bruker'
    ),
    200
  ),
  coalesce(u.email, '')
from auth.users u
on conflict (user_id) do nothing;
