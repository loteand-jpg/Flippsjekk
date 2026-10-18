import { findAnalysisScenario } from '../domain/analysisScenarios';
import { isRegulatedLabor, LABOR_CATEGORIES, propertyCategory, type LaborCategory, type Tenure, type WorkMode } from '../domain/enums';
import { migrateScenarioValuesRaw } from '../domain/migrate';
import type {
  DutyRule,
  Property,
  PropertySnapshot,
  ProfileDefaults,
  RenovationItem,
  ScenarioValues,
  SharedAnalysis,
} from '../domain/schemas';
import { evaluate, type EngineInput, type Evaluation, type Issue, type MissingInput } from './engine';
import { resolveScenarioSale, type SaleResolution } from './saleValue';

// ---------------------------------------------------------------------------
// Oppussing
// ---------------------------------------------------------------------------

export interface RenovationTotals {
  mode: ScenarioValues['renovationMode'];
  /** R uten reserve. null når et inkludert tiltak mangler kostnad. */
  total: number | null;
  /** Egne timer. null når timer mangler for arbeid som utføres selv. */
  hours: number | null;
  byCategory: { materials: number; electrician: number; plumber: number; other: number; hiredLabor: number };
  /** Arbeid fordelt på arbeidskategori (bare tiltak med arbeidskategori). */
  byLabor: Partial<Record<LaborCategory, { ownHours: number; hiredCost: number }>>;
  includedCount: number;
  unknownItems: RenovationItem[];
  excludedRequired: RenovationItem[];
  /** Regulert arbeid som er regnet som innleid fordi kompetanse/ansvar ikke er bekreftet. */
  downgradedRegulated: RenovationItem[];
}

type LaborContext = Pick<ScenarioValues, 'laborModes' | 'maxOwnWork' | 'regulatedCompetence'>;

/** Eldre kostnad uten arbeidsmodell: summen av materialer og fag. */
function legacyBuckets(item: RenovationItem): number | null {
  const parts = [item.materials, item.electrician, item.plumber, item.other];
  if (parts.some((p) => p === null)) return null;
  return (parts as number[]).reduce((sum, p) => sum + Math.round(p * 100), 0) / 100;
}

/**
 * Regel mot dobbelttelling: et tiltak med `laborCategory` bruker ny arbeidsmodell (materialer + innleid arbeid), og de
 * eldre fagfeltene (elektriker, rørlegger, andre fag) teller IKKE med. Tiltak uten kategori følger den eldre modellen.
 */
export function usesLaborModel(item: Pick<RenovationItem, 'laborCategory'>): boolean {
  return Boolean(item.laborCategory);
}

/** Eldre fagbeløp som ligger på et tiltak med ny arbeidsmodell og derfor ignoreres (for advarsel). */
export function ignoredLegacyTrades(item: RenovationItem): number {
  if (!usesLaborModel(item)) return 0;
  return [item.electrician, item.plumber, item.other].reduce<number>((s, x) => s + (typeof x === 'number' ? x : 0), 0);
}

/** Materialer for tiltak med ny arbeidsmodell. Ukjent = null. */
function materialsOnly(item: RenovationItem): number | null {
  return item.materials;
}

export interface ItemEconomics {
  /** Kostnad (materialer + innleid arbeid). null = ikke avklart. */
  cost: number | null;
  /** Egne timer for tiltaket. null = ikke avklart. */
  ownHours: number | null;
  /** Innleid arbeid (bare tiltak med arbeidskategori). null = ikke avklart. */
  hiredLabor: number | null;
  /** Arbeidsmodus som er brukt. null for eldre tiltak uten arbeidsmodell. */
  mode: WorkMode | null;
  /** Regulert arbeid som ble regnet som innleid. */
  downgraded: boolean;
}

/**
 * Økonomien i ett tiltak. Tiltak uten `laborCategory` følger eldre regler (fagene er innleide kostnader, `hours`
 * er egne timer). Med `laborCategory` fordeles arbeidet etter arbeidsmodus: selv, delvis eller innleid.
 * Egne timer er aldri en kostnad. Regulert arbeid regnes aldri som gratis uten bekreftet kompetanse og ansvar.
 */
