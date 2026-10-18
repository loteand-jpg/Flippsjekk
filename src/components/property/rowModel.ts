import { effectiveRisks } from '../../domain/risks';
import { aggregateRisk, dataQuality, preliminaryReasons, type QualityGrade, type RiskBand } from '../../domain/assessment';
import type { BuyerType, PriceBasis, PropertyType, Recommendation, SaleStatus, Tenure, WorkStatus } from '../../domain/enums';
import type { ProfileDefaults, PropertySnapshot, ScenarioValues, SharedAnalysis } from '../../domain/schemas';
import { buildBaseValues, diffValues, evaluateScenario, type ScenarioEvaluation } from '../../calc/scenario';
import type { MyPropertyItem } from '../../services/types';

export type ScenarioSource = 'mitt_scenario' | 'grunnanalyse' | 'importert' | null;

export interface PropertyRow {
  id: string;
  item: MyPropertyItem;
  finnId: string;
  address: string;
  district: string | null;
  city: string;
  propertyType: PropertyType;
  tenure: Tenure;
  areaBRAi: number | null;
  isDemo: boolean;
  isSynthetic: boolean;
  askingCash: number | null;
  sharedDebt: number | null;
  /** Prisantydning + fellesgjeld, ekskl. kjøpskostnader. */
  askingInclDebt: number | null;
  purchase: number | null;
  maxBid: number | null;
  maxBidStatus: 'ok' | 'none' | 'capped' | null;
  renovationWithReserve: number | null;
  saleBase: number | null;
  saleBasis: PriceBasis | null;
  profit: number | null;
  /** Fortjeneste før skatt per egeninnsatstime. Egen tid er ikke en kostnad. */
  profitPerOwnHour: number | null;
  meetsHourlyRequirement: boolean | null;
  equityNeed: number | null;
  equityGap: number | null;
  projectReturn: number | null;
  months: number | null;
  ownHours: number | null;
  riskScore: number | null;
  riskBand: RiskBand;
  riskUnknown: number;
  quality: QualityGrade | null;
  qualityCoverage: number | null;
  recommendation: Recommendation | null;
  nextViewing: string | null;
  bidDay: string | null;
  bidDayIsOverride: boolean;
  saleStatus: SaleStatus | null;
  workStatus: WorkStatus;
  buyerType: BuyerType | null;
  favorite: boolean;
  analysisUpdatedAt: string | null;
  listingCheckedAt: string | null;
  scenarioSource: ScenarioSource;
  scenarioName: string | null;
  calcStatus: 'complete' | 'incomplete' | 'invalid' | 'pending' | 'none';
  missing: string[];
  warnings: string[];
  preliminary: string[];
  hasNewVersion: boolean;
  jobRunning: boolean;
  jobFailed: boolean;
  archived: boolean;
  scenarioEval: ScenarioEvaluation | null;
  values: ScenarioValues | null;
}

export function snapshotFor(item: Pick<MyPropertyItem, 'snapshots' | 'snapshot'>, analysis: SharedAnalysis | null): PropertySnapshot | null {
  if (!analysis) return item.snapshot;
  return item.snapshots.find((s) => s.id === analysis.snapshotId) ?? item.snapshot;
}

export function baseValuesFor(item: MyPropertyItem, analysis: SharedAnalysis | null, defaults: ProfileDefaults, analysisScenarioId: string | null = item.primaryScenario?.values.analysisScenarioId ?? null) {
  if (!analysis) return null;
  const snap = snapshotFor(item, analysis);
  if (!snap) return null;
  // Grunnverdiene følger agentscenarioet (basis/alternativ) som kalkylen er bygget på.
  return buildBaseValues({ property: item.property, snapshot: snap, analysis, defaults, analysisScenarioId });
}

