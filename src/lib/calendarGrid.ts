import { addDaysToKey, pad2, parseDateKey, weekdayOfKey } from './time';

export interface MonthCursor {
  year: number;
  month: number; // 1–12
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function shiftMonth(c: MonthCursor, delta: number): MonthCursor {
  const idx = c.year * 12 + (c.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function cursorOfKey(key: string): MonthCursor {
  const { year, month } = parseDateKey(key);
  return { year, month };
}

/**
 * Ukene som dekker en måned, mandag først (norsk standard).
 * Hver uke er sju lokale datoer 'YYYY-MM-DD'; første og siste uke kan inneholde dager fra nabomånedene.
 */
export function monthWeeks(year: number, month: number): string[][] {
  const first = `${year}-${pad2(month)}-01`;
  const last = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const start = addDaysToKey(first, -((weekdayOfKey(first) + 6) % 7));
  const end = addDaysToKey(last, (7 - weekdayOfKey(last)) % 7);
  const weeks: string[][] = [];
  for (let k = start; k <= end; k = addDaysToKey(k, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysToKey(k, i)));
  }
  return weeks;
}

/** ISO 8601-ukenummer (uke 1 er uken med årets første torsdag). */
export function isoWeekOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
