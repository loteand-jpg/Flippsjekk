import type { MarketIndex } from '../domain/areaProfile';
import {
  propertyCategory,
  STANDARD_CLASSES,
  type ComparableKind,
  type DataQualityLevel,
  type LayoutMatch,
  type LocationLevel,
  type PriceBasis,
  type PropertyType,
  type ReferenceRole,
  type StandardClass,
  type Tenure,
} from '../domain/enums';

/**
 * Markedsvekting V1 – ren, deterministisk og versjonert.
 *
 * Tar sammenlignbare objekter og et mål (scenarioets sluttprodukt) og gir:
 *  - fysisk likhet 0–100 (lokasjon 25, standard 25, BRA-i 15, soverom/planløsning 15, boligtype/eierform 10, øvrige 10)
 *  - pålitelighetsfaktor og markedstidsfaktor (adskilt fra fysisk likhet)
 *  - effektiv vekt = fysisk/100 × pålitelighet × markedstid (× standardtak)
 *  - markedsjustert pris: pris × indeks nå / indeks ved salg
 *  - rolle: primær, sekundær eller markedsreferanse (aktive annonser er aldri oppnådd salgspris)
 *  - salgsestimat: robust vektet median som anker, vektet gjennomsnitt som kontroll, og et usikkerhetsintervall
 *    som utvides når grunnlaget er svakere. For svakt grunnlag gis ingen tvungen verdi.
 *
 * Alle terskler er samlet i `MARKET_PARAMS` og merket med modellversjon. Ingen markedsdata hentes herfra.
 */
export const MARKET_MODEL_VERSION = '1.0.0';

export const MARKET_PARAMS = {
  /** Poenggrenser for fysisk likhet (sum 100). */
  points: { location: 25, standard: 25, area: 15, rooms: 15, type: 10, other: 10 },
  location: { samme_bygg: 25, mikroomrade: 20, bydel: 14, kommune: 8, region: 3, ukjent: 8 } as Record<LocationLevel | 'ukjent', number>,
  /** Andel av standardpoengene etter avstand i standardklasse (0 = lik). */
  standardShare: [1, 0.8, 0.45, 0.15, 0],
  standardUnknownShare: 0.4,
  /** Tak på effektiv vekt når standarden avviker – gammel standard skal ikke dominere et nyoppusset scenario. */
  standardCap: { 0: 1, 1: 1, 2: 0.75, 3: 0.4, 4: 0.4 } as Record<number, number>,
  standardCapUnknown: 0.9,
  /** BRA-avvik (andel) → poeng. */
  areaSteps: [
    { maxDev: 0.05, points: 15 },
    { maxDev: 0.1, points: 13 },
    { maxDev: 0.15, points: 10 },
    { maxDev: 0.25, points: 6 },
    { maxDev: 0.35, points: 3 },
  ],
  reliability: { hoy: 1, middels: 0.85, lav: 0.6, ukjent: 0.8, missingDate: 0.8, missingArea: 0.6, notNormalized: 0.5 },
  /** Roller. */
  primary: { minPhysical: 65, minReliability: 0.6, maxStandardGap: 1, maxAreaDeviation: 0.25 },
  secondaryMinWeightInAnchor: 0.15,
  /** Markedstidsfaktor etter alder i måneder: [alder, faktor]. Lineær interpolasjon. */
  timeWithIndex: [
    [0, 1],
    [6, 1],
    [24, 0.85],
    [36, 0.75],
    [60, 0.6],
  ] as [number, number][],
  timeWithoutIndex: [
    [0, 1],
    [3, 1],
    [6, 0.85],
    [12, 0.65],
    [24, 0.45],
    [36, 0.3],
  ] as [number, number][],
  /** Datakvalitet (score 0–100) og tier. */
  quality: { weightSales: 70, weightActive: 15, weightReliability: 15, goodSaleWeight: 0.5, fullCreditWeight: 0.75, targetSales: 3, activeMinPhysical: 60 },
  tiers: { svaert_godt: 85, normalt: 65, svakt: 40 },
  /** Halv intervallbredde i prosent: [bunnscore, toppscore, bredde ved topp, bredde ved bunn]. */
  width: {
    svaert_godt: { top: 100, bottom: 85, atTop: 3, atBottom: 4 },
    normalt: { top: 85, bottom: 65, atTop: 4, atBottom: 6 },
    svakt: { top: 65, bottom: 40, atTop: 7, atBottom: 10 },
  },
  maxHalfWidthPct: 12,
  spreadPenaltyCapPct: 3,
  activeBelowPenaltyPct: 1,
} as const;

