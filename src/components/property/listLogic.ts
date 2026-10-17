import type { QualityGrade, RiskBand } from '../../domain/assessment';
import type { BuyerType, PropertyType, Recommendation, SaleStatus, Tenure, WorkStatus } from '../../domain/enums';
import { compareNullableLast, type SortDirection } from '../../lib/sort';
import { isActiveRow, isArchiveRow, type PropertyRow } from './rowModel';

export interface ListFilters {
  query: string;
  districts: string[];
  types: PropertyType[];
  tenures: Tenure[];
  buyerTypes: BuyerType[];
  priceMin: number | null;
  priceMax: number | null;
  profitMin: number | null;
  riskBands: RiskBand[];
  qualities: QualityGrade[];
  recommendations: Recommendation[];
  workStatuses: WorkStatus[];
  saleStatuses: SaleStatus[];
  favoritesOnly: boolean;
  /** Vis solgte/trukne i aktiv liste. */
  showClosed: boolean;
}

export const EMPTY_FILTERS: ListFilters = {
  query: '',
  districts: [],
  types: [],
  tenures: [],
  buyerTypes: [],
  priceMin: null,
  priceMax: null,
  profitMin: null,
  riskBands: [],
  qualities: [],
  recommendations: [],
  workStatuses: [],
  saleStatuses: [],
  favoritesOnly: false,
  showClosed: false,
};

export function activeFilterCount(f: ListFilters): number {
  let n = 0;
  for (const k of ['types', 'tenures', 'buyerTypes', 'riskBands', 'qualities', 'recommendations', 'workStatuses', 'saleStatuses'] as const) if (f[k].length) n++;
  if (f.priceMin !== null || f.priceMax !== null) n++;
  if (f.profitMin !== null) n++;
  if (f.favoritesOnly) n++;
  if (f.showClosed) n++;
  if (f.query.trim()) n++;
  return n;
}

export type SortKey =
  | 'profit'
  | 'return'
  | 'purchase'
  | 'maxBid'
  | 'renovation'
  | 'sale'
  | 'risk'
  | 'quality'
  | 'area'
  | 'months'
  | 'viewing'
  | 'bidDay'
  | 'updated'
  | 'address'
  | 'asking';

export const SORT_LABEL: Record<SortKey, string> = {
  profit: 'Fortjeneste',
  return: 'Prosjektavkastning',
  purchase: 'Kjøpspris',
  maxBid: 'Maksbud',
  renovation: 'Oppussing',
  sale: 'Salgsverdi',
  risk: 'Risiko',
  quality: 'Datakvalitet',
  area: 'Areal',
  months: 'Prosjektvarighet',
  viewing: 'Neste visning',
  bidDay: 'Forventet buddag',
  updated: 'Sist oppdatert',
  address: 'Adresse',
  asking: 'Prisantydning',
};

const QUALITY_RANK: Record<QualityGrade, number> = { lav: 1, middels: 2, hoy: 3 };
const ts = (iso: string | null) => (iso ? Date.parse(iso) : null);

export function sortValue(r: PropertyRow, key: SortKey): number | string | null {
  switch (key) {
    case 'profit':
      return r.profit;
    case 'return':
      return r.projectReturn;
    case 'purchase':
      return r.purchase;
    case 'maxBid':
      return r.maxBid;
    case 'renovation':
      return r.renovationWithReserve;
    case 'sale':
      return r.saleBase;
    case 'risk':
      // Ukjent risiko er ikke 0 – den sorteres sist.
      return r.riskScore;
    case 'quality':
      return r.quality ? QUALITY_RANK[r.quality] : null;
    case 'area':
      return r.areaBRAi;
    case 'months':
      return r.months;
    case 'viewing':
      return ts(r.nextViewing);
    case 'bidDay':
      return ts(r.bidDay);
    case 'updated': {
      const a = ts(r.analysisUpdatedAt);
      const b = ts(r.listingCheckedAt);
      return a === null && b === null ? null : Math.max(a ?? 0, b ?? 0);
    }
    case 'address':
      return r.address;
    case 'asking':
      return r.askingCash;
  }
}

export function sortRows(rows: PropertyRow[], key: SortKey, dir: SortDirection): PropertyRow[] {
  return rows
    .map((row, i) => ({ row, i, v: sortValue(row, key) }))
    .sort((a, b) => compareNullableLast(a.v, b.v, dir) || a.i - b.i)
    .map((x) => x.row);
}

export function applyFilters(rows: PropertyRow[], f: ListFilters, view: 'active' | 'archive'): PropertyRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (view === 'active' ? !isActiveRow(r, f.showClosed) : !isArchiveRow(r)) return false;
    if (q && !`${r.address} ${r.district ?? ''} ${r.city} ${r.finnId}`.toLowerCase().includes(q)) return false;
    // Områdefilter er satt på pause (districts ignoreres), men feltet beholdes så lagrede filtre fortsatt leses.
    if (f.types.length && !f.types.includes(r.propertyType)) return false;
    if (f.tenures.length && !f.tenures.includes(r.tenure)) return false;
    if (f.buyerTypes.length && (!r.buyerType || !f.buyerTypes.includes(r.buyerType))) return false;
    if (f.priceMin !== null && (r.askingCash === null || r.askingCash < f.priceMin)) return false;
    if (f.priceMax !== null && (r.askingCash === null || r.askingCash > f.priceMax)) return false;
    if (f.profitMin !== null && (r.profit === null || r.profit < f.profitMin)) return false;
    if (f.riskBands.length && !f.riskBands.includes(r.riskBand)) return false;
    if (f.qualities.length && (!r.quality || !f.qualities.includes(r.quality))) return false;
    if (f.recommendations.length && (!r.recommendation || !f.recommendations.includes(r.recommendation))) return false;
    if (f.workStatuses.length && !f.workStatuses.includes(r.workStatus)) return false;
    if (f.saleStatuses.length && (!r.saleStatus || !f.saleStatuses.includes(r.saleStatus))) return false;
    if (f.favoritesOnly && !r.favorite) return false;
    return true;
  });
}