export function itemEconomics(item: RenovationItem, ctx?: LaborContext): ItemEconomics {
  const cat = item.laborCategory ?? null;
  if (cat === null) {
    return { cost: legacyBuckets(item), ownHours: item.hours, hiredLabor: null, mode: null, downgraded: false };
  }
  const modes = ctx?.laborModes;
  let mode: WorkMode = item.workMode ?? modes?.[cat] ?? 'innleid';
  // «Maks egeninnsats» gjør bare ikke-regulert arbeid til «selv». Regulert arbeid oppgraderes aldri automatisk.
  if (ctx?.maxOwnWork && !isRegulatedLabor(cat) && !item.workMode) mode = 'selv';
  let downgraded = false;
  // Regulert arbeid utføres bare «selv»/«delvis» når kompetanse og ansvar er bekreftet for akkurat dette området.
  if (isRegulatedLabor(cat) && mode !== 'innleid' && !ctx?.regulatedCompetence?.[cat]) {
    mode = 'innleid';
    downgraded = true;
  }
  const share = mode === 'selv' ? 1 : mode === 'innleid' ? 0 : (item.selfShare ?? 0.5);
  const hired = share >= 1 ? 0 : item.laborCostHired == null ? null : Math.round(item.laborCostHired * 100 * (1 - share)) / 100;
  const ownHours = share <= 0 ? 0 : item.laborHours == null ? null : Math.round(item.laborHours * share * 100) / 100;
  const materials = materialsOnly(item);
  const cost = materials === null || hired === null ? null : Math.round(materials * 100 + hired * 100) / 100;
  return { cost, ownHours, hiredLabor: hired, mode, downgraded };
}

/** Kostnad for ett tiltak uten arbeidsmodell-kontekst (profilens modus brukes ikke). Beholdt for visning. */
export function itemCost(item: RenovationItem, ctx?: LaborContext): number | null {
  return itemEconomics(item, ctx).cost;
}

/** Enten summering av tiltak eller eksplisitt rundsum – aldri begge. */
export function renovationTotals(
  v: Pick<ScenarioValues, 'renovationMode' | 'renovationItems' | 'renovationLumpSum' | 'lumpSumHours'> & Partial<LaborContext>,
): RenovationTotals {
  const excludedRequired = v.renovationItems.filter((i) => !i.included && i.priority === 'pakrevd');
  if (v.renovationMode === 'rundsum') {
    return {
      mode: 'rundsum',
      total: v.renovationLumpSum,
      hours: v.lumpSumHours,
      byCategory: { materials: 0, electrician: 0, plumber: 0, other: 0, hiredLabor: 0 },
      byLabor: {},
      includedCount: 0,
      unknownItems: [],
      excludedRequired: [],
      downgradedRegulated: [],
    };
  }
  const ctx: LaborContext = {
    laborModes: v.laborModes ?? ({} as LaborContext['laborModes']),
    maxOwnWork: v.maxOwnWork ?? false,
    regulatedCompetence: v.regulatedCompetence ?? { ror: false, elektro: false, bad_vatrom: false },
  };
  const included = v.renovationItems.filter((i) => i.included);
  const econ = included.map((i) => ({ item: i, e: itemEconomics(i, ctx) }));
  const unknownItems = econ.filter((x) => x.e.cost === null).map((x) => x.item);
  const ore = (n: number | null | undefined) => Math.round((n ?? 0) * 100);
  const byCatOre = { materials: 0, electrician: 0, plumber: 0, other: 0, hiredLabor: 0 };
  const byLaborOre: Partial<Record<LaborCategory, { ownHours: number; hiredOre: number }>> = {};
  let totalOre = 0;
  for (const { item: i, e } of econ) {
    // Ny arbeidsmodell: eldre fagfelt ignoreres (ingen dobbelttelling). Eldre modell: fagene er innleide kostnader.
    const legacy = usesLaborModel(i) ? { electrician: 0, plumber: 0, other: 0 } : { electrician: ore(i.electrician), plumber: ore(i.plumber), other: ore(i.other) };
    byCatOre.materials += ore(i.materials);
    byCatOre.electrician += legacy.electrician;
    byCatOre.plumber += legacy.plumber;
    byCatOre.other += legacy.other;
    byCatOre.hiredLabor += ore(e.hiredLabor);
    totalOre += ore(i.materials) + legacy.electrician + legacy.plumber + legacy.other + ore(e.hiredLabor);
    if (i.laborCategory) {
      const slot = (byLaborOre[i.laborCategory] ??= { ownHours: 0, hiredOre: 0 });
      slot.ownHours += e.ownHours ?? 0;
      slot.hiredOre += ore(e.hiredLabor);
    }
  }
  const hoursUnknown = econ.some((x) => x.e.ownHours === null);
  const byLabor: RenovationTotals['byLabor'] = {};
  for (const c of LABOR_CATEGORIES) {
    const slot = byLaborOre[c];
    if (slot) byLabor[c] = { ownHours: slot.ownHours, hiredCost: slot.hiredOre / 100 };
  }
  return {
    mode: 'tiltak',
    total: unknownItems.length > 0 ? null : totalOre / 100,
    hours: hoursUnknown ? null : econ.reduce((sum, x) => sum + (x.e.ownHours ?? 0), 0),
    byCategory: {
      materials: byCatOre.materials / 100,
      electrician: byCatOre.electrician / 100,
      plumber: byCatOre.plumber / 100,
      other: byCatOre.other / 100,
      hiredLabor: byCatOre.hiredLabor / 100,
    },
    byLabor,
    includedCount: included.length,
    unknownItems,
    excludedRequired,
    downgradedRegulated: econ.filter((x) => x.e.downgraded).map((x) => x.item),
  };
}

