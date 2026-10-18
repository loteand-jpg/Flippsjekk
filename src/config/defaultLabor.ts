import type { LaborCategory, WorkMode } from '../domain/enums';

/**
 * Standard for hvem som utfører hvilket arbeid. Redigerbar i profilen – dette er en forutsetning, ikke en
 * vurdering av hva brukeren faktisk kan. Regulert arbeid (rør, elektro, bad/våtrom) er innleid som standard.
 */
export const DEFAULT_LABOR_MODES: Record<LaborCategory, WorkMode> = {
  riving: 'selv',
  maling_sparkling: 'selv',
  gulv: 'delvis',
  tomrer: 'innleid',
  kjokkenmontering: 'delvis',
  ror: 'innleid',
  elektro: 'innleid',
  bad_vatrom: 'innleid',
  annet: 'innleid',
};