export function buildRow(item: MyPropertyItem, defaults: ProfileDefaults, now: Date): PropertyRow {
  const p = item.property;
  const snap = item.snapshot;
  const base = item.baseAnalysis;
  const latest = item.latestAnalysis;
  const scenario = item.primaryScenario;
  let values: ScenarioValues | null = scenario?.values ?? null;
  let scenarioSource: ScenarioSource = null;
  if (base && base.visibility === 'private') scenarioSource = 'importert';
  else if (scenario && base) {
    const bv = baseValuesFor(item, base, defaults);
    scenarioSource = bv && diffValues(bv.values, scenario.values).length > 0 ? 'mitt_scenario' : 'grunnanalyse';
  } else if (!scenario && base) {
    values = baseValuesFor(item, base, defaults)?.values ?? null;
    scenarioSource = values ? 'grunnanalyse' : null;
  }
  const ev = values ? evaluateScenario(values, { detailed: false }) : null;
  const b = ev?.evaluation.base ?? null;
  const assessAnalysis = base ?? latest;
  const risk = assessAnalysis ? aggregateRisk(effectiveRisks(assessAnalysis.risks, item.riskEdits).active) : null;
  const quality = assessAnalysis ? dataQuality(assessAnalysis, snapshotFor(item, assessAnalysis)) : null;
  const upcoming = item.viewings
    .filter((v) => v.status !== 'avlyst' && Date.parse(v.end ?? v.start) >= now.getTime())
    .sort((a, c) => a.start.localeCompare(c.start));
  const bidDay = item.bidOverride?.start ?? item.bidDay?.start ?? null;
  const askingInclDebt = snap?.askingPrice != null && snap.sharedDebt != null ? snap.askingPrice + snap.sharedDebt : null;
  const calcStatus: PropertyRow['calcStatus'] = item.activeJob && !base ? 'pending' : ev ? ev.evaluation.status : 'none';
  return {
    id: p.id,
    item,
    finnId: p.finnId,
    address: item.link.label ?? p.address,
    district: p.district,
    city: p.city,
    propertyType: p.propertyType,
    tenure: p.tenure,
    areaBRAi: snap?.areaBRAi ?? null,
    isDemo: p.dataOrigin === 'demo' || p.dataOrigin === 'synthetic',
    isSynthetic: p.dataOrigin === 'synthetic',
    askingCash: snap?.askingPrice ?? null,
    sharedDebt: snap?.sharedDebt ?? null,
    askingInclDebt,
    purchase: values?.purchasePrice ?? null,
    maxBid: ev?.evaluation.maxBid?.price ?? null,
    maxBidStatus: ev?.evaluation.maxBid?.status ?? null,
    renovationWithReserve: b?.RB ?? null,
    saleBase: values?.saleBase ?? null,
    saleBasis: values?.saleBasis ?? null,
    profit: b?.profit ?? null,
    profitPerOwnHour: b?.profitPerOwnHour ?? null,
    meetsHourlyRequirement: b?.meetsHourlyRequirement ?? null,
    equityNeed: b?.equityNeed ?? null,
    equityGap: b?.equityGap ?? null,
    projectReturn: b?.projectReturn ?? null,
    months: values?.months ?? null,
    ownHours: ev?.renovation.hours ?? null,
    riskScore: risk?.score ?? null,
    riskBand: risk?.band ?? 'uavklart',
    riskUnknown: risk?.unknownCount ?? 0,
    quality: quality?.grade ?? null,
    qualityCoverage: quality?.coverage ?? null,
    recommendation: assessAnalysis?.recommendation ?? null,
    nextViewing: upcoming[0]?.start ?? null,
    bidDay,
    bidDayIsOverride: Boolean(item.bidOverride),
    saleStatus: snap?.saleStatus ?? null,
    workStatus: item.link.workStatus,
    buyerType: values?.buyerType ?? null,
    favorite: item.link.favorite,
    analysisUpdatedAt: base?.publishedAt ?? base?.createdAt ?? null,
    listingCheckedAt: snap?.observedAt ?? null,
    scenarioSource,
    scenarioName: scenario?.name ?? null,
    calcStatus,
    missing: ev?.missing.map((m) => m.label) ?? [],
    warnings: ev?.warnings.map((w) => w.message) ?? [],
    preliminary: assessAnalysis ? preliminaryReasons(assessAnalysis) : [],
    hasNewVersion: Boolean(latest && base && base.visibility === 'shared' && latest.version > base.version),
    jobRunning: Boolean(item.activeJob),
    jobFailed: Boolean(item.lastFailedJob && !item.activeJob && !base),
    archived: Boolean(item.link.archivedAt),
    scenarioEval: ev,
    values,
  };
}

/** Aktiv liste: ikke arkivert, og (med mindre brukeren viser dem) ikke solgt/trukket. */
export function isActiveRow(r: PropertyRow, showClosed: boolean): boolean {
  if (r.archived) return false;
  if (!showClosed && (r.saleStatus === 'solgt' || r.saleStatus === 'trukket')) return false;
  return true;
}

export function isArchiveRow(r: PropertyRow): boolean {
  return r.archived || r.saleStatus === 'solgt' || r.saleStatus === 'trukket';
}
