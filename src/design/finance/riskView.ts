import { riskBand, type DataQuality, type RiskBand } from '../../domain/assessment';
import { RISK_CATEGORY_LABEL, SCENARIO_RISK_LABEL, UNCERTAINTY_LABEL, type RiskCategory, type UncertaintyLevel } from '../../domain/enums';
import type { Risk, ScenarioRisk } from '../../domain/schemas';
import { formatNOK } from '../../lib/format';

/**
 * Presentasjon av risiko i seks dimensjoner: teknisk, kostnad, tid, myndighet/godkjenning, marked og dokumentasjon.
 * Bygger bare på eksisterende data (objektets risikoer, scenarioets egen risiko, datadekning) – ingen ny risikomotor og ingen ny score.
 * Hver dimensjon forklarer hva risikoen er, hvorfor den finnes og hva som bør avklares.
 */
export type RiskDimId = 'teknisk' | 'kostnad' | 'tid' | 'myndighet' | 'marked' | 'dokumentasjon';

export const RISK_DIM_LABEL: Record<RiskDimId, string> = {
  teknisk: 'Teknisk',
  kostnad: 'Kostnad',
  tid: 'Tid',
  myndighet: 'Myndighet og godkjenning',
  marked: 'Marked',
  dokumentasjon: 'Dokumentasjon',
};

export const RISK_DIM_ORDER: RiskDimId[] = ['teknisk', 'kostnad', 'tid', 'myndighet', 'marked', 'dokumentasjon'];

const CATEGORY_DIM: Record<RiskCategory, RiskDimId> = {
  vatrom: 'teknisk',
  elektrisk: 'teknisk',
  vann_avlop: 'teknisk',
  tak_fasade: 'teknisk',
  fukt_grunn: 'teknisk',
  regulering: 'myndighet',
  sameie_borettslag: 'myndighet',
  marked: 'marked',
  prosjekt: 'tid',
  dokumentasjon: 'dokumentasjon',
  finansiering: 'kostnad',
  annet: 'kostnad',
};

export const dimOfCategory = (c: RiskCategory): RiskDimId => CATEGORY_DIM[c];

const SCENARIO_DIM: Partial<Record<RiskDimId, keyof Omit<ScenarioRisk, 'note'>>> = { teknisk: 'technical', kostnad: 'cost', tid: 'time', myndighet: 'approval' };

const BAND_RANK: Record<RiskBand, number> = { uavklart: -1, lav: 0, middels: 1, hoy: 2 };
const fromUncertainty = (u: UncertaintyLevel): RiskBand => u;

export interface RiskDimension {
  id: RiskDimId;
  label: string;
  band: RiskBand;
  /** Kort, tekstlig nivå – status skal aldri bare vises med farge. */
  levelText: string;
  /** Hva som ligger bak nivået: objektets risikoer i dimensjonen. */
  what: { title: string; level: number | null; category: string; cost: string | null }[];
  /** Hvorfor nivået er satt (begrunnelser fra analysen og scenarioet). */
  why: string[];
  /** Hva som bør avklares før bud. */
  clarify: string[];
  /** Hvor nivået kommer fra. */
  basis: ('objekt' | 'scenario' | 'datadekning' | 'markedsgrunnlag')[];
}

export interface RiskViewInput {
  risks: readonly Risk[];
  scenarioRisk: ScenarioRisk | null | undefined;
  scenarioRequirements: readonly string[];
  scenarioFeasibilityRationale: string;
  quality: Pick<DataQuality, 'grade' | 'coverage' | 'missingChecks' | 'undocumentedFacts'>;
  /** Salgsverdiens sikkerhet for scenarioet (fra markedsmotoren/rangeringen), eller null. */
  saleCertaintyLabel: string | null;
  saleCertaintyBand: RiskBand | null;
}

const costText = (r: Risk): string | null => {
  if (r.costLow === null && r.costHigh === null) return null;
  if (r.costLow !== null && r.costHigh !== null) return `${formatNOK(r.costLow)} – ${formatNOK(r.costHigh)}`;
  return r.costHigh !== null ? `inntil ${formatNOK(r.costHigh)}` : `minst ${formatNOK(r.costLow)}`;
};

