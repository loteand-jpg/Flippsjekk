import { propertyCategory, type Tenure } from '../domain/enums';
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

// ---------------------------------------------------------------------------
// Oppussing
// ---------------------------------------------------------------------------

export interface RenovationTotals {
  mode: ScenarioValues['renovationMode'];
  /** R uten reserve. null når et inkludert tiltak mangler kostnad. */
  total: number | null;
  hours: number | null;
  byCategory: { materials: number; electrician: number; plumber: number; other: number };
  includedCount: number;
  unknownItems: RenovationItem[];
  excludedRequired: RenovationItem[];
}

export function itemCost(item: RenovationItem): number | null {
  const parts = [item.materials, item.electrician, item.plumber, item.other];
  if (parts.some((p) => p === null)) return null;
  return (parts as number[]).reduce((sum, p) => sum + Math.round(p * 100), 0) / 100;
}

/** Enten summering av tiltak eller eksplisitt rundsum – aldri begge. */
export function renovationTotals(
  v: Pick<ScenarioValues, 'renovationMode' | 'renovationItems' | 'renovationLumpSum' | 'lumpSumHours'>,
): RenovationTotals {
  const excludedRequired = v.renovationItems.filter((i) => !i.included && i.priority === 'pakrevd');
  if (v.renovationMode === 'rundsum') {
    return {
      mode: 'rundsum',
      total: v.renovationLumpSum,
      hours: v.lumpSumHours,
      byCategory: { materials: 0, electrician: 0, plumber: 0, other: 0 },
      includedCount: 0,
      unknownItems: [],
      excludedRequired: [],
    };
  }
  const included = v.renovationItems.filter((i) => i.included);
  const unknownItems = included.filter((i) => itemCost(i) === null);
  const ore = (n: number | null) => Math.round((n ?? 0) * 100);
  const byCatOre = { materials: 0, electrician: 0, plumber: 0, other: 0 };
  for (const i of included) {
    byCatOre.materials += ore(i.materials);
    byCatOre.electrician += ore(i.electrician);
    byCatOre.plumber += ore(i.plumber);
    byCatOre.other += ore(i.other);
  }
  const totalOre = byCatOre.materials + byCatOre.electrician + byCatOre.plumber + byCatOre.other;
  const hoursUnknown = included.some((i) => i.hours === null);
  return {
    mode: 'tiltak',
    total: unknownItems.length > 0 ? null : totalOre / 100,
    hours: hoursUnknown ? null : included.reduce((s, i) => s + (i.hours ?? 0), 0),
    byCategory: {
      materials: byCatOre.materials / 100,
      electrician: byCatOre.electrician / 100,
      plumber: byCatOre.plumber / 100,
      other: byCatOre.other / 100,
    },
    includedCount: included.length,
    unknownItems,
    excludedRequired,
  };
}

// ---------------------------------------------------------------------------
// Grensen mot motoren: prosentpoeng → desimal (én gang)
// ---------------------------------------------------------------------------

const pct = (v: number | null): number | null => (v === null ? null : v / 100);