// ---------------------------------------------------------------------------
// Grensen mot motoren: prosentpoeng → desimal (én gang)
// ---------------------------------------------------------------------------

const pct = (v: number | null): number | null => (v === null ? null : v / 100);

export function toEngineInput(v: ScenarioValues, reno: RenovationTotals = renovationTotals(v), purchaseLoanBasis?: EngineInput['purchaseLoanBasis']): EngineInput {
  return {
    ...(purchaseLoanBasis ? { purchaseLoanBasis } : {}),
    purchasePrice: v.purchasePrice,
    debtAtPurchase: v.debtAtPurchase,
    debtAtSale: v.debtAtSale,
    duty: { basis: v.dutyBasis, rate: pct(v.dutyPct), customBase: v.dutyCustomBase },
    buyFees: v.buyFees,
    renovation: reno.total,
    reserveRate: pct(v.reservePct),
    months: v.months,
    monthlyCost: v.monthlyCost,
    interestRate: pct(v.interestPct),
    purchaseFinancingShare: pct(v.purchaseFinancingPct),
    renovationFinancingShare: pct(v.renovationFinancingPct),
    financeRunningCosts: v.financeRunningCosts,
    availableEquity: v.availableEquity,
    saleFixedCost: v.saleFixedCost,
    saleCommissionRate: pct(v.saleCommissionPct),
    saleBasis: v.saleBasis,
    salePrices: { low: v.saleLow, base: v.saleBase, high: v.saleHigh },
    ownHours: reno.hours,
    hourValue: v.hourValue,
    minProfitPerOwnHour: v.minProfitPerOwnHour,
    profitTarget: v.profitTarget,
    tax: { mode: v.taxMode, rate: pct(v.taxPct) },
  };
}

export interface ScenarioEvaluation {
  evaluation: Evaluation;
  renovation: RenovationTotals;
  input: EngineInput;
  /** Mangler med mer presis forklaring enn motoren alene kan gi. */
  missing: MissingInput[];
  warnings: Issue[];
}

/** Sikrer at eldre rader (uten modell 1.1-felt, med `financingPct`) kan evalueres. Allerede migrerte rader er uendret. */
export function normalizeScenarioValues(v: ScenarioValues): ScenarioValues {
  return migrateScenarioValuesRaw(v) as ScenarioValues;
}

const WEEKS_PER_MONTH = 4.345;

