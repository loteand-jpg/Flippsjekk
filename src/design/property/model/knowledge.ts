import { KEY_FACTS, KEY_FACT_LABEL, type DataQuality } from '../../../domain/assessment';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { CHECKLIST_LABEL, TENURE_LABEL } from '../../../domain/enums';
import type { Property, PropertySnapshot, SharedAnalysis } from '../../../domain/schemas';
import { formatNOK } from '../../../lib/format';

/**
 * «Hva vet vi? Hva antar vi? Hva må sjekkes?» – en sortering av det analysen allerede har registrert (fakta med status, sjekkliste, antakelser,
 * usikkerheter, scenariokrav). Ingen ny vurdering: samme data som i datadekningen og risikofanen, bare ordnet etter hvor sikre de er.
 */
export interface KnowledgeItem {
  text: string;
  detail?: string;
}

export interface Knowledge {
  known: KnowledgeItem[];
  assumed: KnowledgeItem[];
  toCheck: KnowledgeItem[];
}

type KeyFact = (typeof KEY_FACTS)[number];

function keyFactValue(k: KeyFact, property: Pick<Property, 'tenure'>, snap: PropertySnapshot): string {
  switch (k) {
    case 'askingPrice':
      return formatNOK(snap.askingPrice);
    case 'sharedDebt':
      return formatNOK(snap.sharedDebt);
    case 'areaBRAi':
      return snap.areaBRAi === null ? 'Ikke oppgitt' : `${snap.areaBRAi.toLocaleString('nb-NO')} m²`;
    case 'buildYear':
      return snap.buildYear === null ? 'Ikke oppgitt' : String(snap.buildYear);
    case 'monthlyCommonCosts':
      return snap.monthlyCommonCosts === null ? 'Ikke oppgitt' : `${formatNOK(snap.monthlyCommonCosts)} per måned`;
    case 'tenure':
      return TENURE_LABEL[property.tenure];
  }
}

const uniq = (items: KnowledgeItem[]): KnowledgeItem[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.text.toLocaleLowerCase('nb-NO');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function buildKnowledge(args: {
  analysis: Pick<SharedAnalysis, 'facts' | 'checklist' | 'assumptions' | 'uncertainties'>;
  property: Pick<Property, 'tenure'>;
  snapshot: PropertySnapshot | null;
  scenario: Pick<ResolvedAnalysisScenario, 'requirements' | 'uncertainty' | 'saleSource'>;
  quality: Pick<DataQuality, 'undocumentedFacts'>;
  /** Er sluttstandarden oppgitt i analysen (true), antatt ut fra oppussingsnivået (false) eller ikke aktuell (null)? */
  standardDocumented: boolean | null;
}): Knowledge {
  const { analysis, snapshot, scenario } = args;
  const known: KnowledgeItem[] = [];
  const assumed: KnowledgeItem[] = [];
  const toCheck: KnowledgeItem[] = [];

  if (snapshot) {
    for (const k of KEY_FACTS) {
      if (snapshot.factSources[k]?.status === 'dokumentert') known.push({ text: KEY_FACT_LABEL[k], detail: keyFactValue(k, args.property, snapshot) });
    }
  }
  for (const f of analysis.facts) {
    if (f.status === 'dokumentert') known.push({ text: f.label, detail: f.value });
    else if (f.status === 'anslag') assumed.push({ text: f.label, detail: `${f.value} (anslag)` });
    else toCheck.push({ text: f.label, detail: 'Ikke avklart' });
  }
  for (const c of analysis.checklist) {
    const label = CHECKLIST_LABEL[c.key];
    if (c.status === 'dokumentert') known.push({ text: label, detail: c.note || 'Dokumentert' });
    else if (c.status === 'delvis') assumed.push({ text: label, detail: c.note || 'Bare delvis dokumentert' });
    else if (c.status === 'mangler') toCheck.push({ text: c.beforeBidTask || `${label} er ikke dokumentert`, detail: c.beforeBidTask ? label : c.note || undefined });
  }
  for (const a of analysis.assumptions) assumed.push({ text: a });
  if (args.standardDocumented === false) assumed.push({ text: 'Sluttstandard er antatt ut fra oppussingsnivået – ikke dokumentert i analysen.' });
  if (scenario.saleSource === 'scenario' && scenario.uncertainty.level !== 'lav') {
    assumed.push({ text: `Salgsverdien for dette sluttproduktet er ${scenario.uncertainty.level === 'uavklart' ? 'ikke vurdert' : `${scenario.uncertainty.level} usikker`}`, detail: scenario.uncertainty.note || undefined });
  }
  for (const u of analysis.uncertainties) toCheck.push({ text: u });
  for (const r of scenario.requirements) toCheck.push({ text: r, detail: 'Krav for dette sluttproduktet' });
  const documented = new Set(known.map((k) => k.text));
  for (const f of args.quality.undocumentedFacts) if (!documented.has(f)) toCheck.push({ text: `${f} er ikke dokumentert` });

  return { known: uniq(known), assumed: uniq(assumed), toCheck: uniq(toCheck) };
}
