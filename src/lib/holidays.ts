import { addDaysToKey, pad2, weekdayOfKey } from './time';

/** Første påskedag (gregoriansk, anonym algoritme). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Norske offentlige høytidsdager (lov om helligdager + 1. og 17. mai). */
export function norwegianHolidays(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const list: [string, string][] = [
    [`${year}-01-01`, '1. nyttårsdag'],
    [addDaysToKey(easter, -3), 'Skjærtorsdag'],
    [addDaysToKey(easter, -2), 'Langfredag'],
    [easter, '1. påskedag'],
    [addDaysToKey(easter, 1), '2. påskedag'],
    [`${year}-05-01`, 'Offentlig høytidsdag (1. mai)'],
    [`${year}-05-17`, 'Grunnlovsdag (17. mai)'],
    [addDaysToKey(easter, 39), 'Kristi himmelfartsdag'],
    [addDaysToKey(easter, 49), '1. pinsedag'],
    [addDaysToKey(easter, 50), '2. pinsedag'],
    [`${year}-12-25`, '1. juledag'],
    [`${year}-12-26`, '2. juledag'],
  ];
  const map = new Map<string, string>();
  for (const [key, name] of list) map.set(key, map.has(key) ? `${map.get(key)} og ${name}` : name);
  return map;
}

export function holidayName(key: string): string | null {
  const year = Number(key.slice(0, 4));
  return norwegianHolidays(year).get(key) ?? null;
}

/** Hvorfor en dato ikke er virkedag, eller null om den er virkedag. */
export function nonBusinessReason(key: string): string | null {
  const h = holidayName(key);
  if (h) return h;
  const wd = weekdayOfKey(key);
  if (wd === 6) return 'lørdag';
  if (wd === 0) return 'søndag';
  return null;
}

export function isBusinessDay(key: string): boolean {
  return nonBusinessReason(key) === null;
}

/** Første virkedag strengt etter gitt dato. */
export function nextBusinessDayAfter(key: string): string {
  let k = addDaysToKey(key, 1);
  for (let i = 0; i < 14 && !isBusinessDay(k); i++) k = addDaysToKey(k, 1);
  return k;
}
