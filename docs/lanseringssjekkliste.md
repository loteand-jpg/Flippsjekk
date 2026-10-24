# Lanseringssjekkliste – Flippsjekk

Denne filen er den autoritative sjekklisten for forhold som **må være avklart eller ferdigstilt før Flippsjekk åpnes for betalende brukere**.

Regel:
- Punkter fjernes ikke fordi de «ser ut til å virke».
- Et punkt merkes ferdig først når relevant kode, live-test og dokumentasjon støtter det.
- Midlertidige utviklingsregler skal stå her til de er erstattet.
- Nye lanseringskritiske funn legges til her fortløpende.

## 1. Tilgang, abonnement og betaling

- [ ] Velg og dokumenter betalings-/abonnementsleverandør for produksjon.
- [ ] Implementer serverstyrt abonnementstilstand i `subscriptions`; frontend skal ikke kunne gi seg selv tilgang.
- [ ] Betalingsretur i nettleseren skal aldri alene regnes som betalingsbekreftelse; abonnement aktiveres først etter verifisert serverside-hendelse/webhook.
- [ ] Webhooks må være signaturverifisert, idempotente og tåle gjentatte/ute-av-rekkefølge hendelser.
- [ ] Implementer serverstyrt tilgangskontroll for analyse, oppfriskning, scenariofunksjoner og kvoter.
- [ ] Erstatt fase-2B-regelen i `useEditAccess` som midlertidig tillater redigering når abonnementstjenesten er `not_configured`.
- [ ] Håndhev scenario-/forbruksgrenser på server/database der de er sikkerhets- eller abonnementsrelevante. Scenario-grensen på 10 er foreløpig bare klientstyrt.
- [ ] Definer administratorflyt for gratis/full tilgang, prøveperioder, kampanjer, refusjon, pause og manuelle overstyringer med audit-logg.
- [ ] Ingen adminrettigheter eller betalingsstatus skal kunne settes fra vanlig frontend.
- [ ] Test aktive, utløpte, kansellerte, restanse og ufullstendige abonnementer ende-til-ende.

## 2. Auth og konto

- [x] E-post-OTP fungerer live mot utviklings-Supabase.
- [x] Profil og vedvarende nettlesersesjon fungerer live.
- [ ] Konfigurer produksjons-Site URL / Redirect URLs når hosting er valgt.
- [ ] Vurder/konfigurer Google OAuth hvis dette skal være tilgjengelig ved lansering.
- [ ] Test utløpt/feil OTP, rate limits og misbruksscenarier.
- [ ] Vurder CAPTCHA/bot-beskyttelse før offentlig lansering.
- [ ] Bekreft e-postkapasitet/rate limits og produksjonsoppsett for Resend/Supabase Auth.
- [ ] Implementer trygg konto-/datasletting og dokumenter konsekvenser for aktive sesjoner.

## 3. Data, RLS og backend

- [x] Fase 1 databasegrunnmur og RLS live-verifisert.
- [x] Migrasjon 9 lukker klientens direkte INSERT til `user_properties`.
- [x] RLS-matrise fase 2B live: 228/228.
- [ ] Fullfør live nettlesertest av fase 2B og merge først etter godkjenning.
- [ ] Objekter skal opprettes via autorisert analysetjeneste/backend, aldri ved vilkårlig UUID fra klient.
- [ ] Låst «Nettsidens vurdering» skal opprettes/oppdateres serverstyrt.
- [ ] Separate utviklings-/test- og produksjonsmiljøer må være etablert før lansering.
- [ ] Backup/gjenoppretting og prosedyre for risikofylte migrasjoner må være dokumentert og prøvd.
- [ ] Alle fremtidige skjemaendringer skal være sporbare migrasjoner i GitHub.
- [ ] Genererte/validerte databasetyper og radmapping må holdes synkronisert med live skjema.
- [ ] Ytelse/paginering må vurderes med realistisk antall objekter per bruker.
- [ ] Realtime er ikke nødvendig for første lansering, men kryss-fane/enhet-adferd må være akseptabel og dokumentert.

## 4. Analyse, FINN og datakilder

- [ ] Avklar juridisk/kommersiell rett til å hente, lagre og gjenbruke FINN-/markedsdata.
- [ ] Implementer FINN-normalisering til én eiendomsidentitet.
- [ ] Implementer deduplisering av samtidige analyseforespørsler.
- [ ] Implementer analysejobber/kø med robust retry og idempotens.
- [ ] Implementer full analyseagent med versjonert kontrakt og validering.
- [ ] Implementer egne regler for lett oppfriskning av pris/visning/salgsstatus uten full reanalyse.
- [ ] Implementer markedsoppfriskning etter dokumentert policy.
- [ ] Bekreft at private dokumenter aldri automatisk blir del av fellesdatabasen.
- [ ] Verifiser at «ukjent» ikke blir 0 og at faktisk salg holdes adskilt fra prisantydning i hele produksjonsflyten.

## 5. Økonomi og produktregler

- [ ] Samme beregningsmotor skal brukes i objekt, oversikt, sammenligning og eksport.
- [ ] Kontroller fellesgjeld/totalpris/kjøpskostnader ende-til-ende med produksjonsdata.
- [ ] Kontroller fortjeneste før skatt, skatt, egeninnsats, prosjektavkastning og egenkapitalavkastning.
- [ ] Kontroller renter, avgifter, reserve og salgskostnader ved scenarioendringer.
- [ ] Kontroller lavt/normalt/høyt scenario, stresstest og modellert maksbud.
- [ ] Kontroller at minimum fortjeneste per egeninnsatstime bare begrenser maksbud og ikke definerer lønnsomhet isolert.
- [ ] Investorstandard (leilighet privat / hus AS) skal være redigerbar og lagres per bruker.

## 6. Drift, sikkerhet og personvern

- [ ] Velg og dokumenter hosting for frontend/backend/serverfunksjoner.
- [ ] Ingen `service_role`, betalingshemmeligheter, SMTP-nøkler eller andre secrets i frontend eller repository.
- [ ] Security Advisor og relevante ytelseskontroller kjøres før produksjonssetting.
- [ ] Logging/overvåking for Auth, betalingswebhooks, analysejobber og kritiske feil må være på plass.
- [ ] Definer support-/adminverktøy med minst mulig privilegium og audit-logg.
- [ ] Personvernerklæring, vilkår, datalagring og sletting må være avklart.
- [ ] Produksjonsdata må aldri blandes med demo-/utviklingsseed.
- [ ] Fjern/rydd fase-2B-testobjekter fra dev når de ikke lenger trengs.

## 7. Lanseringsgodkjenning

Før lansering skal vi kunne svare **ja** på alle disse:

- [ ] Kan en vanlig bruker aldri gi seg selv abonnement, kvote eller adminrettighet?
- [ ] Kan bruker A aldri lese eller endre bruker B sine private data?
- [ ] Kan betaling feile, gjentas eller komme forsinket uten feil tilgang?
- [ ] Kan analyse feile/retryes uten duplikate belastninger eller analyser?
- [ ] Er økonomien konsistent i alle visninger?
- [ ] Er alle datakilder lovlig og teknisk forsvarlig brukt?
- [ ] Har vi produksjonsmiljø, backup, logging og gjenopprettingsplan?
- [ ] Er alle midlertidige utviklingsregler enten fjernet eller eksplisitt godkjent for produksjon?
