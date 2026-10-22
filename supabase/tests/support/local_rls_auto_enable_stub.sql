-- ADVARSEL: KUN for lokal testing (PGlite). Aldri i Supabase.
--
-- Etterligner (omtrentlig, ikke ordrett) funksjonen public.rls_auto_enable() og event-triggeren ensure_rls som finnes i det hostede
-- Flippsjekk Supabase-prosjektet, men ikke i en vanlig Postgres. Funksjonen er SECURITY DEFINER og har standard EXECUTE for PUBLIC, og er
-- bare til stede for å teste at migrasjon 7 lukker EXECUTE for klientrollene uten å røre funksjonen, kroppen eller event-triggeren.
-- Lastes etter local_supabase_stub.sql og FØR migrasjonene.

create function public.rls_auto_enable() returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      execute format('alter table if exists %s enable row level security', cmd.object_identity);
    end if;
  end loop;
end;
$$;

create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
