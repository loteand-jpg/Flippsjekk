import { OSLO_TZ } from './time';

/** Visningstekster for manglende verdier. Ukjent er ukjent – aldri 0. */
export const UNKNOWN = 'Ikke avklart';
export const NO_BASIS = 'Mangler grunnlag';

const nokFmt = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const num1Fmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });
const num2Fmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1 });

function isNum(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function formatNOK(n: number | null | undefined, fallback = UNKNOWN): string {
  return isNum(n) ? nokFmt.format(Math.round(n)) : fallback;
}

/** Med fortegn, for differanser. */
export function formatNOKSigned(n: number | null | undefined, fallback = UNKNOWN): string {
  if (!isNum(n)) return fallback;
  const r = Math.round(n);
  if (r === 0) return nokFmt.format(0);
  return (r > 0 ? '+' : '') + nokFmt.format(r);
}

/** Kompakt: 2,45 mill. kr / 450 000 kr. */
export function formatNOKCompact(n: number | null | undefined, fallback = UNKNOWN): string {
  if (!isNum(n)) return fallback;
  if (Math.abs(n) >= 1_000_000) return `${num2Fmt.format(n / 1_000_000)} mill. kr`;
  return nokFmt.format(Math.round(n));
}

export function formatNumber(n: number | null | undefined, fallback = UNKNOWN, decimals = 0): string {
  if (!isNum(n)) return fallback;
  return decimals === 0 ? numFmt.format(n) : decimals === 1 ? num1Fmt.format(n) : num2Fmt.format(n);
}

/** Desimal (0,184) → «18,4 %». */
export function formatPct(decimal: number | null | undefined, fallback = UNKNOWN): string {
  return isNum(decimal) ? pctFmt.format(decimal) : fallback;
}

/** Prosentpoeng (7) → «7 %». */
export function formatPctPoints(points: number | null | undefined, fallback = UNKNOWN): string {
  return isNum(points) ? `${num2Fmt.format(points)} %` : fallback;
}

export function formatArea(m2: number | null | undefined, fallback = UNKNOWN): string {
  return isNum(m2) ? `${numFmt.format(m2)} m²` : fallback;
}

export function formatMonths(m: number | null | undefined, fallback = UNKNOWN): string {
  if (!isNum(m)) return fallback;
  return `${num1Fmt.format(m)} ${m === 1 ? 'måned' : 'måneder'}`;
}

export function formatHours(h: number | null | undefined, fallback = UNKNOWN): string {
  return isNum(h) ? `${numFmt.format(h)} t` : fallback;
}

const dateFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: OSLO_TZ, day: 'numeric', month: 'short', year: 'numeric' });
const dateLongFmt = new Intl.DateTimeFormat('nb-NO', {
  timeZone: OSLO_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const dateShortWdFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: OSLO_TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: OSLO_TZ, hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', month: 'long', year: 'numeric' });

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

export function formatDate(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? dateFmt.format(toDate(v)) : fallback;
}
export function formatDateLong(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? dateLongFmt.format(toDate(v)) : fallback;
}
export function formatDateShortWeekday(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? dateShortWdFmt.format(toDate(v)) : fallback;
}
export function formatTime(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? timeFmt.format(toDate(v)) : fallback;
}
const compactFmt = new Intl.DateTimeFormat('nb-NO', { timeZone: OSLO_TZ, day: 'numeric', month: 'short' });
/** Kompakt for tabeller: «19. okt. 17:30». */
export function formatDateTimeCompact(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? `${compactFmt.format(toDate(v))} ${timeFmt.format(toDate(v))}` : fallback;
}
export function formatDateTime(v: Date | string | null | undefined, fallback = UNKNOWN): string {
  return v ? `${dateShortWdFmt.format(toDate(v))} kl. ${timeFmt.format(toDate(v))}` : fallback;
}
/** For 'YYYY-MM-DD' (lokal dato) uten tidssoneforskyvning. */
export function formatDateKey(key: string | null | undefined, fallback = UNKNOWN): string {
  if (!key) return fallback;
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}
export function formatDateKeyLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('nb-NO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}
export function formatMonthYear(year: number, month: number): string {
  const s = monthFmt.format(new Date(Date.UTC(year, month - 1, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const rtf = new Intl.RelativeTimeFormat('nb', { numeric: 'auto' });
export function formatRelative(v: Date | string | null | undefined, now: Date, fallback = UNKNOWN): string {
  if (!v) return fallback;
  const diffMs = toDate(v).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diffMs / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < 45 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return rtf.format(Math.round(diffMs / (30 * day)), 'month');
}

export function ageInDays(v: Date | string, now: Date): number {
  return (now.getTime() - toDate(v).getTime()) / 86_400_000;
}

/** Første bokstav stor, resten uendret («torsdag 22. oktober» → «Torsdag 22. oktober»). */
export function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Modellert maksbud vises avrundet ned til hele tusen (motoren regner med 1 kr toleranse). */
export function roundBidDown(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v / 1000) * 1000 : null;
}

/** Tolker norsk tallinput: «2 450 000», «2,5», «7,25 %». Tom streng → null. */
export function parseNorwegianNumber(input: string): number | null | 'invalid' {
  const cleaned = input
    .replace(/[\s  ]/g, '')
    .replace(/kr|%|m²|nok/gi, '')
    .replace(/−/g, '-')
    .replace(',', '.');
  if (cleaned === '') return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '-' || cleaned === '.') return 'invalid';
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 'invalid';
}
