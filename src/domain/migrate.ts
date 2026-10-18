import { DEFAULT_LABOR_MODES } from '../config/defaultLabor';

/**
 * Eksplisitt, ren migrering av eldre lagrede rader til modell 1.1.
 * Brukes både av databasemigreringen (v3 → v4) og som forbehandling i Zod-skjemaene,
 * slik at gamle rader (også fra localStorage-kurs, import og eksport) alltid kan leses.
 *
 * Prinsipper:
 *  - Ingen data droppes. Eldre `financingPct` blir både kjøps- og oppussingslån, så eldre kalkyler gir
 *    nøyaktig samme resultat som før.
 *  - Nye felt som ikke kan utledes får `null` (ukjent) – aldri 0.
 */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface ProfileMigrationHints {
  weeklyOwnHours?: number | null;
  minProfitPerOwnHour?: number | null;
  availableEquity?: number | null;
  laborModes?: unknown;
}

/** Nye modellfelt i et scenario med nøytrale verdier. */
export function scenarioModelDefaults() {
  return {
    analysisScenarioId: null as string | null,
    purchaseFinancingPct: null as number | null,
    renovationFinancingPct: null as number | null,
    financeRunningCosts: false,
    availableEquity: null as number | null,
    settlementMonths: null as number | null,
    weeklyOwnHours: null as number | null,
    minProfitPerOwnHour: null as number | null,
    laborModes: { ...DEFAULT_LABOR_MODES },
    maxOwnWork: false,
    regulatedSelfWorkConfirmed: false,
  };
}

/** Migrerer en scenarioverdi-rad (rå JSON) til modell 1.1. Rader som allerede er migrert returneres uendret. */
export function migrateScenarioValuesRaw(raw: unknown, hints: ProfileMigrationHints = {}): unknown {
  if (!isObj(raw)) return raw;
  const v: Record<string, unknown> = { ...raw };
  const legacyFinancing = 'financingPct' in v ? numOrNull(v.financingPct) : undefined;
  if (legacyFinancing !== undefined || 'financingPct' in v) {
    if (!('purchaseFinancingPct' in v)) v.purchaseFinancingPct = legacyFinancing ?? null;
    if (!('renovationFinancingPct' in v)) v.renovationFinancingPct = legacyFinancing ?? null;
    delete v.financingPct;
  }
  const d = scenarioModelDefaults();
  const fill = <K extends keyof typeof d>(key: K, value: (typeof d)[K]) => {
    if (!(key in v) || v[key] === undefined) v[key] = value;
  };
  fill('analysisScenarioId', null);
  fill('purchaseFinancingPct', null);
  fill('renovationFinancingPct', null);
  fill('financeRunningCosts', false);
  fill('availableEquity', hints.availableEquity ?? null);
  fill('settlementMonths', null);
  fill('weeklyOwnHours', hints.weeklyOwnHours ?? null);
  fill('minProfitPerOwnHour', hints.minProfitPerOwnHour ?? null);
  fill('laborModes', (isObj(hints.laborModes) ? { ...DEFAULT_LABOR_MODES, ...hints.laborModes } : d.laborModes) as typeof d.laborModes);
  fill('maxOwnWork', false);
  fill('regulatedSelfWorkConfirmed', false);
  return v;
}

/** Migrerer profilens standardverdier. Eldre `financingPct` bevares som både kjøps- og oppussingslån. */
export function migrateProfileDefaultsRaw(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const v: Record<string, unknown> = { ...raw };
  const legacy = numOrNull(v.financingPct);
  if (!('purchaseFinancingPct' in v)) v.purchaseFinancingPct = legacy ?? 90;
  if (!('renovationFinancingPct' in v)) v.renovationFinancingPct = legacy ?? 0;
  delete v.financingPct;
  const set = (key: string, value: unknown) => {
    if (!(key in v) || v[key] === undefined) v[key] = value;
  };
  set('financeRunningCosts', false);
  set('availableEquity', 300_000);
  set('weeklyOwnHours', 10);
  set('minProfitPerOwnHour', 500);
  set('saleSettlementMonths', 3.5);
  set('laborModes', { ...DEFAULT_LABOR_MODES });
  set('maxOwnWork', false);
  set('regulatedSelfWorkConfirmed', false);
  return v;
}
