-- Flippsjekk backend fase 1, migrasjon 7: eksplisitte rettigheter til service_role, og lukket EXECUTE på rls_auto_enable().
--
-- Bakgrunn (funnet ved faktisk Supabase-verifisering): det hostede Supabase gir ikke garantert service_role rettigheter på nye tabeller i
-- public. Migrasjon 1–6 definerer eksplisitt rettighetene til anon og authenticated, men stolte på Supabase-standarder for service_role.
-- Det skal ikke være slik: GitHub er autoritativ for rettigheter også. Denne migrasjonen er den eneste endringen; migrasjon 1–6 er urørt.
--
-- service_role er backend-rollen (Vipps-webhooks, analysearbeider, serverfunksjoner). Den omgår RLS, men GRANT, fremmednøkler,
-- check-constraints, unike indekser og triggere (uforanderlige analyser, låste scenarioer m.m.) gjelder fortsatt – og skal gjøre det.
-- Rettighetene under er det planlagte backendbruket krever, ikke ALL:
--
--   tabell               service_role     begrunnelse
--   profiles             SELECT INSERT UPDATE          opprettes av trigger; backend leser, reparerer og endrer. Slettes via cascade fra auth.users.
--   properties           SELECT INSERT UPDATE DELETE   felles; backend oppretter og vedlikeholder, og rydder bort solgte objekter.
--   property_snapshots   SELECT INSERT UPDATE          versjonerte annonsefakta; ingen eksplisitt sletting (følger eiendommen via cascade).
--   analyses             SELECT INSERT UPDATE DELETE   publisering, published -> superseded, utkast og opprydding. (Publiserte er uforanderlige via trigger.)
--   viewings             SELECT INSERT UPDATE DELETE   nye, avlyste og flyttede visninger, og opprydding.
--   user_properties      SELECT INSERT UPDATE DELETE   «legg til bolig» fra serverfunksjon, analyzed_at, vedlikehold.
--   scenarios            SELECT INSERT UPDATE DELETE   systemet oppretter og flytter låste scenarioer (som klienten ikke kan røre).
--   user_comparables, user_risks, private_events, calendar_overrides
--                        SELECT INSERT UPDATE DELETE   privat import og eksport, support og vedlikehold (kontosletting går via cascade).
--   subscriptions        SELECT INSERT UPDATE          Vipps-webhook oppretter og oppdaterer status. Ingen sletting: betalingshistorikk beholdes.
--   course_purchases     SELECT INSERT                 webhook registrerer kjøp idempotent. Et registrert kjøp endres ikke (legg til UPDATE hvis refusjon senere trenger status).
--   usage_events         SELECT INSERT                 forbruksregnskap er append-only. Ingen UPDATE/DELETE.
--   analysis_jobs        SELECT INSERT UPDATE DELETE   køen: opprette, oppdatere fremdrift og status, rydde gamle jobber.
--
-- Aldri gitt: TRUNCATE, REFERENCES, TRIGGER. Sekvenser trengs ikke (alle ID-er er uuid med gen_random_uuid(), ingen serial/identity).
-- Funksjoner trenger ingen EXECUTE-grant til service_role: Flippsjekks funksjoner er bare trigger-funksjoner, og en trigger krever ikke
-- EXECUTE for den som utløser den. Ingenting her gjør noe bredere for anon eller authenticated.

grant usage on schema public to service_role;

grant select, insert, update on table public.profiles to service_role;
grant select, insert, update, delete on table public.properties to service_role;
grant select, insert, update on table public.property_snapshots to service_role;
grant select, insert, update, delete on table public.analyses to service_role;
grant select, insert, update, delete on table public.viewings to service_role;
grant select, insert, update, delete on table public.user_properties to service_role;
grant select, insert, update, delete on table public.scenarios to service_role;
grant select, insert, update, delete on table public.user_comparables to service_role;
grant select, insert, update, delete on table public.user_risks to service_role;
grant select, insert, update, delete on table public.private_events to service_role;
grant select, insert, update, delete on table public.calendar_overrides to service_role;
grant select, insert, update on table public.subscriptions to service_role;
grant select, insert on table public.course_purchases to service_role;
grant select, insert on table public.usage_events to service_role;
grant select, insert, update, delete on table public.analysis_jobs to service_role;

-- ---------------------------------------------------------------------------
-- public.rls_auto_enable()
-- ---------------------------------------------------------------------------
-- Dette er IKKE en Flippsjekk-funksjon. Den finnes i det hostede Supabase-prosjektet (SECURITY DEFINER, eid av postgres) og brukes av
-- event-triggeren ensure_rls til å slå på RLS for nye tabeller i public. Den har standard EXECUTE for PUBLIC, så anon og authenticated kunne
-- kalt den som RPC (Supabase Security Advisor). Her lukkes EXECUTE for klientrollene. Funksjonen, kroppen og event-triggeren røres ikke.
-- Betinget: migrasjonen skal også kunne kjøres der funksjonen ikke finnes (lokal utvikling, andre prosjekter).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
