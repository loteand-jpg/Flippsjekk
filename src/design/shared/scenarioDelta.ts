import type { Breakdown } from '../../calc/engine';

/**
 * Scenariodelta: «Hva får jeg igjen for ekstra investering?» Ren regnskapsidentitet over to eksisterende motorresultater
 * (profit = kontantsalg − samlet kostnad, der kostnad = kjøp + kjøpskostnader + oppussing inkl. reserve + renter + drift + salgskostnader).
 * Ingen nye forutsetninger og ingen egen kalkyle: summen av linjene er alltid lik endringen i fortjeneste.
 */
export interface DeltaLine {
  id: 'sale' | 'renovation' | 'carry' | 'purchase' | 'saleCosts';
  label: string;
  /** Effekt på fortjeneste (kr). Positiv = bedre. */
  amount: number;
}

export interface ScenarioDelta {
  lines: DeltaLine[];
  /** Alternativ minus basis, i fortjeneste. */
  netProfit: number;
  /** Endring i kontantsalg. */
  sale: number;
  /** Endring i oppussing inkl. reserve. */
  renovation: number;
  /** Endring i samlet kostnad. */
  totalCost: number;
  equityNeed: number | null;
  ownHours: number | null;
  months: number;
  projectReturn: number | null;
  profitPerOwnHour: number | null;
  /** Satt når kalkylene bruker ulik kjøpspris (f.eks. privat overstyring i basis, grunnlaget i alternativet). Da ligger en del av endringen i prisen, ikke i scenarioet. */
  purchase: { alt: number; base: number } | null;
}

const r = (n: number) => Math.round(n);
const diffOrNull = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

export function scenarioDelta(alt: Breakdown, base: Breakdown): ScenarioDelta {
  const netProfit = r(alt.profit) - r(base.profit);
  const lines: DeltaLine[] = [
    { id: 'sale', label: 'Salgsverdi', amount: r(alt.S - base.S) },
    { id: 'renovation', label: 'Oppussing inkl. reserve', amount: -r(alt.RB - base.RB) },
    { id: 'carry', label: 'Renter og drift (tid)', amount: -r(alt.I + alt.O - (base.I + base.O)) },
  ];
  const purchase = -r(alt.P + alt.K - (base.P + base.K));
  const saleCosts = -r(alt.Csale - base.Csale);
  if (purchase !== 0) lines.push({ id: 'purchase', label: 'Kjøpspris og kjøpskostnader', amount: purchase });
  if (saleCosts !== 0) lines.push({ id: 'saleCosts', label: 'Salgskostnader', amount: saleCosts });
  // Avrundingsrest (høyst noen kroner) legges på «Renter og drift», så linjene alltid summerer til netto og salgsverdi,
  // oppussing og netto fortsatt stemmer med differansene i tabellen.
  const rest = netProfit - lines.reduce((s, l) => s + l.amount, 0);
  if (rest !== 0) lines[2].amount += rest;
  return {
    lines,
    netProfit,
    sale: r(alt.S - base.S),
    renovation: r(alt.RB - base.RB),
    totalCost: r(alt.C - base.C),
    equityNeed: diffOrNull(alt.equityNeed, base.equityNeed),
    ownHours: diffOrNull(alt.ownHours, base.ownHours),
    months: alt.months - base.months,
    projectReturn: diffOrNull(alt.projectReturn, base.projectReturn),
    profitPerOwnHour: diffOrNull(alt.profitPerOwnHour, base.profitPerOwnHour),
    purchase: r(alt.P) !== r(base.P) ? { alt: alt.P, base: base.P } : null,
  };
}
