/**
 * Ferskhetsgrenser for gjenbruk. Konfigurerbare – sett per marked senere.
 *  - Volatile annonseopplysninger (pris, visninger, salgsstatus) foreldes raskt → lett oppfrisking.
 *  - Faglig grunnanalyse (oppussing, salgsverdi, risiko) foreldes saktere → full reanalyse.
 */
export const FRESHNESS = {
  volatileMaxAgeHours: 24,
  analysisMaxAgeDays: 30,
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
};
