import type { RiskCategory } from './enums';
import type { Risk, UserRisk } from './schemas';

/** Felt brukeren kan redigere på en risiko. Tomt kostnadsfelt = ukjent, aldri 0. */
export interface RiskFields {
  title: string;
  category: RiskCategory;
  /** 1–10, eller null = ukjent alvorlighet. */
  level: number | null;
  costLow: number | null;
  costHigh: number | null;
  rationale: string;
  action: string;
}

export interface RiskIssue {
  field: 'title' | 'level' | 'costLow' | 'costHigh';
  message: string;
}

export function validateRisk(r: RiskFields): RiskIssue[] {
  const out: RiskIssue[] = [];
  if (!r.title.trim()) out.push({ field: 'title', message: 'Gi risikoen en tittel.' });
  if (r.title.length > 120) out.push({ field: 'title', message: 'Tittelen kan ha høyst 120 tegn.' });
  if (r.level !== null && (!Number.isInteger(r.level) || r.level < 1 || r.level > 10)) out.push({ field: 'level', message: 'Alvorlighet må være et helt tall fra 1 til 10, eller ukjent.' });
  for (const [f, label] of [['costLow', 'Laveste kostnad'], ['costHigh', 'Høyeste kostnad']] as const) {
    const v = r[f];
    if (v !== null && (!Number.isFinite(v) || v < 0)) out.push({ field: f, message: `${label} kan ikke være negativ.` });
  }
  if (r.costLow !== null && r.costHigh !== null && r.costLow > r.costHigh) out.push({ field: 'costHigh', message: 'Høyeste kostnad kan ikke være lavere enn laveste.' });
  return out;
}

export type RiskOrigin = 'grunnlag' | 'endret' | 'mine';

export interface EffectiveRisk extends Risk {
  origin: RiskOrigin;
  /** Brukerens rad (endring eller egen risiko) – null for uendret grunnlag. */
  editId: string | null;
  /** Grunnlagets opprinnelige verdi når brukeren har endret den. */
  original: Risk | null;
}

export interface EffectiveRisks {
  /** Risikoer som gjelder for brukeren (grunnlag med egne endringer + egne). */
  active: EffectiveRisk[];
  /** Grunnlagsrisikoer brukeren har skjult. Vises alltid, så ingenting forsvinner uten at det synes. */
  hidden: EffectiveRisk[];
}

const fieldsOf = (u: UserRisk): Risk => ({ id: u.baseRiskId ?? u.id, title: u.title, category: u.category, level: u.level, costLow: u.costLow, costHigh: u.costHigh, rationale: u.rationale, sourceId: null, action: u.action });

/**
 * Slår sammen grunnlagets risikoer med brukerens private endringer.
 * En endring som peker på en risiko som ikke lenger finnes i grunnlaget, beholdes som egen risiko.
 */
export function effectiveRisks(base: readonly Risk[], mine: readonly UserRisk[]): EffectiveRisks {
  const active: EffectiveRisk[] = [];
  const hidden: EffectiveRisk[] = [];
  const edits = new Map(mine.filter((m) => m.baseRiskId !== null).map((m) => [m.baseRiskId as string, m]));
  for (const r of base) {
    const e = edits.get(r.id);
    if (!e) active.push({ ...r, origin: 'grunnlag', editId: null, original: null });
    else if (e.removed) hidden.push({ ...r, origin: 'grunnlag', editId: e.id, original: r });
    else active.push({ ...fieldsOf(e), id: r.id, sourceId: r.sourceId, origin: 'endret', editId: e.id, original: r });
  }
  const baseIds = new Set(base.map((r) => r.id));
  for (const m of mine) {
    if (m.baseRiskId !== null && baseIds.has(m.baseRiskId)) continue;
    if (m.removed) continue;
    active.push({ ...fieldsOf(m), id: m.id, origin: 'mine', editId: m.id, original: null });
  }
  return { active, hidden };
}