function worst(a: RiskBand, b: RiskBand): RiskBand {
  if (a === 'uavklart') return b;
  if (b === 'uavklart') return a;
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}

export function buildRiskDimensions(input: RiskViewInput): RiskDimension[] {
  const out: RiskDimension[] = [];
  for (const id of RISK_DIM_ORDER) {
    const mapped = input.risks.filter((r) => dimOfCategory(r.category) === id).sort((a, b) => (b.level ?? -1) - (a.level ?? -1));
    const knownLevels = mapped.filter((r) => r.level !== null).map((r) => r.level as number);
    let band: RiskBand = knownLevels.length ? riskBand(Math.max(...knownLevels)) : 'uavklart';
    const basis: RiskDimension['basis'] = [];
    const why: string[] = [];
    const clarify: string[] = [];
    if (mapped.length) basis.push('objekt');
    for (const r of mapped.slice(0, 3)) {
      if (r.rationale) why.push(`${r.title}: ${r.rationale}`);
      if (r.action) clarify.push(r.action);
    }

    const sKey = SCENARIO_DIM[id];
    if (sKey && input.scenarioRisk) {
      band = mapped.length && knownLevels.length ? worst(band, fromUncertainty(input.scenarioRisk[sKey])) : fromUncertainty(input.scenarioRisk[sKey]);
      basis.push('scenario');
      why.unshift(`Scenarioets ${SCENARIO_RISK_LABEL[sKey].toLowerCase()}: ${UNCERTAINTY_LABEL[input.scenarioRisk[sKey]].toLowerCase()}.${input.scenarioRisk.note ? ` ${input.scenarioRisk.note}` : ''}`);
    }
    if (id === 'myndighet') {
      if (input.scenarioFeasibilityRationale) why.push(input.scenarioFeasibilityRationale);
      clarify.push(...input.scenarioRequirements);
    }
    if (id === 'kostnad') {
      const withCost = input.risks.filter((r) => r.costHigh !== null || r.costLow !== null);
      const high = withCost.reduce((s, r) => s + (r.costHigh ?? 0), 0);
      const low = withCost.reduce((s, r) => s + (r.costLow ?? 0), 0);
      if (withCost.length) why.push(`Registrerte risikoer kan gi merkostnader på ${formatNOK(low)} – ${formatNOK(high)} utover oppussingsreserven (summen av enkeltrisikoene, ikke en prognose).`);
    }
    if (id === 'marked') {
      if (input.saleCertaintyLabel) {
        basis.push('markedsgrunnlag');
        why.push(`Salgsverdiens sikkerhet: ${input.saleCertaintyLabel.toLowerCase()}.`);
        if (input.saleCertaintyBand) band = band === 'uavklart' ? input.saleCertaintyBand : worst(band, input.saleCertaintyBand);
      }
    }
    if (id === 'dokumentasjon') {
      basis.push('datadekning');
      const qBand: RiskBand = input.quality.grade === 'hoy' ? 'lav' : input.quality.grade === 'middels' ? 'middels' : 'hoy';
      band = band === 'uavklart' ? qBand : worst(band, qBand);
      why.push(`Datadekning ${Math.round(input.quality.coverage * 100)} %.${input.quality.undocumentedFacts.length ? ` Ikke dokumentert: ${input.quality.undocumentedFacts.join(', ').toLowerCase()}.` : ''}`);
      for (const c of input.quality.missingChecks.slice(0, 4)) if (c.beforeBidTask) clarify.push(c.beforeBidTask);
    }

    const levelText =
      band === 'uavklart' ? 'Uavklart – ikke vurdert' : band === 'lav' ? 'Lav risiko' : band === 'middels' ? 'Middels risiko' : 'Høy risiko';
    out.push({
      id,
      label: RISK_DIM_LABEL[id],
      band,
      levelText,
      what: mapped.map((r) => ({ title: r.title, level: r.level, category: RISK_CATEGORY_LABEL[r.category], cost: costText(r) })),
      why: [...new Set(why)],
      clarify: [...new Set(clarify)],
      basis,
    });
  }
  return out;
}