export function toEngineInput(v: ScenarioValues, reno: RenovationTotals = renovationTotals(v)): EngineInput {
  return {
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
    financingShare: pct(v.financingPct),
    saleFixedCost: v.saleFixedCost,
    saleCommissionRate: pct(v.saleCommissionPct),
    saleBasis: v.saleBasis,
    salePrices: { low: v.saleLow, base: v.saleBase, high: v.saleHigh },
    ownHours: reno.hours,
    hourValue: v.hourValue,
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

export function evaluateScenario(v: ScenarioValues, options: { detailed?: boolean } = {}): ScenarioEvaluation {
  const renovation = renovationTotals(v);
  const input = toEngineInput(v, renovation);
  const evaluation = evaluate(input, options);
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

export type ValueOrigin = 'annonse' | 'analyse' | 'profil' | 'modellregel' | 'standard';
export const VALUE_ORIGIN_LABEL: Record<ValueOrigin, string> = {
  annonse: 'Fra annonsen',
  analyse: 'Analyseanslag',
  profil: 'Din profilforutsetning',
  modellregel: 'Modellregel',
  standard: 'Standardvalg',
};

export interface BaseValues {
  values: ScenarioValues;
  origins: Partial<Record<keyof ScenarioValues, ValueOrigin>>;
}

function cloneItems(items: RenovationItem[]): RenovationItem[] {
  return items.map((i) => ({ ...i }));
}

export function buildBaseValues(args: {
  property: Property;
  snapshot: PropertySnapshot;
  analysis: SharedAnalysis;
  defaults: ProfileDefaults;
}): BaseValues {
  const { property, snapshot, analysis, defaults } = args;
  const est = analysis.estimates;
  const rule = est.dutyRule ?? defaultDutyRule(property.tenure);
  const option =
    est.renovationOptions.find((o) => o.id === est.defaultRenovationOptionId) ?? est.renovationOptions[0] ?? null;
  const category = propertyCategory(property.propertyType);

  const values: ScenarioValues = {
    buyerType: category === 'leilighet' ? defaults.buyerTypeApartment : defaults.buyerTypeHouse,
    purchasePrice: est.suggestedPurchasePrice ?? snapshot.askingPrice,
    debtAtPurchase: snapshot.sharedDebt,
    debtAtSale: est.debtAtSale ?? snapshot.sharedDebt,
    dutyBasis: rule.basis,
    dutyPct: rule.ratePct,
    dutyCustomBase: rule.customBase,
    buyFees: est.buyFees ?? defaults.buyFees,
    renovationMode: option ? 'tiltak' : 'rundsum',
    renovationOptionId: option?.id ?? null,
    renovationItems: option ? cloneItems(option.items) : [],
    renovationLumpSum: null,
    lumpSumHours: null,
    vatIncluded: option?.vatIncluded ?? true,
    reservePct: defaults.reservePct,
    months: est.months ?? option?.suggestedMonths ?? defaults.months,
    monthlyCost: est.monthlyTotal,
    interestPct: defaults.interestPct,
    financingPct: defaults.financingPct,
    saleBasis: est.sale.basis,
    saleLow: est.sale.low,
    saleBase: est.sale.base,
    saleHigh: est.sale.high,
    saleFixedCost: defaults.saleFixedCost,
    saleCommissionPct: defaults.saleCommissionPct,
    hourValue: defaults.hourValue,
    profitTarget: defaults.profitTarget,
    taxMode: 'uavklart',
    taxPct: null,
    startBid: null,
    walkAway: null,
    notes: '',
  };
  const origins: BaseValues['origins'] = {
    buyerType: 'profil',
    purchasePrice: est.suggestedPurchasePrice !== null ? 'analyse' : 'annonse',
    debtAtPurchase: 'annonse',
    debtAtSale: est.debtAtSale !== null ? 'analyse' : 'annonse',
    dutyBasis: 'modellregel',
    dutyPct: 'modellregel',
    buyFees: est.buyFees !== null ? 'analyse' : 'profil',
    renovationItems: 'analyse',
    reservePct: 'profil',
    months: est.months !== null || option?.suggestedMonths ? 'analyse' : 'profil',
    monthlyCost: 'analyse',
    interestPct: 'profil',
    financingPct: 'profil',
    saleBasis: 'analyse',
    saleLow: 'analyse',
    saleBase: 'analyse',
    saleHigh: 'analyse',
    saleFixedCost: 'profil',
    saleCommissionPct: 'profil',
    hourValue: 'profil',
    profitTarget: 'profil',
    taxMode: 'standard',
    vatIncluded: 'standard',
  };
  return { values, origins };
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
  { key: 'monthlyCost', label: 'Månedlige kostnader', kind: 'money' },
  { key: 'interestPct', label: 'Rente', kind: 'pct' },
  { key: 'financingPct', label: 'Låneandel', kind: 'pct' },
  { key: 'saleBasis', label: 'Prisgrunnlag for salg', kind: 'enum' },
  { key: 'saleLow', label: 'Salgspris lav', kind: 'money' },
  { key: 'saleBase', label: 'Salgspris normal', kind: 'money' },
  { key: 'saleHigh', label: 'Salgspris høy', kind: 'money' },
  { key: 'saleFixedCost', label: 'Faste salgskostnader', kind: 'money' },
  { key: 'saleCommissionPct', label: 'Meglerprovisjon', kind: 'pct' },
  { key: 'hourValue', label: 'Timeverdi eget arbeid', kind: 'money' },
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
