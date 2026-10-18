import type { ProfileDefaults } from '../domain/schemas';
import { DEFAULT_LABOR_MODES } from './defaultLabor';

/**
 * Standardforutsetninger for nye kontoer og demoprofiler.
 * Dette er redigerbare FORUTSETNINGER – ikke verifiserte markedsvilkår eller finansieringstilbud.
 *
 *  - Kjøpslånet er 90 % og oppussingslånet 0 % (egenkapital dekker oppussingen).
 *  - Løpende kostnader lånefinansieres ikke.
 *  - Egen tid er ikke en kostnad. Brukeren setter i stedet et lønnsomhetskrav: minimum ønsket fortjeneste
 *    per egeninnsatstime.
 *  - Salgskostnader er en enkel fast sum (120 000 kr). Meglerprovisjon i prosent finnes fortsatt i modellen og
 *    kan legges til per scenario.
 */
export const EXAMPLE_PROFILE_DEFAULTS: ProfileDefaults = {
  buyerTypeApartment: 'privat',
  buyerTypeHouse: 'as',
  months: 6,
  saleSettlementMonths: 3.5,
  interestPct: 6,
  purchaseFinancingPct: 90,
  renovationFinancingPct: 0,
  financeRunningCosts: false,
  availableEquity: 300_000,
  weeklyOwnHours: 10,
  minProfitPerOwnHour: 500,
  laborModes: { ...DEFAULT_LABOR_MODES },
  maxOwnWork: false,
  regulatedSelfWorkConfirmed: false,
  reservePct: 20,
  profitTarget: 400_000,
  saleFixedCost: 120_000,
  saleCommissionPct: 0,
  buyFees: 6_000,
  homeArea: 'Trondheim',
};

/** Nøytrale standarder for nye kontoer (samme standarder, uten historisk kjøpertypevalg). */
export const NEW_ACCOUNT_DEFAULTS: ProfileDefaults = {
  ...EXAMPLE_PROFILE_DEFAULTS,
  buyerTypeApartment: 'privat',
  buyerTypeHouse: 'privat',
};
