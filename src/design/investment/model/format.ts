import { formatNOK, formatNOKSigned } from '../../../lib/format';

const millFmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 });

/** «3,4 mill.» – for akser og kompakte etiketter. Selve tallet vises alltid også i full form et annet sted. */
export function compactMill(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1_000_000) return `${millFmt.format(n / 1_000_000)} mill.`;
  return `${millFmt.format(Math.round(n / 1000))} k`;
}

/** Endring med fortegn. 0 vises uten fortegn, ukjent som tekst (aldri 0). */
export function signedNOK(n: number | null | undefined, fallback = 'Ikke beregnet'): string {
  return formatNOKSigned(n, fallback);
}

export function signedNumber(n: number | null | undefined, unit: string, fallback = 'Ikke avklart'): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const r = Math.round(n * 10) / 10;
  if (r === 0) return `0 ${unit}`;
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} ${unit}`;
}

export function signedPct(decimal: number | null | undefined, fallback = 'Ikke beregnet'): string {
  if (typeof decimal !== 'number' || !Number.isFinite(decimal)) return fallback;
  const p = Math.round(decimal * 1000) / 10;
  if (p === 0) return '0,0 prosentpoeng';
  return `${p > 0 ? '+' : '−'}${Math.abs(p).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} prosentpoeng`;
}

export { formatNOK };
