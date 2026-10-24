-- Flippsjekk backend fase 2B, migrasjon 9: brukerens liste (user_properties) kan bare opprettes av backend.
--
-- Kjent åpen vei i fase 1 (dokumentert i docs/supabase.md og matrisetest 3.13): en innlogget bruker som kjente UUID-en til en eiendom
-- kunne selv sette inn en rad i user_properties. Fremmednøkkelen property_id sjekkes uten RLS, så innsettingen lyktes for en vilkårlig
-- eksisterende eiendom, og siden alle felles lesepolicyer (properties, property_snapshots, viewings, analyses) bygger på medlemskap i egen
-- liste (user_properties), ga det lesetilgang til felles eiendomsdata – uavhengig av abonnement og uten at boligen noen gang var analysert
-- for brukeren. UUID-er kan ikke listes opp, men de er heller ikke hemmeligheter.
--
-- Løsning: medlemskap (en rad i user_properties) opprettes bare av backend, med service_role, som allerede har INSERT på tabellen (migrasjon 8).
-- Det er den samme veien analysetjenesten senere vil bruke når en bruker ber om en analyse (FINN-lenke → eiendom → analyse → kobling til
-- brukerens liste, med abonnements- og kvotesjekk). Det finnes ingen klientflyt som trenger å opprette rader før den tjenesten finnes, og en RPC
-- som tok imot en vilkårlig UUID fra klienten ville bare flyttet det samme hullet, så ingen RPC innføres her.
--
-- To sperrer, slik at en senere utilsiktet GRANT alene ikke åpner veien igjen:
--   1. INSERT tas fra authenticated (tabellnivå – fjerner også kolonnerettighetene fra migrasjon 3).
--   2. Insert-policyen droppes (RLS uten policy avviser INSERT).
--
-- Uendret: authenticated kan fortsatt lese egne rader, oppdatere de bestemte kolonnene (favoritt, arbeidsstatus, notater, primært scenario,
-- arkivering m.m.) og slette egne rader («fjern fra min liste»). Scenarioer, egne referanser, risikoer og private utkast krever fortsatt
-- en rad i user_properties via sammensatte fremmednøkler, så de kan heller ikke brukes til å få medlemskap. anon har fortsatt ingenting.

revoke insert on table public.user_properties from authenticated;

drop policy if exists user_properties_insert_own on public.user_properties;
