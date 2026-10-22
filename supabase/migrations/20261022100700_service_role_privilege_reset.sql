-- Flippsjekk backend fase 1, migrasjon 8: normaliser service_role-rettigheter (REVOKE før GRANT) og gjør nye tabeller deny-by-default.
--
-- Bakgrunn (observert ved faktisk Supabase-verifisering av migrasjon 7, rapportert av ChatGPT; Claude har ikke selv tilgang): service_role hadde
-- i det hostede prosjektet allerede flere tabellrettigheter enn migrasjon 7 ønsker, bl.a. TRUNCATE (og REFERENCES/TRIGGER). RLS-matrisen var
-- 202/204 grønn; testene «0.8 service_role har nøyaktig de bestemte tabellrettighetene» og «8.20 backend kan ikke TRUNCATE» feilet.
-- Et GRANT legger bare til rettigheter og fjerner aldri eksisterende, så migrasjon 7 alene ga ikke den rettighetsmodellen vi har bestemt.
-- Mest sannsynlig kommer slike rettigheter fra Supabases standardrettigheter (default privileges) på nye tabeller i public; det er ikke
-- bekreftet av Claude, og modellen under er laget slik at den ikke avhenger av hvor de kommer fra.
--
-- Derfor her: først REVOKE ALL på alle 15 tabeller for service_role, deretter nøyaktig de rettighetene som er bestemt (identiske med migrasjon 7).
-- Resultatet er deterministisk uansett hvilke rettigheter service_role hadde fra før. Dette er en least-privilege-beslutning.
-- Migrasjon 1–7 er anvendt og urørt. Klientrollene (anon, authenticated), policyer, funksjoner og triggere er uendret, og
-- public.rls_auto_enable() (Supabase sin egen) berøres ikke.

-- 1. REVOKE ALL (fjerner også kolonnerettigheter) for service_role på alle Flippsjekk-tabeller.
revoke all privileges on table
  public.profiles,
  public.properties,
  public.property_snapshots,
  public.analyses,
  public.viewings,
  public.user_properties,
  public.scenarios,
  public.user_comparables,
  public.user_risks,
  public.private_events,
  public.calendar_overrides,
  public.subscriptions,
  public.course_purchases,
  public.usage_events,
  public.analysis_jobs
from service_role;

-- 2. Eksplisitte rettigheter tilbake – samme modell som migrasjon 7 (begrunnelse per tabell står der).
--    Aldri: TRUNCATE, REFERENCES, TRIGGER. Regnskap og betalingshistorikk (usage_events, course_purchases, subscriptions) kan ikke slettes.
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

-- 3. Schema public: service_role skal kunne bruke objektene, men ikke opprette dem. Vanlig applikasjons-backend oppretter ikke skjemaobjekter
--    dynamisk; DDL skjer gjennom migrasjoner. CREATE fjernes (hvis det finnes) og USAGE gis eksplisitt.
revoke create on schema public from service_role;
grant usage on schema public to service_role;

-- 4. Standardrettigheter for FREMTIDIGE tabeller: deny-by-default.
--    Punkt 1–3 retter de eksisterende tabellene. Dette punktet hindrer at samme avvik oppstår på nye tabeller: standardrettigheter som Supabase
--    gir anon, authenticated og service_role på nye tabeller i public (ALTER DEFAULT PRIVILEGES … GRANT … ON TABLES) fjernes for tabeller som
--    migrasjonsrollen postgres oppretter i public. En ny Flippsjekk-tabell har da ingen rettigheter for disse rollene før migrasjonen som
--    oppretter den gir dem eksplisitt (som migrasjon 1–8 gjør).
--
--    Konsekvenser, vurdert:
--      * Bare TABELLER i schema public som opprettes av postgres. Eksisterende tabeller, sekvenser og funksjoner, og objekter opprettet av andre
--        roller (f.eks. supabase_admin), påvirkes ikke. Ingen eksisterende rettighet endres av dette punktet.
--      * Flippsjekks migrasjoner gir allerede eksplisitte grants (og REVOKE) per tabell, så ingenting i dem er avhengig av standardene.
--      * Tabeller opprettet manuelt i Dashboard (som postgres) blir ikke automatisk tilgjengelige via Data API. Det er ønsket: rettigheter gis
--        eksplisitt i en migrasjon.
--      * RLS slås fortsatt på automatisk av event-triggeren ensure_rls; migrasjonene aktiverer RLS eksplisitt uansett.
--      * Gjelder bare standardrettigheter som er satt FOR ROLE postgres IN SCHEMA public. Hvis et prosjekt har en global standard
--        (uten IN SCHEMA) som gir slike rettigheter, fjernes den ikke av dette punktet; RLS-matrisens test 0.16 oppretter da en prøvetabell og
--        feiler, slik at det ikke går ubemerket.
--      * Standard EXECUTE for PUBLIC på nye funksjoner og standardrettigheter på sekvenser er IKKE endret (utenfor denne korrekturen).
alter default privileges for role postgres in schema public revoke all on tables from service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