export function evaluateScenario(raw: ScenarioValues, options: { detailed?: boolean; purchaseLoanBasis?: EngineInput['purchaseLoanBasis'] } = {}): ScenarioEvaluation {
  const v = normalizeScenarioValues(raw);
  const renovation = renovationTotals(v);
  const input = toEngineInput(v, renovation, options.purchaseLoanBasis);
  const evaluation = evaluate(input, { detailed: options.detailed });
  const missing = evaluation.missing.map((m) => {
    if (m.field === 'renovation' && renovation.mode === 'tiltak' && renovation.unknownItems.length > 0) {
      return {
        field: 'renovation',
        label: `Oppussing: kostnad ikke avklart for ${renovation.unknownItems.map((i) => `«${i.title || i.room}»`).join(', ')}`,
      };
    }
    if (m.field === 'renovation' && renovation.mode === 'rundsum') {
      return { field: 'renovation', label: 'Oppussing: rundsum er ikke angitt' };
    }
    return m;
  });
  const warnings = [...evaluation.warnings];
  if (renovation.excludedRequired.length > 0) {
    warnings.push({
      field: 'renovation',
      message: `Påkrevd utbedring er tatt ut av kalkylen: ${renovation.excludedRequired
        .map((i) => `«${i.title}»`)
        .join(', ')}. Resultatet kan bli for optimistisk.`,
    });
  }
  if (renovation.mode === 'tiltak' && renovation.includedCount === 0 && v.renovationItems.length > 0) {
    warnings.push({ field: 'renovation', message: 'Ingen oppussingstiltak er inkludert i kalkylen.' });
  }
  if (v.buyerType === 'as' && !v.vatIncluded) {
    warnings.push({
      field: 'vatIncluded',
      message: 'Oppussingsanslag er angitt uten mva. Ikke anta at mva. kan trekkes fra bare fordi kjøper er AS.',
    });
  }
  if (renovation.downgradedRegulated.length > 0) {
    warnings.push({
      field: 'laborModes',
      message: `Regulert arbeid er regnet som innleid fordi relevant kompetanse/ansvar ikke er bekreftet for arbeidsområdet: ${renovation.downgradedRegulated
        .map((i) => `«${i.title}»`)
        .join(', ')}. Egeninnsats på rør, elektro og bad/våtrom regnes aldri som gratis automatisk.`,
    });
  }
  if (renovation.mode === 'tiltak') {
    const doubled = v.renovationItems.filter((i) => i.included && ignoredLegacyTrades(i) > 0);
    if (doubled.length > 0) {
      warnings.push({
        field: 'renovationItems',
        message: `Tiltak med arbeidsmodell bruker bare materialer og innleid arbeid. Eldre fagbeløp er ikke regnet med, for å unngå at arbeidet telles to ganger: ${doubled.map((i) => `«${i.title}»`).join(', ')}.`,
      });
    }
  }
  // Kapasitet: rekker egeninnsatsen innen oppussingstiden med oppgitt ukentlig innsats?
  if (renovation.hours !== null && renovation.hours > 0 && v.weeklyOwnHours && v.weeklyOwnHours > 0 && v.months) {
    const renovationMonths = Math.max(0, v.months - (v.settlementMonths ?? 0));
    const weeksNeeded = renovation.hours / v.weeklyOwnHours;
    const weeksAvailable = renovationMonths * WEEKS_PER_MONTH;
    if (weeksNeeded > weeksAvailable + 0.01) {
      warnings.push({
        field: 'weeklyOwnHours',
        message: `Egeninnsatsen på ${Math.round(renovation.hours)} timer krever ca. ${Math.ceil(weeksNeeded)} uker med ${v.weeklyOwnHours} t/uke, men oppussingstiden er ca. ${Math.floor(weeksAvailable)} uker. Øk innsatsen, forleng tiden eller leie inn mer.`,
      });
    }
  }
  return { evaluation, renovation, input, missing, warnings };
}

// ---------------------------------------------------------------------------
// Grunnverdier: felles analyse + annonse + profilens forutsetninger
// ---------------------------------------------------------------------------

export function defaultDutyRule(tenure: Tenure): DutyRule {
  switch (tenure) {
    case 'selveier':
      return {
        basis: 'kjopesum_pluss_fellesgjeld',
        ratePct: 2.5,
        customBase: null,
        note: 'Modellregel for selveier: 2,5 % av kjøpesum + eventuell fellesgjeld. Grunnlaget følger kjøpsprisen du legger inn.',
      };
    case 'borettslag':
      return { basis: 'ingen', ratePct: 0, customBase: null, note: 'Andel i borettslag: ingen dokumentavgift som standard.' };
    case 'aksje':
    case 'obligasjon':
      return {
        basis: 'ingen',
        ratePct: 0,
        customBase: null,
        note: 'Særtilfelle: overdragelse av aksje/obligasjon. Kontroller avgiftsplikt og grunnlag med megler.',
      };
    case 'ukjent':
    default:
      return {
        basis: 'kjopesum_pluss_fellesgjeld',
        ratePct: null,
        customBase: null,
        note: 'Eierform er ikke avklart, så dokumentavgiften kan ikke fastsettes ennå.',
      };
  }
}