export type QualityTier = 'svaert_godt' | 'normalt' | 'svakt' | 'utilstrekkelig';
export const QUALITY_TIER_LABEL: Record<QualityTier, string> = {
  svaert_godt: 'Svært godt grunnlag',
  normalt: 'Normalt grunnlag',
  svakt: 'Svakt grunnlag',
  utilstrekkelig: 'For usikkert',
};

export interface MarketTarget {
  areaBRAi: number | null;
  bedrooms: number | null;
  propertyType: PropertyType | null;
  tenure: Tenure | null;
  /** Standard på sluttproduktet etter oppussing. */
  standardClass: StandardClass;
  floor: number | null;
  elevator: boolean | null;
  balcony: boolean | null;
  parking: boolean | null;
  /** Prisgrunnlaget estimatet skal gis i. */
  basis: PriceBasis;
  /** Fellesgjeld ved salg – trengs for å gå fra totalpris til kontantpris. */
  sharedDebt: number | null;
}

export interface MarketComparable {
  id: string;
  name: string;
  kind: ComparableKind;
  askingPrice: number | null;
  soldPrice: number | null;
  soldTotalPrice: number | null;
  sharedDebt: number | null;
  area: number | null;
  /** Salgs- eller annonsedato (ÅÅÅÅ-MM-DD). */
  date: string | null;
  bedrooms: number | null;
  propertyType: PropertyType | null;
  tenure: Tenure | null;
  locationLevel: LocationLevel | null;
  standardClass: StandardClass | null;
  layoutMatch: LayoutMatch | null;
  floor: number | null;
  elevator: boolean | null;
  balcony: boolean | null;
  parking: boolean | null;
  dataQuality: DataQualityLevel | null;
  /** Manuell markedsjusteringsfaktor (1 = ingen). Går foran indeks hvis oppgitt. */
  marketAdjustment: number | null;
}

export interface MarketOptions {
  /** «I dag» (ÅÅÅÅ-MM-DD). Injiseres, så beregningen er deterministisk. */
  today: string;
  index?: MarketIndex | null;
}

export interface PhysicalMatch {
  total: number;
  location: number;
  standard: number;
  area: number;
  rooms: number;
  type: number;
  other: number;
}

export type ReferenceFlag =
  | 'aktiv_annonse'
  | 'solgt_uten_sum'
  | 'mangler_areal'
  | 'mangler_dato'
  | 'prisgrunnlag_ikke_normalisert'
  | 'gammel_standard'
  | 'bra_avviker_mye';

export interface WeightedReference {
  id: string;
  name: string;
  kind: ComparableKind;
  role: ReferenceRole;
  physical: PhysicalMatch;
  reliabilityFactor: number;
  marketTimeFactor: number;
  /** Effektiv vekt 0–1: fysisk/100 × pålitelighet × markedstid × standardtak. */
  effectiveWeight: number;
  standardGap: number | null;
  areaDeviation: number | null;
  ageMonths: number | null;
  /** Indeksfaktor brukt til markedsjustering (1 uten indeks/justering). */
  marketAdjustmentFactor: number;
  marketAdjusted: boolean;
  /** Totalpris per m² (inkl. fellesgjeld), markedsjustert. null når pris/areal/prisgrunnlag ikke kan brukes. */
  adjustedTotalPerM2: number | null;
  /** Aktive annonser: prisantydning per m². Aldri brukt som oppnådd pris. */
  askingPerM2: number | null;
  usedInAnchor: boolean;
  strength: 'sterk' | 'middels' | 'svak';
  flags: ReferenceFlag[];
  /** Forklaring på norsk: hvorfor referansen er sterk eller svak. */
  reasons: string[];
}

