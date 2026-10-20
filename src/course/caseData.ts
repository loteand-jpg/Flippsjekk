import { scenarioModelDefaults } from '../domain/migrate';
import type { ScenarioValues } from '../domain/schemas';

/** Tomt utgangspunkt: alle tall er uavklart (null), aldri 0. */
export const EMPTY_CALC: ScenarioValues = {
  ...scenarioModelDefaults(),
  buyerType: 'privat',
  purchasePrice: null,
  debtAtPurchase: null,
  debtAtSale: null,
  dutyBasis: 'kjopesum_pluss_fellesgjeld',
  dutyPct: 2.5,
  dutyCustomBase: null,
  buyFees: null,
  renovationMode: 'rundsum',
  renovationOptionId: null,
  renovationItems: [],
  renovationLumpSum: null,
  lumpSumHours: null,
  vatIncluded: true,
  reservePct: 20,
  months: null,
  monthlyCost: null,
  interestPct: null,
  purchaseFinancingPct: null,
  renovationFinancingPct: null,
  saleBasis: 'kontant',
  saleLow: null,
  saleBase: null,
  saleHigh: null,
  saleFixedCost: null,
  saleCommissionPct: null,
  hourValue: null,
  profitTarget: null,
  taxMode: 'uavklart',
  taxPct: null,
  startBid: null,
  walkAway: null,
  notes: '',
};

/** Case A – 54 m² selveier i Trondheim. ALLE TALL ER FIKTIVE. */
export const CASE_A: ScenarioValues = {
  ...scenarioModelDefaults(),
  ...EMPTY_CALC,
  purchasePrice: 3_000_000,
  debtAtPurchase: 0,
  debtAtSale: 0,
  dutyBasis: 'kjopesum_pluss_fellesgjeld',
  dutyPct: 2.5,
  buyFees: 2_000,
  renovationLumpSum: 220_000,
  lumpSumHours: 250,
  reservePct: 20,
  months: 6,
  monthlyCost: 5_000,
  interestPct: 5.8,
  purchaseFinancingPct: 90,
  renovationFinancingPct: 90,
  saleBasis: 'kontant',
  saleLow: 3_300_000,
  saleBase: 3_500_000,
  saleHigh: 3_800_000,
  saleFixedCost: 80_000,
  saleCommissionPct: 1.5,
  hourValue: 350,
  profitTarget: 400_000,
};

/** Case B – billig borettslagsleilighet? Bare tallene fra kurset. Resten er uavklart. */
export const CASE_B: ScenarioValues = {
  ...scenarioModelDefaults(),
  ...EMPTY_CALC,
  purchasePrice: 2_200_000,
  debtAtPurchase: 800_000,
  debtAtSale: 800_000,
  dutyBasis: 'ingen',
  dutyPct: 0,
  renovationLumpSum: 180_000,
  saleBasis: 'total',
};

/**
 * Case C – huset med den dyre grunnmuren. Kjøp, interiøroppussing og antatt salg er fra kurset.
 * Rente, finansiering og salgskostnader er EKSEMPELINNSTILLINGER (ikke fasit). Resten er uavklart.
 */
export const CASE_C: ScenarioValues = {
  ...scenarioModelDefaults(),
  ...EMPTY_CALC,
  purchasePrice: 3_800_000,
  debtAtPurchase: 0,
  debtAtSale: 0,
  dutyBasis: 'kjopesum_pluss_fellesgjeld',
  dutyPct: 2.5,
  renovationLumpSum: 450_000,
  saleBasis: 'kontant',
  saleBase: 4_900_000,
  interestPct: 7,
  purchaseFinancingPct: 100,
  renovationFinancingPct: 100,
  saleFixedCost: 55_000,
  saleCommissionPct: 1.5,
  buyFees: 6_000,
  hourValue: 350,
  months: 6,
};

export interface HurdleState {
  minReturnPct: number | null;
  minHourValue: number | null;
}

/** Eksempelinnstillinger – ikke fasiter. */
export const DEFAULT_HURDLE: HurdleState = { minReturnPct: 15, minHourValue: 350 };
