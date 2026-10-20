import type { ComparableKind, DataQualityLevel, LayoutMatch, LocationLevel, PriceBasis, PropertyType, StandardClass, Tenure } from './enums';

/** Felt som er felles for grunnlagets og brukerens egne sammenlignbare objekter. */
export interface ComparableFields {
  name: string;
  url: string | null;
  kind: ComparableKind;
  /** Prisantydning (kontant). */
  askingPrice: number | null;
  /** Oppnådd salgspris (kontant, uten fellesgjeld). Bare for faktisk salg. */
  soldPrice: number | null;
  /** Felleskostnader per måned. */
  commonCosts: number | null;
  /** Oppnådd salgspris inkl. fellesgjeld (uten kjøpskostnader). Bare for faktisk salg. */
  soldTotalPrice: number | null;
  area: number | null;
  /** Lokal dato 'YYYY-MM-DD' (solgt-/annonsedato). */
  date: string | null;
  notes: string;
  // Valgfrie egenskaper til markedsvektingen. Mangler de, regnes egenskapen som ukjent (aldri 0/«nei»).
  bedrooms?: number | null;
  propertyType?: PropertyType | null;
  tenure?: Tenure | null;
  /** Fellesgjeld ved salget (kr). Brukes til å normalisere kontantpris mot totalpris. */
  sharedDebt?: number | null;
  locationLevel?: LocationLevel | null;
  standardClass?: StandardClass | null;
  layoutMatch?: LayoutMatch | null;
  floor?: number | null;
  elevator?: boolean | null;
  balcony?: boolean | null;
  parking?: boolean | null;
  viewNote?: string | null;
  dataQuality?: DataQualityLevel | null;
  /** Manuell markedsjusteringsfaktor (1 = ingen). */
  marketAdjustment?: number | null;
  /** Aktive annonser: opprinnelig prisantydning (kontant). Lavere nåværende pris betyr prisnedsatt. */
  originalAskingPrice?: number | null;
}

/** Nøkler for de valgfrie markedsvektingsfeltene. */
export const COMPARABLE_EXTRA_KEYS = ['bedrooms', 'propertyType', 'tenure', 'sharedDebt', 'locationLevel', 'standardClass', 'layoutMatch', 'floor', 'elevator', 'balcony', 'parking', 'viewNote', 'dataQuality', 'marketAdjustment', 'originalAskingPrice'] as const;

export interface LegacyPrice {
  kind: ComparableKind;
  price: number | null;
  priceBasis: PriceBasis;
  debt?: number | null;
}

/**
 * Oversetter «én pris + prisgrunnlag (+ gjeld)» til de eksplisitte prisfeltene.
 * Ukjent gjeld gir ukjent motpart – aldri 0.
 */
export function pricesFromLegacy(l: LegacyPrice): Pick<ComparableFields, 'askingPrice' | 'soldPrice' | 'soldTotalPrice'> {
  const debt = l.debt ?? null;
  const cash = l.price === null ? null : l.priceBasis === 'kontant' ? l.price : debt === null ? null : l.price - debt;
  const total = l.price === null ? null : l.priceBasis === 'total' ? l.price : debt === null ? null : l.price + debt;
  if (l.kind === 'solgt') return { askingPrice: null, soldPrice: cash, soldTotalPrice: total };
  if (l.kind === 'prisantydning') return { askingPrice: cash, soldPrice: null, soldTotalPrice: null };
  return { askingPrice: null, soldPrice: null, soldTotalPrice: null };
}

export type PerM2Basis = 'solgt_total' | 'solgt' | 'prisantydning';
export const PER_M2_BASIS_LABEL: Record<PerM2Basis, string> = {
  solgt_total: 'solgt totalpris',
  solgt: 'solgt pris',
  prisantydning: 'prisantydning',
};