export interface MarketEstimate {
  modelVersion: string;
  status: 'ok' | 'for_usikkert';
  reason: string | null;
  quality: {
    score: number;
    tier: QualityTier;
    goodSales: number;
    effectiveSales: number;
    relevantActive: number;
    notes: string[];
  };
  anchor: { weightedMedianPerM2: number | null; weightedMeanPerM2: number | null; spreadPct: number | null; used: number };
  /** Estimat i målets prisgrunnlag, avrundet til nærmeste 1 000. null ved «for usikkert». */
  estimate: { low: number; base: number; high: number; basis: PriceBasis } | null;
  halfWidthPct: number | null;
  references: WeightedReference[];
  activeSignals: { count: number; medianAskingPerM2: number | null; competingBelowAnchor: boolean };
}

// ---------------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function monthsBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 / 30.4375;
}

function interpolate(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
}

/** Robust vektet median: laveste verdi der kumulativ vekt når 50 %. Ved nøyaktig 50 % tas snittet av de to. */
export function weightedMedian(values: readonly { value: number; weight: number }[]): number | null {
  const items = values.filter((v) => v.weight > 0 && Number.isFinite(v.value)).sort((a, b) => a.value - b.value);
  if (items.length === 0) return null;
  const total = items.reduce((s, v) => s + v.weight, 0);
  let cum = 0;
  for (let i = 0; i < items.length; i++) {
    cum += items[i].weight;
    if (cum > total / 2 + 1e-12) return items[i].value;
    if (Math.abs(cum - total / 2) <= 1e-12 && i + 1 < items.length) return (items[i].value + items[i + 1].value) / 2;
  }
  return items[items.length - 1].value;
}

export function weightedMean(values: readonly { value: number; weight: number }[]): number | null {
  const items = values.filter((v) => v.weight > 0 && Number.isFinite(v.value));
  const total = items.reduce((s, v) => s + v.weight, 0);
  return total > 0 ? items.reduce((s, v) => s + v.value * v.weight, 0) / total : null;
}

// ---------------------------------------------------------------------------
// Fysisk likhet
// ---------------------------------------------------------------------------

export function areaPoints(deviation: number | null): number {
  if (deviation === null) return 0;
  for (const s of MARKET_PARAMS.areaSteps) if (deviation <= s.maxDev + 1e-12) return s.points;
  return 0;
}

const stdIndex = (c: StandardClass | null): number | null => (c === null ? null : STANDARD_CLASSES.indexOf(c));

function boolPoints(a: boolean | null, b: boolean | null, full: number): number {
  if (a === null || b === null) return full / 2;
  return a === b ? full : 0;
}

