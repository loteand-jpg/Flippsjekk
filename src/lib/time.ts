/**
 * Tidssonehjelpere for Europe/Oslo uten eksterne avhengigheter.
 * Tidspunkt lagres i UTC; lokale datoer representeres som 'YYYY-MM-DD'.
 */
export const OSLO_TZ = 'Europe/Oslo';

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

export function getZonedParts(date: Date, tz: string = OSLO_TZ): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Forskjellen mellom lokal tid i `tz` og UTC, i millisekunder, for et gitt øyeblikk. */
export function tzOffsetMs(date: Date, tz: string = OSLO_TZ): number {
  const p = getZonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Lokal veggklokketid i `tz` → UTC-øyeblikk. Håndterer sommertid. */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number; minute?: number },
  tz: string = OSLO_TZ,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0, 0);
  let offset = tzOffsetMs(new Date(guess), tz);
  let result = guess - offset;
  const offset2 = tzOffsetMs(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset;
  }
  return new Date(result);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Lokal dato i Oslo som 'YYYY-MM-DD'. */
export function localDateKey(date: Date | string, tz: string = OSLO_TZ): string {
  const p = getZonedParts(new Date(date), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const t = new Date(Date.UTC(year, month - 1, day + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 0 = søndag … 6 = lørdag, for en lokal dato. */
export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** UTC-øyeblikk for en lokal dato og klokkeslett i Oslo. */
export function osloAt(key: string, hour: number, minute = 0): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedTimeToUtc({ year, month, day, hour, minute });
}

export function daysBetweenKeys(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000);
}

/** ISO (UTC) → verdi for <input type="datetime-local"> tolket som Oslo-tid. */
export function isoToOsloInput(iso: string): string {
  const p = getZonedParts(new Date(iso));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Verdi fra <input type="datetime-local"> (Oslo-tid) → ISO (UTC). null ved ugyldig verdi. */
export function osloInputToIso(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return zonedTimeToUtc({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] }).toISOString();
}
