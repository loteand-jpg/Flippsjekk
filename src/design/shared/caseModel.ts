import { computeCore, type Breakdown, type Evaluation } from '../../calc/engine';

/**
 * Diagramdata fra eksisterende motorresultater. Ingenting beregnes her bortsett fra å kalle motorens egen `computeCore`
 * med en annen kjøpspris (samme deterministiske funksjon som kalkylen bruker).
 */

export interface CostSegment {
  id: 'purchase' | 'buyCosts' | 'renovation' | 'carry' | 'saleCosts';
  label: string;
  amount: number;
}

/** Kostnadsfordeling: kjøp, kjøpskostnader, oppussing, renter og drift, salgskostnader. Summerer til samlet kostnad C. */
export function costSegments(b: Breakdown): CostSegment[] {
  return [
    { id: 'purchase', label: 'Kjøpspris', amount: b.P },
    { id: 'buyCosts', label: 'Kjøpskostnader', amount: b.K },
    { id: 'renovation', label: 'Oppussing inkl. reserve', amount: b.RB },
    { id: 'carry', label: 'Renter og drift', amount: b.I + b.O },
    { id: 'saleCosts', label: 'Salgskostnader', amount: b.Csale },
  ];
}

export interface PricePoint {
  price: number;
  profit: number;
  projectReturn: number | null;
  profitPerOwnHour: number | null;
  equityNeed: number;
  equityGap: number | null;
  meetsHourly: boolean | null;
}

/** Resultat ved en annen kjøpspris, regnet av motoren med alle andre forutsetninger uendret. null når kalkylen ikke er komplett. */
export function atPurchasePrice(ev: Pick<Evaluation, 'resolved' | 'base'>, price: number): PricePoint | null {
  if (!ev.resolved || !ev.base) return null;
  const b = computeCore(ev.resolved, price, ev.base.V);
  return { price, profit: b.profit, projectReturn: b.projectReturn, profitPerOwnHour: b.profitPerOwnHour, equityNeed: b.equityNeed, equityGap: b.equityGap, meetsHourly: b.meetsHourlyRequirement };
}

const NICE_STEPS = [10_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000];

/** Rundt steg slik at ±3 steg dekker ca. ±18 % av kjøpsprisen. */
export function niceStep(center: number): number {
  const target = (center * 0.18) / 3;
  return NICE_STEPS.find((s) => s >= target) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

/** Prisrader med dagens kjøpspris nøyaktig i midten (så raden stemmer med kalkylen) og rene steg på hver side. */
export function priceSteps(center: number, step = niceStep(center), each = 3): number[] {
  return Array.from({ length: each * 2 + 1 }, (_, k) => center + (k - each) * step).filter((p) => p > 0);
}

/** Punkter til sensitivitetsdiagrammet (tett) og tabellen (færre, rene steg). */
export function sensitivitySeries(ev: Pick<Evaluation, 'resolved' | 'base'>, min: number, max: number, n = 40): PricePoint[] {
  const out: PricePoint[] = [];
  for (let k = 0; k <= n; k++) {
    const p = Math.round((min + ((max - min) * k) / n) / 1000) * 1000;
    const pt = atPurchasePrice(ev, p);
    if (pt) out.push(pt);
  }
  return out;
}

export interface LimitRow {
  id: string;
  label: string;
  /** Høyeste kjøpspris som oppfyller kravet. null = ingen pris oppfyller kravet. */
  price: number | null;
  /** Er dette en del av anbefalt maksbud (laveste relevante grense), eller bare til informasjon? */
  counts: boolean;
  limiting: boolean;
  note: string;
}

/**
 * Maksbudgrensene fra motoren: fortjenestemål og timekrav (disse avgjør anbefalt maksbud, laveste vinner), samt
 * prosjektavkastning 15 % / 20 % fra maksbudtabellen som ren informasjon – de er IKKE en del av anbefalingen.
 */
export function limitRows(ev: Pick<Evaluation, 'recommendedMaxBid' | 'maxBidTable'>): LimitRow[] {
  const rec = ev.recommendedMaxBid;
  const rows: LimitRow[] = [];
  for (const l of rec?.limits ?? []) {
    rows.push({
      id: l.id,
      label: l.id === 'profit' ? `${Math.round(l.target).toLocaleString('nb-NO')} kr fortjeneste` : `${Math.round(l.target).toLocaleString('nb-NO')} kr per egeninnsatstime`,
      price: l.result.price,
      counts: true,
      limiting: l.id === rec?.limitedBy,
      note: l.id === 'profit' ? 'Ditt fortjenestemål' : 'Ditt timekrav',
    });
  }
  for (const n of rec?.notApplicable ?? []) rows.push({ id: `na-${n.id}`, label: n.id === 'hourly' ? 'Timekrav' : 'Fortjenestemål', price: null, counts: false, limiting: false, note: n.reason });
  for (const t of ev.maxBidTable.filter((m) => m.kind === 'return')) {
    rows.push({ id: `return-${t.target}`, label: `${(t.target * 100).toLocaleString('nb-NO')} % prosjektavkastning`, price: t.price, counts: false, limiting: false, note: 'Til informasjon – inngår ikke i anbefalt maksbud' });
  }
  return rows;
}
