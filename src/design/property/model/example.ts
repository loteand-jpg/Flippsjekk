import { recommendedBidOf } from '../../../calc/engine';
import { buildBaseValues, evaluateScenario } from '../../../calc/scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../../../config/defaults';
import { buildProperty } from '../../../data/analysisBuilder';
import { DEMO_FINN, SEED_PROPERTIES } from '../../../data/seedProperties';
import { resolveAnalysisScenarios } from '../../../domain/analysisScenarios';
import { FEASIBILITY_LABEL, type FeasibilityStatus } from '../../../domain/enums';
import { floorToThousand } from '../../shared/present';

/**
 * Eksempel til forsiden: «fra dette → til dette» regnet av samme motor som resten av appen, på demoobjektet Elvekanten 17 B
 * (fiktive data). Tallene er ikke oppdiktet – de er Basis og et alternativ med nytt soverom slik demoanalysen definerer dem, med
 * motorens standardforutsetninger. Datoen er fast, så eksemplet ikke endrer seg fra dag til dag.
 */
const FIXED_NOW = new Date('2026-10-16T08:00:00.000Z');

export interface ExampleVersion {
  title: string;
  bedrooms: number | null;
  sale: number;
  profit: number;
  maxBid: number | null;
  feasibility: FeasibilityStatus;
  feasibilityLabel: string;
}

export interface ExampleCase {
  address: string;
  area: number | null;
  todayBedrooms: number | null;
  from: ExampleVersion;
  to: ExampleVersion;
}

export function buildExampleCase(): ExampleCase | null {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === DEMO_FINN.sharedAB);
  if (!spec) return null;
  const built = buildProperty({ ...spec, analysisAgeDays: 1, snapshotAgeHours: 1 }, FIXED_NOW);
  const defs = resolveAnalysisScenarios(built.analysis);
  const version = (id: string): ExampleVersion | null => {
    const d = defs.find((x) => x.id === id);
    if (!d) return null;
    const values = buildBaseValues({ property: built.property, snapshot: built.snapshot, analysis: built.analysis, defaults: NEW_ACCOUNT_DEFAULTS, analysisScenarioId: id }).values;
    const ev = evaluateScenario(values).evaluation;
    if (!ev.base) return null;
    const bid = recommendedBidOf(ev);
    return { title: d.title, bedrooms: d.endProduct.bedrooms, sale: ev.base.V, profit: ev.base.profit, maxBid: bid.price === null ? null : floorToThousand(bid.price), feasibility: d.feasibility, feasibilityLabel: FEASIBILITY_LABEL[d.feasibility] };
  };
  const base = defs.find((d) => d.kind === 'basis');
  // Alternativet med flest soverom – det som viser mest av «fra dette → til dette».
  const alt = defs.filter((d) => d.kind === 'alternativ').sort((a, b) => (b.endProduct.bedrooms ?? 0) - (a.endProduct.bedrooms ?? 0))[0];
  const from = base ? version(base.id) : null;
  const to = alt ? version(alt.id) : null;
  if (!from || !to) return null;
  return { address: built.property.address, area: built.snapshot.areaBRAi, todayBedrooms: built.snapshot.bedrooms, from, to };
}