export function physicalMatch(target: MarketTarget, c: MarketComparable): { match: PhysicalMatch; standardGap: number | null; areaDeviation: number | null } {
  const P = MARKET_PARAMS.points;
  const location = MARKET_PARAMS.location[c.locationLevel ?? 'ukjent'];

  const tIdx = stdIndex(target.standardClass) as number;
  const cIdx = stdIndex(c.standardClass);
  const standardGap = cIdx === null ? null : Math.abs(tIdx - cIdx);
  const standard = P.standard * (standardGap === null ? MARKET_PARAMS.standardUnknownShare : MARKET_PARAMS.standardShare[Math.min(standardGap, 4)]);

  const areaDeviation = target.areaBRAi && c.area ? Math.abs(c.area - target.areaBRAi) / target.areaBRAi : null;
  const area = areaPoints(areaDeviation);

  let bed: number;
  if (target.bedrooms === null || c.bedrooms === null) bed = 3;
  else {
    const d = Math.abs(target.bedrooms - c.bedrooms);
    bed = d === 0 ? 9 : d === 1 ? 4 : 0;
  }
  const layout = c.layoutMatch === 'lik' ? 6 : c.layoutMatch === 'delvis' ? 3 : c.layoutMatch === 'ulik' ? 0 : 2;
  const rooms = bed + layout;

  let typePts: number;
  if (target.propertyType === null || c.propertyType === null) typePts = 2;
  else if (target.propertyType === c.propertyType) typePts = 5;
  else typePts = propertyCategory(target.propertyType) === propertyCategory(c.propertyType) ? 3 : 0;
  let tenurePts: number;
  if (target.tenure === null || c.tenure === null) tenurePts = 2;
  else if (target.tenure === c.tenure) tenurePts = 5;
  else tenurePts = target.tenure !== 'ukjent' && c.tenure !== 'ukjent' ? 2 : 2;
  const type = typePts + tenurePts;

  let floorPts: number;
  if (target.floor === null || c.floor === null) floorPts = 1;
  else {
    const d = Math.abs(target.floor - c.floor);
    floorPts = d === 0 ? 2 : d === 1 ? 1.5 : 0.5;
  }
  const other = floorPts + boolPoints(target.elevator, c.elevator, 1) + boolPoints(target.balcony, c.balcony, 3) + boolPoints(target.parking, c.parking, 2) + 1; // 1 = utsikt/sol (generisk, ukjent)

  const total = round1(location + standard + area + rooms + type + other);
  return {
    match: { total, location, standard: round1(standard), area, rooms, type, other: round1(other) },
    standardGap,
    areaDeviation,
  };
}

// ---------------------------------------------------------------------------
// Prisnormalisering
// ---------------------------------------------------------------------------

/** Totalpris (inkl. fellesgjeld) for et faktisk salg, eller null hvis den ikke kan utledes. */
export function normalizedTotalPrice(c: MarketComparable): number | null {
  const debt = c.sharedDebt ?? (c.soldTotalPrice !== null && c.soldPrice !== null ? c.soldTotalPrice - c.soldPrice : null);
  if (c.soldTotalPrice !== null) return c.soldTotalPrice;
  if (c.soldPrice === null) return null;
  if (debt !== null) return c.soldPrice + debt;
  // Selveier har normalt ingen fellesgjeld. Ellers kan totalprisen ikke utledes.
  return c.tenure === 'selveier' ? c.soldPrice : null;
}

// ---------------------------------------------------------------------------
// Hovedfunksjon
// ---------------------------------------------------------------------------

function tierOf(score: number): QualityTier {
  const t = MARKET_PARAMS.tiers;
  return score >= t.svaert_godt ? 'svaert_godt' : score >= t.normalt ? 'normalt' : score >= t.svakt ? 'svakt' : 'utilstrekkelig';
}

function baseHalfWidth(tier: Exclude<QualityTier, 'utilstrekkelig'>, score: number): number {
  const w = MARKET_PARAMS.width[tier];
  const clamped = Math.min(w.top, Math.max(w.bottom, score));
  return w.atTop + ((w.top - clamped) / (w.top - w.bottom)) * (w.atBottom - w.atTop);
}

