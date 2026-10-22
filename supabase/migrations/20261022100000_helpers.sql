-- Flippsjekk backend fase 1, migrasjon 1/6: felles hjelpefunksjoner.
--
-- Begge funksjonene er vanlige trigger-funksjoner (SECURITY INVOKER). De gir ingen tilgang til noe og brukes bare av triggere
-- i de neste migrasjonene. EXECUTE tas bort fra klientrollene så de heller ikke kan kalles som RPC.

-- Setter updated_at ved hver endring. Klienten kan dermed aldri velge tidsstempelet selv.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Hindrer at bestemte kolonner endres etter opprettelse. Kolonnenavnene sendes som trigger-argumenter:
--   create trigger ... before update on t for each row execute function public.enforce_immutable_columns('user_id', 'property_id');
-- Brukes til eierskapsnøkler (eier og eiendom), slik at en rad aldri kan flyttes til en annen bruker eller eiendom.
create or replace function public.enforce_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Kolonnen % i % kan ikke endres etter opprettelse.', col, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_immutable_columns() from public, anon, authenticated;
