import { riskBand, RISK_BAND_LABEL, type RiskBand } from '../../../domain/assessment';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { RISK_CATEGORY_LABEL, type RiskCategory, type UncertaintyLevel } from '../../../domain/enums';
import type { Risk } from '../../../domain/schemas';
import { formatNOK } from '../../../lib/format';

/**
 * Risiko knyttet til delene av boligen – men BARE der analysen faktisk støtter koblingen: risikoer med kategori (våtrom, elektrisk,
 * vann/avløp, tak/fasade, fukt, regulering/sameie, marked) og scenarioets egne endringer (bad, kjøkken, planløsning, godkjenning).
 * Det finnes ingen plantegning eller romkart i dataene, så ingenting plasseres «i» boligen. Finnes ingen kobling, returneres tom liste og
 * visningen faller tilbake på de seks delte risikodimensjonene.
 */
export type SpotId = 'planlosning' | 'bad' | 'kjokken' | 'elektrisk' | 'vann' | 'tak_fasade' | 'fukt' | 'marked';

export interface SpotRisk {
  title: string;
  level: number | null;
  cost: string | null;
  action: string;
  category: string;
}

export interface HomeSpot {
  id: SpotId;
  label: string;
  band: RiskBand;
  /** Tekstlig nivå – status står aldri bare som farge. */
  levelText: string;
  risks: SpotRisk[];
  /** Fra scenarioet (ikke risikoregisteret): endringer og krav som berører delen. */
  notes: string[];
}

export const SPOT_ORDER: SpotId[] = ['planlosning', 'bad', 'kjokken', 'elektrisk', 'vann', 'tak_fasade', 'fukt', 'marked'];
export const SPOT_LABEL: Record<SpotId, string> = {
  planlosning: 'Planløsning og godkjenning',
  bad: 'Bad og våtrom',
  kjokken: 'Kjøkken',
  elektrisk: 'Elektrisk anlegg',
  vann: 'Vann og avløp',
  tak_fasade: 'Tak og fasade',
  fukt: 'Fukt og grunn',
  marked: 'Marked og salg',
};

const SPOT_OF: Record<RiskCategory, SpotId | null> = {
  vatrom: 'bad',
  elektrisk: 'elektrisk',
  vann_avlop: 'vann',
  tak_fasade: 'tak_fasade',
  fukt_grunn: 'fukt',
  regulering: 'planlosning',
  sameie_borettslag: 'planlosning',
  marked: 'marked',
  // Disse hører ikke til en bestemt del av boligen og vises bare i de seks dimensjonene.
  prosjekt: null,
  dokumentasjon: null,
  finansiering: null,
  annet: null,
};

const RANK: Record<RiskBand, number> = { uavklart: -1, lav: 0, middels: 1, hoy: 2 };
const worst = (a: RiskBand, b: RiskBand): RiskBand => (a === 'uavklart' ? b : b === 'uavklart' ? a : RANK[a] >= RANK[b] ? a : b);

const costText = (r: Risk): string | null => {
  if (r.costLow === null && r.costHigh === null) return null;
  if (r.costLow !== null && r.costHigh !== null) return `${formatNOK(r.costLow)} – ${formatNOK(r.costHigh)}`;
  return r.costHigh !== null ? `inntil ${formatNOK(r.costHigh)}` : `minst ${formatNOK(r.costLow)}`;
};

const bandText = (b: RiskBand) => (b === 'uavklart' ? 'Uavklart – ikke vurdert' : `${RISK_BAND_LABEL[b]} risiko`);

export function buildHomeRisks(input: {
  risks: readonly Risk[];
  scenario: Pick<ResolvedAnalysisScenario, 'endProduct' | 'requirements' | 'requiresApproval' | 'risk' | 'feasibilityRationale' | 'saleSource'>;
  saleCertaintyLabel: string | null;
  saleCertaintyBand: RiskBand | null;
}): HomeSpot[] {
  const { risks, scenario } = input;
  const spots = new Map<SpotId, { risks: SpotRisk[]; levels: number[]; unknown: number; notes: string[]; extraBand: RiskBand | null }>();
  const spot = (id: SpotId) => {
    let s = spots.get(id);
    if (!s) {
      s = { risks: [], levels: [], unknown: 0, notes: [], extraBand: null };
      spots.set(id, s);
    }
    return s;
  };

  for (const r of risks) {
    const kitchen = /kjøkken/i.test(r.title);
    const id = kitchen ? 'kjokken' : SPOT_OF[r.category];
    if (!id) continue;
    const s = spot(id);
    s.risks.push({ title: r.title, level: r.level, cost: costText(r), action: r.action, category: RISK_CATEGORY_LABEL[r.category] });
    if (r.level === null) s.unknown++;
    else s.levels.push(r.level);
  }

  const e = scenario.endProduct;
  if (e.bathChange === 'oppgradering' || e.bathChange === 'nytt') spot('bad').notes.push(`Scenarioet ${e.bathChange === 'nytt' ? 'gir nytt bad' : 'oppgraderer badet'}.`);
  if (e.kitchenChange === 'oppgradering' || e.kitchenChange === 'nytt') spot('kjokken').notes.push(`Scenarioet ${e.kitchenChange === 'nytt' ? 'gir nytt kjøkken' : 'oppgraderer kjøkkenet'}.`);
  if (scenario.saleSource === 'scenario') {
    if (e.layoutNote.trim()) spot('planlosning').notes.push(e.layoutNote.trim());
    if (scenario.requiresApproval) {
      spot('planlosning').notes.push('Krever tillatelse eller godkjenning som ikke er avklart.');
    }
    for (const q of scenario.requirements) spot('planlosning').notes.push(q);
    const approval = scenario.risk?.approval;
    if (approval) spot('planlosning').extraBand = approval as UncertaintyLevel;
  }
  if (input.saleCertaintyLabel) {
    const s = spot('marked');
    s.notes.push(`Salgsverdiens sikkerhet: ${input.saleCertaintyLabel.toLowerCase()}.`);
    s.extraBand = input.saleCertaintyBand;
  }

  const out: HomeSpot[] = [];
  for (const id of SPOT_ORDER) {
    const s = spots.get(id);
    if (!s) continue;
    // En del som bare har en nøytral scenarionotat (f.eks. «gir nytt bad») uten risiko eller nivå vises ikke som risiko.
    const hasRisk = s.risks.length > 0 || s.extraBand !== null;
    if (!hasRisk) continue;
    let band: RiskBand = s.levels.length ? riskBand(Math.max(...s.levels)) : 'uavklart';
    if (s.extraBand) band = worst(band, s.extraBand);
    out.push({
      id,
      label: SPOT_LABEL[id],
      band,
      levelText: bandText(band),
      risks: s.risks.sort((a, b) => (b.level ?? -1) - (a.level ?? -1)),
      notes: [...new Set(s.notes)],
    });
  }
  return out;
}