export type ValueOrigin = 'annonse' | 'analyse' | 'scenario' | 'markedsmotor' | 'profil' | 'modellregel' | 'standard';
export const VALUE_ORIGIN_LABEL: Record<ValueOrigin, string> = {
  annonse: 'Fra annonsen',
  analyse: 'Analyseanslag',
  scenario: 'Agentens estimat for scenarioet (fallback)',
  markedsmotor: 'Beregnet av markedsmotoren',
  profil: 'Din profilforutsetning',
  modellregel: 'Modellregel',
  standard: 'Standardvalg',
};

export interface BaseValues {
  values: ScenarioValues;
  origins: Partial<Record<keyof ScenarioValues, ValueOrigin>>;
  /** Hvordan salgsverdien i grunnverdiene er fastsatt (markedsmotor, agent-fallback eller eldre global verdi). */
  saleResolution: SaleResolution;
}

function cloneItems(items: RenovationItem[]): RenovationItem[] {
  return items.map((i) => ({ ...i }));
}

export function buildBaseValues(args: {
  property: Property;
  snapshot: PropertySnapshot;
  analysis: SharedAnalysis;
  defaults: ProfileDefaults;
  /** Hvilket agentscenario (basis/alternativ) grunnverdiene bygger på. Standard: analysens basis. */
  analysisScenarioId?: string | null;
}): BaseValues {
  const { property, snapshot, analysis, defaults } = args;
  const est = analysis.estimates;
  const rule = est.dutyRule ?? defaultDutyRule(property.tenure);
  const scenario = findAnalysisScenario(analysis, args.analysisScenarioId);
  const isLegacy = scenario.source === 'legacy';
  // Eldre analyser: oppussingsnivå styres av gamle alternativer. Nye scenarioer har egne tiltak.
  const option = isLegacy ? (est.renovationOptions.find((o) => o.id === est.defaultRenovationOptionId) ?? est.renovationOptions[0] ?? null) : null;
  const category = propertyCategory(property.propertyType);
  const debtAtSale = est.debtAtSale ?? snapshot.sharedDebt;
  // Én autoritativ salgsverdiflyt: markedsmotoren fastsetter low/base/high. Agentens estimat er bare fallback.
  const saleResolution = resolveScenarioSale({ analysis, scenario, property, snapshot, debtAtSale });
  const resolvedSale = saleResolution.sale;

  // Varighet: eldre analyser oppgir total varighet. Scenarioer oppgir oppussingstid, og tid til oppgjør legges til fra profilen.
  let months: number;
  let monthsOrigin: ValueOrigin;
  if (scenario.monthsAreTotal) {
    months = est.months ?? scenario.suggestedMonths ?? defaults.months;
    monthsOrigin = est.months !== null || scenario.suggestedMonths ? 'analyse' : 'profil';
  } else if (scenario.suggestedMonths !== null) {
    months = scenario.suggestedMonths + defaults.saleSettlementMonths;
    monthsOrigin = 'analyse';
  } else {
    months = defaults.months;
    monthsOrigin = 'profil';
  }
  const settlement = defaults.saleSettlementMonths < months ? defaults.saleSettlementMonths : null;

  const values: ScenarioValues = {
    buyerType: category === 'leilighet' ? defaults.buyerTypeApartment : defaults.buyerTypeHouse,
    purchasePrice: est.suggestedPurchasePrice ?? snapshot.askingPrice,
    debtAtPurchase: snapshot.sharedDebt,
    debtAtSale: est.debtAtSale ?? snapshot.sharedDebt,
    dutyBasis: rule.basis,
    dutyPct: rule.ratePct,
    dutyCustomBase: rule.customBase,
    buyFees: est.buyFees ?? defaults.buyFees,
    renovationMode: scenario.items.length > 0 ? 'tiltak' : 'rundsum',
    renovationOptionId: option?.id ?? null,
    renovationItems: cloneItems(scenario.items),
    renovationLumpSum: null,
    lumpSumHours: null,
    vatIncluded: scenario.vatIncluded,
    reservePct: defaults.reservePct,
    months,
    settlementMonths: settlement,
    monthlyCost: est.monthlyTotal,
    interestPct: defaults.interestPct,
    purchaseFinancingPct: defaults.purchaseFinancingPct,
    renovationFinancingPct: defaults.renovationFinancingPct,
    financeRunningCosts: defaults.financeRunningCosts,
    availableEquity: defaults.availableEquity,
    saleBasis: resolvedSale.basis,
    saleLow: resolvedSale.low,
    saleBase: resolvedSale.base,
    saleHigh: resolvedSale.high,
    saleFixedCost: defaults.saleFixedCost,
    saleCommissionPct: defaults.saleCommissionPct,
    hourValue: null,
    minProfitPerOwnHour: defaults.minProfitPerOwnHour,
    weeklyOwnHours: defaults.weeklyOwnHours,
    laborModes: { ...defaults.laborModes },
    maxOwnWork: defaults.maxOwnWork,
    regulatedCompetence: { ...defaults.regulatedCompetence },
    analysisScenarioId: scenario.id,
    profitTarget: defaults.profitTarget,
    taxMode: 'uavklart',
    taxPct: null,
    startBid: null,
    walkAway: null,
    notes: '',
  };
  const saleOrigin: ValueOrigin = saleResolution.source === 'markedsmotor' ? 'markedsmotor' : saleResolution.source === 'agent_fallback' ? 'scenario' : 'analyse';
  const origins: BaseValues['origins'] = {
    buyerType: 'profil',
    purchasePrice: est.suggestedPurchasePrice !== null ? 'analyse' : 'annonse',
    debtAtPurchase: 'annonse',
    debtAtSale: est.debtAtSale !== null ? 'analyse' : 'annonse',
    dutyBasis: 'modellregel',
    dutyPct: 'modellregel',
    buyFees: est.buyFees !== null ? 'analyse' : 'profil',
    renovationItems: isLegacy ? 'analyse' : 'scenario',
    reservePct: 'profil',
    months: monthsOrigin,
    settlementMonths: 'profil',
    monthlyCost: 'analyse',
    interestPct: 'profil',
    purchaseFinancingPct: 'profil',
    renovationFinancingPct: 'profil',
    financeRunningCosts: 'profil',
    availableEquity: 'profil',
    saleBasis: saleOrigin,
    saleLow: saleOrigin,
    saleBase: saleOrigin,
    saleHigh: saleOrigin,
    saleFixedCost: 'profil',
    saleCommissionPct: 'profil',
    minProfitPerOwnHour: 'profil',
    weeklyOwnHours: 'profil',
    laborModes: 'profil',
    maxOwnWork: 'profil',
    regulatedCompetence: 'profil',
    analysisScenarioId: 'standard',
    profitTarget: 'profil',
    taxMode: 'standard',
    vatIncluded: 'standard',
  };
  return { values, origins, saleResolution };
}