export function weighMarket(target: MarketTarget, comparables: readonly MarketComparable[], options: MarketOptions): MarketEstimate {
  const idx = options.index ?? null;
  const idxNow = idx ? idx.indexAt(options.today) : null;

  const refs: WeightedReference[] = comparables.map((c) => {
    const { match, standardGap, areaDeviation } = physicalMatch(target, c);
    const isActive = c.kind === 'prisantydning';
    const flags: ReferenceFlag[] = [];
    const reasons: string[] = [];
    const ageMonths = c.date ? Math.max(0, monthsBetween(c.date, options.today)) : null;
    if (c.date === null) flags.push('mangler_dato');
    if (c.area === null) flags.push('mangler_areal');

    // Markedsjustering: manuell faktor går foran indeks. Uten indeks justeres ikke prisen.
    let adjFactor = 1;
    let adjusted = false;
    if (!isActive) {
      if (c.marketAdjustment !== null) {
        adjFactor = c.marketAdjustment;
        adjusted = true;
      } else if (idx && idxNow !== null && c.date) {
        const idxThen = idx.indexAt(c.date);
        if (idxThen !== null && idxThen > 0) {
          adjFactor = idxNow / idxThen;
          adjusted = true;
        }
      }
    }
    const timeTable = adjusted ? MARKET_PARAMS.timeWithIndex : MARKET_PARAMS.timeWithoutIndex;
    const marketTimeFactor = ageMonths === null ? 0.7 : round2(interpolate(timeTable, ageMonths));

    // Pris per m² i totalpris-grunnlag (inkl. fellesgjeld)
    let adjustedTotalPerM2: number | null = null;
    let askingPerM2: number | null = null;
    let notNormalized = false;
    if (isActive) {
      flags.push('aktiv_annonse');
      if (c.askingPrice !== null && c.area) askingPerM2 = (c.askingPrice + (c.sharedDebt ?? 0)) / c.area;
    } else if (c.kind === 'solgt_uten_sum') {
      flags.push('solgt_uten_sum');
    } else {
      const total = normalizedTotalPrice(c);
      if (total === null && (c.soldPrice !== null || c.soldTotalPrice !== null)) {
        notNormalized = true;
        flags.push('prisgrunnlag_ikke_normalisert');
      }
      if (total !== null && c.area) adjustedTotalPerM2 = (total * adjFactor) / c.area;
    }

    // Pålitelighet
    const R = MARKET_PARAMS.reliability;
    let reliability: number = c.dataQuality === 'hoy' ? R.hoy : c.dataQuality === 'middels' ? R.middels : c.dataQuality === 'lav' ? R.lav : R.ukjent;
    if (c.date === null) reliability *= R.missingDate;
    if (c.area === null) reliability *= R.missingArea;
    if (notNormalized) reliability *= R.notNormalized;
    reliability = round2(Math.min(1, reliability));

    const gapKey = standardGap === null ? null : Math.min(standardGap, 4);
    const standardCap = gapKey === null ? MARKET_PARAMS.standardCapUnknown : MARKET_PARAMS.standardCap[gapKey];
    if (standardGap !== null && standardGap >= 2) flags.push('gammel_standard');
    if (areaDeviation !== null && areaDeviation > 0.35) flags.push('bra_avviker_mye');

    let effectiveWeight = (match.total / 100) * reliability * marketTimeFactor * standardCap;
    // Aktive annonser er markedssignal og har aldri vekt i prisankeret. Salg uten brukbar pris har heller ingen vekt.
    if (isActive || c.kind === 'solgt_uten_sum' || adjustedTotalPerM2 === null) effectiveWeight = 0;
    effectiveWeight = round2(effectiveWeight);

    // Rolle
    let role: ReferenceRole;
    const P = MARKET_PARAMS.primary;
    if (isActive) role = 'markedsreferanse';
    else if (
      adjustedTotalPerM2 !== null &&
      match.total >= P.minPhysical &&
      reliability >= P.minReliability &&
      (standardGap === null || standardGap <= P.maxStandardGap) &&
      areaDeviation !== null &&
      areaDeviation <= P.maxAreaDeviation
    )
      role = 'primaer';
    else role = 'sekundaer';

    // Forklaring
    const locLabel = c.locationLevel === 'samme_bygg' ? 'Samme bygg' : c.locationLevel === 'mikroomrade' ? 'Mikroområde' : c.locationLevel === 'bydel' ? 'Bydel' : c.locationLevel === 'kommune' ? 'Kommune/by' : c.locationLevel === 'region' ? 'Region' : 'Ukjent lokasjon';
    reasons.push(`${locLabel} (${match.location}/25 for lokasjon).`);
    if (standardGap === null) reasons.push('Standard er ukjent, så standardlikheten er usikker.');
    else if (standardGap === 0) reasons.push(`Lik standard som sluttproduktet (${match.standard}/25).`);
    else if (standardGap >= 2) reasons.push(`Standarden avviker ${standardGap} trinn fra sluttproduktet. Prisen sier lite om ferdigverdi, og vekten er begrenset.`);
    else reasons.push(`Standarden avviker ett trinn (${match.standard}/25).`);
    if (areaDeviation === null) reasons.push('BRA-i mangler eller er ukjent.');
    else reasons.push(`BRA-i avviker ${Math.round(areaDeviation * 100)} % (${match.area}/15).`);
    if (isActive) reasons.push('Aktiv annonse – prisantydning, ikke oppnådd salgspris. Brukes bare som markedssignal.');
    else if (c.kind === 'solgt_uten_sum') reasons.push('Solgt uten dokumentert salgssum – kan ikke brukes som pris.');
    else if (ageMonths !== null) reasons.push(adjusted ? `Salget er ${Math.round(ageMonths)} mnd gammelt og markedsjustert (faktor ${round2(adjFactor)}).` : `Salget er ${Math.round(ageMonths)} mnd gammelt og ikke markedsjustert, så vekten faller raskere.`);
    if (notNormalized) reasons.push('Prisgrunnlaget (kontant/total) kan ikke normaliseres uten fellesgjeld.');
    if (c.dataQuality === 'lav') reasons.push('Lav datakvalitet reduserer vekten.');

    // For aktive annonser sier styrken hvor relevant signalet er (fysisk likhet), siden vekten er 0.
    const strengthBasis = isActive ? match.total / 100 : effectiveWeight;
    const strength: WeightedReference['strength'] = strengthBasis >= 0.6 ? 'sterk' : strengthBasis >= 0.3 ? 'middels' : 'svak';
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      role,
      physical: match,
      reliabilityFactor: reliability,
      marketTimeFactor,
      effectiveWeight,
      standardGap,
      areaDeviation,
      ageMonths: ageMonths === null ? null : round1(ageMonths),
      marketAdjustmentFactor: round2(adjFactor),
      marketAdjusted: adjusted,
      adjustedTotalPerM2: adjustedTotalPerM2 === null ? null : Math.round(adjustedTotalPerM2),
      askingPerM2: askingPerM2 === null ? null : Math.round(askingPerM2),
      usedInAnchor: false,
      strength,
      flags,
      reasons,
    };
  });

  // Anker: primærreferanser. Har vi færre enn to, tas sekundære med nok vekt med (svakere grunnlag).
  const sold = refs.filter((r) => r.role !== 'markedsreferanse' && r.adjustedTotalPerM2 !== null && r.effectiveWeight > 0);
  const primaries = sold.filter((r) => r.role === 'primaer');
  const usedSet = primaries.length >= 2 ? primaries : sold.filter((r) => r.role === 'primaer' || r.effectiveWeight >= MARKET_PARAMS.secondaryMinWeightInAnchor);
  for (const r of refs) r.usedInAnchor = usedSet.includes(r);
  const pts = usedSet.map((r) => ({ value: r.adjustedTotalPerM2 as number, weight: r.effectiveWeight }));
  const median = weightedMedian(pts);
  const mean = weightedMean(pts);
  let spreadPct: number | null = null;
  if (median !== null && median > 0 && pts.length > 0) {
    const mad = weightedMedian(pts.map((p) => ({ value: Math.abs(p.value - median), weight: p.weight })));
    spreadPct = mad === null ? null : round1((mad / median) * 100);
  }

  // Aktive annonser som markedssignal
  const actives = refs.filter((r) => r.role === 'markedsreferanse');
  const activeAsk = actives.filter((r) => r.askingPerM2 !== null).map((r) => ({ value: r.askingPerM2 as number, weight: Math.max(0.01, r.physical.total / 100) }));
  const medianAsk = weightedMedian(activeAsk);
  const competingBelow = median !== null && actives.some((r) => r.askingPerM2 !== null && r.physical.total >= MARKET_PARAMS.quality.activeMinPhysical && (r.askingPerM2 as number) < median * 0.95);
  const relevantActive = actives.filter((r) => r.physical.total >= MARKET_PARAMS.quality.activeMinPhysical).length;

  // Datakvalitet
  const Q = MARKET_PARAMS.quality;
  const goodSales = usedSet.filter((r) => r.effectiveWeight >= Q.goodSaleWeight).length;
  const effectiveSales = usedSet.reduce((s, r) => s + Math.min(1, r.effectiveWeight / Q.fullCreditWeight), 0);
  const top3 = [...usedSet].sort((a, b) => b.effectiveWeight - a.effectiveWeight).slice(0, 3);
  const avgRel = top3.length ? top3.reduce((s, r) => s + r.reliabilityFactor, 0) / top3.length : 0;
  const score = Math.round((Math.min(Q.targetSales, effectiveSales) / Q.targetSales) * Q.weightSales + (relevantActive >= 1 ? Q.weightActive : 0) + avgRel * Q.weightReliability);
  const tier = usedSet.length === 0 ? 'utilstrekkelig' : tierOf(score);
  const notes: string[] = [];
  notes.push(`${goodSales} gode dokumenterte salg, ${relevantActive} relevant aktiv annonse.`);
  if (primaries.length < 2) notes.push('Færre enn to primærreferanser – sekundære referanser er tatt med med lavere vekt.');
  if (competingBelow) notes.push('En nærliggende aktiv annonse ligger under ankerprisen (konkurranse).');

  const quality = { score, tier, goodSales, effectiveSales: round2(effectiveSales), relevantActive, notes } as MarketEstimate['quality'];
  const ranked = [...refs].sort((a, b) => {
    const order = { primaer: 0, sekundaer: 1, markedsreferanse: 2 } as const;
    return order[a.role] - order[b.role] || b.effectiveWeight - a.effectiveWeight || a.name.localeCompare(b.name, 'nb');
  });
  const activeSignals = { count: actives.length, medianAskingPerM2: medianAsk === null ? null : Math.round(medianAsk), competingBelowAnchor: competingBelow };
  const anchor = { weightedMedianPerM2: median === null ? null : Math.round(median), weightedMeanPerM2: mean === null ? null : Math.round(mean), spreadPct, used: usedSet.length };

  const insufficient = (reason: string): MarketEstimate => ({
    modelVersion: MARKET_MODEL_VERSION,
    status: 'for_usikkert',
    reason,
    quality: { ...quality, tier: 'utilstrekkelig' },
    anchor,
    estimate: null,
    halfWidthPct: null,
    references: ranked,
    activeSignals,
  });

  if (median === null || usedSet.length === 0) return insufficient('Ingen faktiske, dokumenterte salg som kan brukes som anker.');
  if (tier === 'utilstrekkelig') return insufficient('Grunnlaget er for svakt til å gi et salgsestimat. Det gis ingen tvungen normalverdi.');
  if (!target.areaBRAi) return insufficient('Målets BRA-i er ukjent, så pris per m² kan ikke regnes om til en salgspris.');

  // Intervall: bredere ved svakere grunnlag, med tillegg for spredning og konkurrerende annonser.
  let halfWidth = baseHalfWidth(tier, score);
  if (spreadPct !== null) halfWidth += Math.min(MARKET_PARAMS.spreadPenaltyCapPct, spreadPct * 0.5);
  if (competingBelow) halfWidth += MARKET_PARAMS.activeBelowPenaltyPct;
  halfWidth = round1(Math.min(MARKET_PARAMS.maxHalfWidthPct, halfWidth));

  const baseTotal = median * target.areaBRAi;
  let basePrice = baseTotal;
  if (target.basis === 'kontant') {
    let debt = target.sharedDebt;
    if (debt === null && target.tenure === 'selveier') debt = 0;
    if (debt === null) return insufficient('Fellesgjeld ved salg er ukjent, så totalpris kan ikke regnes om til kontantpris.');
    basePrice = baseTotal - debt;
  }
  const roundK = (n: number) => Math.round(n / 1000) * 1000;
  const lowTotal = baseTotal * (1 - halfWidth / 100);
  const highTotal = baseTotal * (1 + halfWidth / 100);
  const shift = basePrice - baseTotal; // 0 for totalpris, −fellesgjeld for kontantpris
  return {
    modelVersion: MARKET_MODEL_VERSION,
    status: 'ok',
    reason: null,
    quality,
    anchor,
    estimate: { low: roundK(lowTotal + shift), base: roundK(basePrice), high: roundK(highTotal + shift), basis: target.basis },
    halfWidthPct: halfWidth,
    references: ranked,
    activeSignals,
  };
}

