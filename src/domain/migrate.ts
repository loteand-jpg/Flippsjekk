import { DEFAULT_LABOR_MODES } from '../config/defaultLabor';

/**
 * Eksplisitt, ren migrering av eldre lagrede rader til gjeldende modell (1.2).
 * Brukes både av databasemigreringen (v3 → v4 → v5) og som forbehandling i Zod-skjemaene,
 * slik at gamle rader (også fra localStorage-kurs, import og eksport) alltid kan leses.
 *
 * Prinsipper:
 *  - Ingen rader droppes, og ingen brukerverdier slettes. Eldre `financingPct` blir både kjøps- og oppussingslån.
 *    Merk: fra modell 1.2 gjelder kjøpslånet kun kjøpesummen P, så eldre kalkyler gir IKKE lenger bit-for-bit samme
 *    renter/egenkapitalbehov når kjøpskostnadene er > 0. Det er en bevisst produktendring, ikke en migreringsfeil.
 *  - Nye felt som ikke kan utledes får `null` (ukjent) – aldri 0.
 *  - Eldre `regulatedSelfWorkConfirmed` (én samlet bekreftelse) kan ikke fortelle hvilket arbeidsområde bekreftelsen
 *    gjaldt. Den nullstilles konservativt til «ikke bekreftet» for alle tre områdene; brukeren bekrefter på nytt per område.
 *  - Tiltak med `laborCategory` bruker bare ny arbeidsmodell (materialer + innleid arbeid). Fylte eldre fagfelt
 *    (elektriker/rørlegger/andre) flyttes til `laborCostHired` når den er ukjent, ellers beholdes `laborCostHired` – aldri begge.
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
    regulatedCompetence: { ...NO_REGULATED_COMPETENCE },
  };
}

/** Ingen bekreftet kompetanse for regulert arbeid. */
export const NO_REGULATED_COMPETENCE = { ror: false, elektro: false, bad_vatrom: false } as const;

/** Migrerer det gamle samlede flagget til kategoribasert kompetanse (konservativt: ikke bekreftet). */
function migrateCompetence(v: Record<string, unknown>): void {
  if ('regulatedSelfWorkConfirmed' in v) delete v.regulatedSelfWorkConfirmed;
  if (!isObj(v.regulatedCompetence)) v.regulatedCompetence = { ...NO_REGULATED_COMPETENCE };
  else v.regulatedCompetence = { ...NO_REGULATED_COMPETENCE, ...v.regulatedCompetence };
}

const trade = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/**
 * Ett tiltak med arbeidskategori har kun ny arbeidsmodell. Eldre fagfelt flyttes til `laborCostHired` (hvis den er ukjent)
 * og nullstilles – slik at arbeid aldri telles to ganger. Tiltak uten arbeidskategori er uendret.
 */
export function migrateRenovationItemRaw(raw: unknown): unknown {
  if (!isObj(raw) || typeof raw.laborCategory !== 'string') return raw;
  const legacy = trade(raw.electrician) + trade(raw.plumber) + trade(raw.other);
  if (legacy === 0 && raw.electrician !== null && raw.plumber !== null && raw.other !== null) return raw;
  const item: Record<string, unknown> = { ...raw };
  if (legacy > 0 && (item.laborCostHired === null || item.laborCostHired === undefined)) item.laborCostHired = legacy;
  item.electrician = 0;
  item.plumber = 0;
  item.other = 0;
  return item;
}

function migrateItems(v: Record<string, unknown>, key: string): void {
  if (Array.isArray(v[key])) v[key] = (v[key] as unknown[]).map(migrateRenovationItemRaw);
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
  migrateCompetence(v);
  migrateItems(v, 'renovationItems');
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
  migrateCompetence(v);
  return v;
}
