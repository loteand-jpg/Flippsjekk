import { computeCore, type Breakdown, type Evaluation, type MaxBidLimitId } from '../../../calc/engine';
import { floorToThousand } from '../../shared/present';

/**
 * Økonomi ved et gitt bud. Bruker motorens egen `computeCore` med bare kjøpsprisen byttet ut (samme funksjon som kalkylen og
 * sensitivitetsvisningene bruker) – ingen egen formel. Svarer på «hvor høyt kan du gå, og hva sitter du igjen med da?».
 */
export interface AtBid {
  /** Maksbudet avrundet ned til hele tusen. */
  price: number;
  profit: number;
  projectReturn: number | null;
  profitPerOwnHour: number | null;
  meetsHourly: boolean | null;
  equityNeed: number;
  equityGap: number | null;
  /** Grensen som setter taket for budet. */
  limitedBy: MaxBidLimitId | null;
}

export function atMaxBid(ev: Pick<Evaluation, 'resolved' | 'base' | 'recommendedMaxBid'>): AtBid | null {
  const rec = ev.recommendedMaxBid;
  if (!ev.resolved || !ev.base || !rec || rec.price === null) return null;
  const price = floorToThousand(rec.price);
  const b: Breakdown = computeCore(ev.resolved, price, ev.base.V);
  return { price, profit: b.profit, projectReturn: b.projectReturn, profitPerOwnHour: b.profitPerOwnHour, meetsHourly: b.meetsHourlyRequirement, equityNeed: b.equityNeed, equityGap: b.equityGap, limitedBy: rec.limitedBy };
}

export interface CostPart {
  id: 'purchase' | 'buyCosts' | 'renovation' | 'carry' | 'saleCosts';
  label: string;
  amount: number;
}

/** Hvor pengene går: kjøp, kjøpskostnader, oppussing inkl. reserve, renter og drift, salgskostnader. Summerer til samlet kostnad (C). */
export function costParts(b: Breakdown): CostPart[] {
  return [
    { id: 'purchase', label: 'Kjøpspris', amount: b.P },
    { id: 'buyCosts', label: 'Kjøpskostnader', amount: b.K },
    { id: 'renovation', label: 'Oppussing inkl. reserve', amount: b.RB },
    { id: 'carry', label: 'Renter og drift', amount: b.I + b.O },
    { id: 'saleCosts', label: 'Salgskostnader', amount: b.Csale },
  ];
}
