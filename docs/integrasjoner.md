# Integrasjoner som gjenstår før kommersiell lansering

Brukergrensesnittet kjenner bare tjenestegrensesnittene i [src/services/types.ts](../src/services/types.ts). Produksjonsbackend kobles på ved å implementere de samme grensesnittene og velge dem i `createAppServices` ([src/app/services.tsx](../src/app/services.tsx)), uten å bygge grensesnittet på nytt. I produksjonsmodus (`VITE_FLIPPROM_MODE=production`) brukes ingen mocktjenester og ingen testkontroller. Appen viser «Produksjonsbackend er ikke koblet til» til den nye implementasjonen er på plass.

## Status: mock nå, produksjon senere

| Område | Implementert nå (mock/demo) | Gjenstår for produksjon |
|---|---|---|
| **Auth** (`AuthService`) | Innlogging med **Google** (simulert kontovelger) eller **e-post med 6-sifret engangskode** (koden vises i en simulert e-post på skjermen). Ingen passord. Kode gyldig i 10 minutter, maks 5 feil forsøk, 30 s mellom nye koder og maks 5 koder per 15 min. Konto opprettes første gang. Testprofiler hopper over koden. Utlogging og beskyttede ruter. | Supabase Auth med Google OAuth og e-post-OTP (engangskode), ekte e-postutsending, rate limiting på serveren, sesjonsfornying. **Senere:** Vipps-innlogging, mobilnummer (SMS-kode) og Apple – legges til som flere metoder bak samme `AuthService`. |
| **Database og tilgang** | Versjonert localStorage-database med migrering, radvalidering, sikkerhetskopi ved skade og atomiske transaksjoner. Eiersjekker i mocklaget, også for refererte objekter. | Supabase Postgres med skjema og RLS ([datamodell.md](datamodell.md)). Felles tabeller skrives bare med service-rolle. Private rader eieravgrenses. Trigger/sjekk for `primary_scenario_id`. Mocklagets sjekker i nettleseren er **ikke sikkerhet**. |
| **Abonnement** (`SubscriptionService`) | Betaling med **Vipps**: velg månedlig (200 kr) eller årlig (2 000 kr), oppgi mobilnummer og godkjenn betalingsavtalen i en simulert Vipps-app. Kampanje: første måned gratis for nye abonnenter. Tilstander: aktivt, prøveperiode, oppsagt ved periodeslutt, betalingsproblem, utløpt, ingen. Tilgang gis først når avtalen er godkjent. | Vipps Recurring (betalingsavtaler): backend oppretter avtalen (`agreement`) og sender brukeren til Vipps; trekk (`charge`) opprettes ved hver periode. Signerte webhooks behandlet idempotent oppdaterer `subscriptions`. Retur fra Vipps er aldri bevis på betaling. Hemmelige nøkler bare på serveren. |
| **Kvoter og forbruk** | Separate `usage_events` for ny analyse, oppfrisking og gjenbruk med idempotensnøkkel. Belastning først ved vellykket publisering. Deduplisering av jobber. | Håndheves i database/edge function ved jobbopprettelse (låsing eller unik indeks på aktiv `dedupe_key`), ikke i klienten. |
| **Analyseagent** (`AnalysisService`) | Tidsbasert jobbsimulator med fem steg. Mockagent som leverer på [agentkontrakten](agentkontrakt.md). Kontraktvalidering, publiseringskontroll, atomisk publisering, feil og retry. | Ekte agent (kø/worker) som leverer kontrakt-JSON. Jobbtabell med status og fremdrift (Realtime). Tidsavbrudd og nye forsøk. Overvåking. |
| **Datakilde** | Ingen nettverkskall. Alle objekter er fiktive eller syntetiske og merket som demodata. | Avklart og dokumentert rett til å hente, lagre og gjenbruke annonsedata (avtale eller lisens med FINN eller annen kilde). Vilkår for felles cache mellom abonnenter. Personvernvurdering (DPIA) for lagring av megler- og selgeropplysninger. |
| **Kalender** (`CalendarService`) | Visninger, avledet buddag, privat overstyring, private visninger og .ics-eksport med stabile UID-er og Oslo-tidssone. | Eventuelt abonnerbar kalender-URL (signert token per bruker) |
| **Import/eksport** (`ImportService`) | v1-adapter med forhåndsvisning, private utkast og eksport av scenarioer. | Autorisert publisering av importerte analyser (redaksjonell flyt), hvis ønsket |
| **Drift** | Statisk bygg (`dist/`) | Miljøvariabler, feillogging (Sentry e.l.), analyse av bruk, sikkerhetskopiering, vilkår og personvernerklæring |

## Rekkefølge mot lansering

1. Supabase-prosjekt: skjema, RLS og tester av policyene (inkludert at bruker B ikke kan lese eller endre As scenarioer, slik `services.test.ts` viser for mocken).
2. `SupabaseAuthService`, `SupabasePropertyRepository`, `SupabaseScenarioRepository`, `SupabaseCalendarService` og `SupabaseImportService` mot samme grensesnitt. `DataEvents` via Supabase Realtime.
3. Vipps Recurring: avtaler og trekk (pris fastsettes forretningsmessig – dagens tall er eksempler). Endepunkt som oppretter avtale, webhook-endepunkt som oppdaterer `subscriptions`, og oppsigelse/endring av avtalen. Fjern `services.demo.billing` og `services.demo.vipps`.
4. Jobbkø og agent bak `AnalysisService.requestAnalysis`, med kvote og deduplisering i databasen.
5. Juridisk avklaring av datakilde og vilkår før data fra ekte annonser vises for betalende kunder.

## Sikkerhetsprinsipper som må holde i produksjon

- Felles data skrives bare av autorisert backend eller agent. Abonnenter får bare lesetilgang.
- Private rader eieravgrenses i databasen, inkludert kontroll av eierskap for refererte objekter (scenario → eiendom i egen liste → lesbar analyse for samme eiendom).
- Abonnementsstatus og kvoter håndheves på serveren.
- Ingen hemmelige nøkler i frontend. Ingen URL-parameter eller localStorage-verdi gir tilgang.
- Private dokumenter og kommentarer blir aldri del av en felles analyse.
