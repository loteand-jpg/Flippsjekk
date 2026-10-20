import type { Breakdown } from '../../../calc/engine';
import type { QualityTier } from '../../../calc/market';
import { CHANGE_LEVEL_LABEL, STANDARD_CLASS_LABEL, type StandardClass } from '../../../domain/enums';
import type { AnalysisScenario, Risk } from '../../../domain/schemas';
import { formatNOK } from '../../../lib/format';

/**
 * «Hva driver caset?» Faktabaserte punkter fra scenarioet, kalkylen, risikoene og markedsgrunnlaget som allerede finnes.
 * Ingen fritekst fra AI og ingen nye beregninger: hvert punkt peker tilbake på kilden det kommer fra.
 */
export type DriverSource = 'scenario' | 'kalkyle' | 'marked' | 'risiko' | 'data';
export interface Driver {
  text: string;
  source: DriverSource;
}

export const SOURCE_LABEL: Record<DriverSource, string> = { scenario: 'Scenario', kalkyle: 'Kalkyle', marked: 'Marked', risiko: 'Risiko', data: 'Datagrunnlag' };

/** Oppussing regnes som «tung» når den utgjør minst denne andelen av samlet prosjektkostnad. */
export const RENOVATION_HEAVY_SHARE = 0.2;
export const MAX_DRIVERS = 5;

export interface DriverInput {
  base: Breakdown | null;
  scenario: Pick<AnalysisScenario, 'title' | 'endProduct' | 'screening' | 'requiresApproval' | 'requirements' | 'feasibility'> | null;
  snapshotBedrooms: number | null;
  marketTier: QualityTier | null;
  /** Antall primærreferanser (faktiske, dokumenterte salg) og om noen av dem ligger i samme bygg. */
  primaryReferences: number;
  sameBuildingReference: boolean;
  /** Aktive risikoer med kjent alvorlighet, sortert synkende (høyest først). */
  risks: Pick<Risk, 'title' | 'level'>[];
  unknownRisks: number;
  missingChecks: number;
  maxBid: number | null;
  maxBidStatus: 'ok' | 'none' | 'capped' | null;
  hourlyTarget: number | null;
}

export function buildDrivers(i: DriverInput): { up: Driver[]; down: Driver[] } {
  const up: Driver[] = [];
  const down: Driver[] = [];
  const b = i.base;
  const s = i.scenario;

  if (s) {
    const to = s.endProduct.bedrooms;
    const added = s.screening?.addedBedrooms ?? null;
    if (to !== null && i.snapshotBedrooms !== null && to > i.snapshotBedrooms) up.push({ text: `+${to - i.snapshotBedrooms} soverom (${i.snapshotBedrooms} → ${to})`, source: 'scenario' });
    else if (added !== null && added > 0) up.push({ text: `+${added} soverom i ${s.title}`, source: 'scenario' });
    if (s.endProduct.kitchenChange === 'nytt' || s.endProduct.kitchenChange === 'oppgradering') up.push({ text: `Kjøkken: ${CHANGE_LEVEL_LABEL[s.endProduct.kitchenChange].toLowerCase()}`, source: 'scenario' });
    if (s.endProduct.bathChange === 'nytt' || s.endProduct.bathChange === 'oppgradering') up.push({ text: `Bad: ${CHANGE_LEVEL_LABEL[s.endProduct.bathChange].toLowerCase()}`, source: 'scenario' });
    const std = s.endProduct.standardClass as StandardClass | null | undefined;
    if (std === 'nyoppusset' || std === 'oppgradert') up.push({ text: `Sluttstandard: ${STANDARD_CLASS_LABEL[std].toLowerCase()}`, source: 'scenario' });
    if (s.requiresApproval || s.requirements.length > 0) {
      down.push({ text: `Må avklares før gjennomføring: ${s.requirements.slice(0, 2).join('; ') || 'krever godkjenning'}`, source: 'scenario' });
    } else if (s.feasibility === 'betinget' || s.feasibility === 'uavklart') {
      down.push({ text: 'Gjennomførbarheten er ikke avklart', source: 'scenario' });
    }
  }

  if (i.sameBuildingReference) up.push({ text: 'Dokumentert salg i samme bygg som referanse', source: 'marked' });
  else if (i.primaryReferences >= 2) up.push({ text: `${i.primaryReferences} primærreferanser med faktisk salg`, source: 'marked' });
  if (i.marketTier === 'svaert_godt') up.push({ text: 'Svært godt markedsgrunnlag for salgsverdien', source: 'marked' });
  if (i.marketTier === 'svakt' || i.marketTier === 'utilstrekkelig') down.push({ text: i.marketTier === 'svakt' ? 'Svakt markedsgrunnlag for salgsverdien' : 'For usikkert markedsgrunnlag for salgsverdien', source: 'marked' });

  if (b) {
    if (i.maxBidStatus === 'ok' && i.maxBid !== null) {
      const floor = Math.floor(i.maxBid / 1000) * 1000;
      if (floor > b.P) up.push({ text: `Kjøpsprisen er ${formatNOK(floor - b.P)} under anbefalt maksbud`, source: 'kalkyle' });
      else if (floor < b.P) down.push({ text: `Kjøpsprisen er ${formatNOK(b.P - floor)} over anbefalt maksbud`, source: 'kalkyle' });
    }
    if (b.profit <= 0) down.push({ text: `Forventet fortjeneste er ${formatNOK(b.profit)}`, source: 'kalkyle' });
    if (b.C > 0 && b.RB / b.C >= RENOVATION_HEAVY_SHARE) down.push({ text: `Høy oppussingskostnad: ${formatNOK(b.RB)} inkl. reserve`, source: 'kalkyle' });
    if (b.meetsHourlyRequirement === false) down.push({ text: `Timekravet${i.hourlyTarget !== null ? ` (${formatNOK(i.hourlyTarget)}/t)` : ''} er ikke oppfylt ved kjøpsprisen`, source: 'kalkyle' });
    if (b.equityGap !== null && b.equityGap > 0 && b.availableEquity !== null) down.push({ text: `Egenkapitalbehov ${formatNOK(b.equityNeed)} mot ${formatNOK(b.availableEquity)} tilgjengelig`, source: 'kalkyle' });
  }

  for (const r of i.risks.slice(0, 2)) if (r.level !== null) down.push({ text: `${r.title} (alvorlighet ${r.level}/10)`, source: 'risiko' });
  if (i.unknownRisks > 0) down.push({ text: `${i.unknownRisks} risiko${i.unknownRisks === 1 ? '' : 'er'} med ukjent alvorlighet`, source: 'risiko' });
  if (i.missingChecks > 0) down.push({ text: `${i.missingChecks} sjekkpunkt${i.missingChecks === 1 ? '' : 'er'} mangler dokumentasjon`, source: 'data' });

  return { up: up.slice(0, MAX_DRIVERS), down: down.slice(0, MAX_DRIVERS) };
}
