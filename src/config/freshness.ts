/**
 * Ferskhetsgrenser for gjenbruk. Konfigurerbare – sett per marked senere.
 *  - Volatile annonseopplysninger (pris, visninger, salgsstatus) foreldes raskt → lett oppfrisking.
 *  - Markedsdata (salgsverdi, referanser, områdeprofil) foreldes saktere → grundig markedsoppfriskning etter 30 dager.
 *  - Teknisk grunnanalyse (dokumenter, juridisk, oppussingsbehov) reanalyseres bare ved nye dokumenter, endrede kritiske fakta
 *    eller inkompatibel modell – aldri bare fordi tiden har gått (se `domain/refreshPolicy.ts`).
 */
export const FRESHNESS = {
  volatileMaxAgeHours: 24,
  /** Eldre enn dette utløser grundig markedsoppfriskning (ikke full teknisk analyse). */
  marketRefreshAfterDays: 30,
  compatibleSchemaVersions: [1] as number[],
  /** Kalkylemodellversjoner som kan bruke analysen uten reanalyse (semver major). */
  compatibleModelMajor: 1,
};

/** Simuleringsparametere for demoens analysejobber. */
export const DEMO_JOB = {
  stepDurationMs: 1100,
  refreshStepDurationMs: 700,
  fullSteps: ['Henter annonse', 'Kontrollerer grunnlag', 'Vurderer oppussing', 'Vurderer salgsverdi', 'Klargjør analyse'],
  refreshSteps: ['Henter annonse', 'Oppdaterer pris, visninger og salgsstatus'],
  marketRefreshSteps: ['Henter annonse', 'Oppdaterer visninger og salgsstatus', 'Oppdaterer markedsreferanser', 'Beregner salgsverdi per scenario', 'Kjører økonomimotoren'],
};