// ---------------------------------------------------------------------------
// Feltmetadata og differanser
// ---------------------------------------------------------------------------

export type FieldKind = 'money' | 'pct' | 'months' | 'hours' | 'enum' | 'bool' | 'text' | 'items';

export const SCENARIO_FIELDS: { key: keyof ScenarioValues; label: string; kind: FieldKind }[] = [
  { key: 'purchasePrice', label: 'Kjøpspris (kontant)', kind: 'money' },
  { key: 'debtAtPurchase', label: 'Fellesgjeld ved kjøp', kind: 'money' },
  { key: 'debtAtSale', label: 'Fellesgjeld ved salg', kind: 'money' },
  { key: 'dutyBasis', label: 'Grunnlag for dokumentavgift', kind: 'enum' },
  { key: 'dutyPct', label: 'Dokumentavgift', kind: 'pct' },
  { key: 'dutyCustomBase', label: 'Eget avgiftsgrunnlag', kind: 'money' },
  { key: 'buyFees', label: 'Øvrige kjøpsgebyrer', kind: 'money' },
  { key: 'renovationMode', label: 'Oppussingsmetode', kind: 'enum' },
  { key: 'renovationOptionId', label: 'Oppussingsalternativ', kind: 'enum' },
  { key: 'renovationItems', label: 'Oppussingstiltak', kind: 'items' },
  { key: 'renovationLumpSum', label: 'Oppussing (rundsum)', kind: 'money' },
  { key: 'lumpSumHours', label: 'Egne timer (rundsum)', kind: 'hours' },
  { key: 'vatIncluded', label: 'Anslag inkl. mva.', kind: 'bool' },
  { key: 'reservePct', label: 'Oppussingsreserve', kind: 'pct' },
  { key: 'months', label: 'Prosjektvarighet', kind: 'months' },
  { key: 'settlementMonths', label: 'Tid til økonomisk oppgjør', kind: 'months' },
  { key: 'monthlyCost', label: 'Månedlige kostnader', kind: 'money' },
  { key: 'interestPct', label: 'Rente', kind: 'pct' },
  { key: 'purchaseFinancingPct', label: 'Låneandel kjøp', kind: 'pct' },
  { key: 'renovationFinancingPct', label: 'Låneandel oppussing', kind: 'pct' },
  { key: 'financeRunningCosts', label: 'Løpende kostnader lånefinansieres', kind: 'bool' },
  { key: 'availableEquity', label: 'Tilgjengelig egenkapital', kind: 'money' },
  { key: 'saleBasis', label: 'Prisgrunnlag for salg', kind: 'enum' },
  { key: 'saleLow', label: 'Salgspris lav', kind: 'money' },
  { key: 'saleBase', label: 'Salgspris normal', kind: 'money' },
  { key: 'saleHigh', label: 'Salgspris høy', kind: 'money' },
  { key: 'saleFixedCost', label: 'Faste salgskostnader', kind: 'money' },
  { key: 'saleCommissionPct', label: 'Meglerprovisjon', kind: 'pct' },
  { key: 'minProfitPerOwnHour', label: 'Minimum fortjeneste per egeninnsatstime', kind: 'money' },
  { key: 'weeklyOwnHours', label: 'Egeninnsats per uke', kind: 'hours' },
  { key: 'laborModes', label: 'Hvem utfører arbeidet', kind: 'text' },
  { key: 'maxOwnWork', label: 'Maks egeninnsats', kind: 'bool' },
  { key: 'regulatedCompetence', label: 'Kompetanse/ansvar for regulert arbeid (per område)', kind: 'text' },
  { key: 'analysisScenarioId', label: 'Scenario i analysen', kind: 'enum' },
  { key: 'profitTarget', label: 'Fortjenestemål', kind: 'money' },
  { key: 'buyerType', label: 'Kjøpertype', kind: 'enum' },
  { key: 'taxMode', label: 'Skatteforutsetning', kind: 'enum' },
  { key: 'taxPct', label: 'Skattesats (forutsetning)', kind: 'pct' },
  { key: 'startBid', label: 'Mitt startbud', kind: 'money' },
  { key: 'walkAway', label: 'Min smertegrense', kind: 'money' },
  { key: 'notes', label: 'Notat', kind: 'text' },
];

export interface DiffEntry {
  key: keyof ScenarioValues;
  label: string;
  kind: FieldKind;
  base: unknown;
  current: unknown;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffValues(base: ScenarioValues, current: ScenarioValues): DiffEntry[] {
  return SCENARIO_FIELDS.filter((f) => !sameValue(base[f.key], current[f.key])).map((f) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    base: base[f.key],
    current: current[f.key],
  }));
}

/**
 * Oppdaterer et scenario til ny grunnanalyse. Felt brukeren selv har endret fra gammel
 * grunnanalyse beholdes; øvrige felt får verdier fra den nye grunnanalysen.
 */
export function rebaseValues(
  oldBase: ScenarioValues,
  newBase: ScenarioValues,
  current: ScenarioValues,
  mode: 'keep_my_changes' | 'replace_all',
): ScenarioValues {
  if (mode === 'replace_all') return { ...newBase, notes: current.notes, startBid: current.startBid, walkAway: current.walkAway };
  const changed = new Set(diffValues(oldBase, current).map((d) => d.key));
  const out = { ...newBase } as Record<string, unknown>;
  for (const key of changed) out[key] = (current as Record<string, unknown>)[key];
  return out as ScenarioValues;
}