/** kr/m²: solgt totalpris først, så solgt pris, så prisantydning. Null uten areal eller pris. */
export function pricePerM2(c: Pick<ComparableFields, 'area' | 'soldTotalPrice' | 'soldPrice' | 'askingPrice' | 'kind'>): { value: number; basis: PerM2Basis } | null {
  if (!c.area || c.area <= 0) return null;
  if (c.kind === 'solgt') {
    if (c.soldTotalPrice !== null) return { value: c.soldTotalPrice / c.area, basis: 'solgt_total' };
    if (c.soldPrice !== null) return { value: c.soldPrice / c.area, basis: 'solgt' };
    return null;
  }
  if (c.askingPrice !== null) return { value: c.askingPrice / c.area, basis: 'prisantydning' };
  return null;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Median kr/m² for faktiske salg, regnet per prisgrunnlag. Prisantydninger og
 * «solgt uten sum» teller aldri som oppnådd pris. Grunnlagene blandes ikke.
 */
export function soldMedians(cs: Pick<ComparableFields, 'area' | 'soldTotalPrice' | 'soldPrice' | 'askingPrice' | 'kind'>[]): {
  total: { value: number; n: number } | null;
  cash: { value: number; n: number } | null;
} {
  const sold = cs.filter((c) => c.kind === 'solgt' && c.area && c.area > 0);
  const t = sold.filter((c) => c.soldTotalPrice !== null).map((c) => (c.soldTotalPrice as number) / (c.area as number));
  const k = sold.filter((c) => c.soldPrice !== null).map((c) => (c.soldPrice as number) / (c.area as number));
  return { total: t.length ? { value: median(t) as number, n: t.length } : null, cash: k.length ? { value: median(k) as number, n: k.length } : null };
}

export interface ComparableInput extends ComparableFields {}

export interface ComparableIssue {
  field: keyof ComparableFields;
  message: string;
}

/** Validering av brukerinput. Samme regler i skjema og tjeneste. */
export function validateComparable(c: ComparableInput): ComparableIssue[] {
  const out: ComparableIssue[] = [];
  const money = (field: 'askingPrice' | 'soldPrice' | 'commonCosts' | 'soldTotalPrice', label: string) => {
    const v = c[field];
    if (v !== null && (!Number.isFinite(v) || v < 0)) out.push({ field, message: `${label} kan ikke være negativ.` });
  };
  if (!c.name.trim()) out.push({ field: 'name', message: 'Skriv inn navn/adresse på objektet.' });
  if (c.name.length > 120) out.push({ field: 'name', message: 'Navnet kan ha høyst 120 tegn.' });
  money('askingPrice', 'Prisantydning');
  money('soldPrice', 'Solgt pris');
  money('commonCosts', 'Felleskostnader');
  money('soldTotalPrice', 'Solgt totalpris');
  if (c.area !== null && (!Number.isFinite(c.area) || c.area <= 0)) out.push({ field: 'area', message: 'Areal må være større enn 0.' });
  if (c.bedrooms != null && (!Number.isInteger(c.bedrooms) || c.bedrooms < 0 || c.bedrooms > 20)) out.push({ field: 'bedrooms', message: 'Antall soverom må være et helt tall fra 0 til 20.' });
  if (c.marketAdjustment != null && (!Number.isFinite(c.marketAdjustment) || c.marketAdjustment <= 0 || c.marketAdjustment > 3)) out.push({ field: 'marketAdjustment', message: 'Markedsjustering må være en faktor over 0 (f.eks. 1,05 for +5 %).' });
  if (c.originalAskingPrice != null && (!Number.isFinite(c.originalAskingPrice) || c.originalAskingPrice < 0)) out.push({ field: 'originalAskingPrice', message: 'Opprinnelig prisantydning kan ikke være negativ.' });
  if (c.sharedDebt != null && (!Number.isFinite(c.sharedDebt) || c.sharedDebt < 0)) out.push({ field: 'sharedDebt', message: 'Fellesgjeld kan ikke være negativ.' });
  if (c.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) out.push({ field: 'date', message: 'Dato må være på formatet ÅÅÅÅ-MM-DD.' });
  const hasSold = c.soldPrice !== null || c.soldTotalPrice !== null;
  if (c.kind === 'solgt' && !hasSold) out.push({ field: 'kind', message: 'Faktisk salg krever solgt pris eller solgt totalpris. Uten dokumentert salgssum: velg «Solgt – salgssum ikke dokumentert».' });
  if (c.kind !== 'solgt' && hasSold) out.push({ field: 'kind', message: 'Solgt pris og solgt totalpris kan bare fylles ut for faktisk salg.' });
  if (c.soldPrice !== null && c.soldTotalPrice !== null && c.soldTotalPrice < c.soldPrice) out.push({ field: 'soldTotalPrice', message: 'Solgt totalpris kan ikke være lavere enn solgt pris (fellesgjeld er ikke negativ).' });
  return out;
}

/** Eldre lagrede sammenligninger (én pris + prisgrunnlag) → ny struktur. Allerede nye rader beholdes. */
export function migrateLegacyComparable(raw: Record<string, unknown>): Record<string, unknown> {
  if ('soldPrice' in raw || 'soldTotalPrice' in raw) return raw;
  const { price, priceBasis, debt, ...rest } = raw as { price?: number | null; priceBasis?: PriceBasis; debt?: number | null } & Record<string, unknown>;
  const p = pricesFromLegacy({ kind: (raw.kind as ComparableKind) ?? 'prisantydning', price: price ?? null, priceBasis: priceBasis ?? 'kontant', debt: debt ?? null });
  return { ...rest, ...p, commonCosts: null };
}