// ---------------------------------------------------------------------------
// Adaptere fra domenemodellen
// ---------------------------------------------------------------------------

import type { ComparableSale, Property, PropertySnapshot, ScenarioValues, UserComparable } from '../domain/schemas';
import type { ResolvedAnalysisScenario } from '../domain/analysisScenarios';

/** Gjør et sammenlignbart objekt (fra analysen eller brukerens egne) om til markedsvektingens inndata. Ukjent = null. */
export function toMarketComparable(c: ComparableSale | UserComparable): MarketComparable {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    askingPrice: c.askingPrice,
    soldPrice: c.soldPrice,
    soldTotalPrice: c.soldTotalPrice,
    sharedDebt: c.sharedDebt ?? null,
    area: c.area,
    date: c.date,
    bedrooms: c.bedrooms ?? null,
    propertyType: c.propertyType ?? null,
    tenure: c.tenure ?? null,
    locationLevel: c.locationLevel ?? null,
    standardClass: c.standardClass ?? null,
    layoutMatch: c.layoutMatch ?? null,
    floor: c.floor ?? null,
    elevator: c.elevator ?? null,
    balcony: c.balcony ?? null,
    parking: c.parking ?? null,
    dataQuality: c.dataQuality ?? null,
    marketAdjustment: c.marketAdjustment ?? null,
  };
}

/** Målet for markedsvektingen: boligen slik den blir etter scenarioet (sluttproduktet), i scenarioets prisgrunnlag. */
export function marketTargetFor(args: {
  property: Property;
  snapshot: PropertySnapshot | null;
  values: Pick<ScenarioValues, 'saleBasis' | 'debtAtSale'>;
  scenario: Pick<ResolvedAnalysisScenario, 'endProduct'> | null;
  /** Standard etter oppussing. Standard: nyoppusset. */
  standardClass?: StandardClass;
}): MarketTarget {
  const { property, snapshot, values, scenario } = args;
  return {
    areaBRAi: snapshot?.areaBRAi ?? null,
    bedrooms: scenario?.endProduct.bedrooms ?? snapshot?.bedrooms ?? null,
    propertyType: property.propertyType,
    tenure: property.tenure,
    standardClass: args.standardClass ?? 'nyoppusset',
    floor: snapshot?.floor ?? null,
    elevator: null,
    balcony: null,
    parking: null,
    basis: values.saleBasis,
    sharedDebt: values.debtAtSale,
  };
}
