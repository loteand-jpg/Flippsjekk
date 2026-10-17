import { getZonedParts, OSLO_TZ, pad2 } from './time';

export interface IcsEvent {
  uid: string;
  start: string;
  end: string | null;
  summary: string;
  description?: string;
  location?: string;
  url?: string | null;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  categories?: string[];
}

const VTIMEZONE_OSLO = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Oslo',
  'X-LIC-LOCATION:Europe/Oslo',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
}

/** Bretter linjer til maks 75 oktetter (UTF-8), som RFC 5545 krever. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentLen = 0;
  let limit = 75;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (currentLen + len > limit) {
      out.push(current);
      current = ch;
      currentLen = len;
      limit = 74; // fortsettelseslinjer starter med ett mellomrom
    } else {
      current += ch;
      currentLen += len;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Lokal tid i Oslo på formen 20261017T120000. */
export function icsLocal(iso: string): string {
  const p = getZonedParts(new Date(iso), OSLO_TZ);
  return `${p.year}${pad2(p.month)}${pad2(p.day)}T${pad2(p.hour)}${pad2(p.minute)}${pad2(p.second)}`;
}

export function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(events: readonly IcsEvent[], now: Date, calName = 'Flippsjekk'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flippsjekk//Kalender 1.0//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
    ...VTIMEZONE_OSLO,
  ];
  for (const ev of events) {
    const end = ev.end ?? new Date(Date.parse(ev.start) + 30 * 60_000).toISOString();
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${icsUtc(now)}`);
    lines.push(`DTSTART;TZID=Europe/Oslo:${icsLocal(ev.start)}`);
    lines.push(`DTEND;TZID=Europe/Oslo:${icsLocal(end)}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    if (ev.url) lines.push(`URL:${ev.url}`);
    if (ev.status) lines.push(`STATUS:${ev.status}`);
    if (ev.categories?.length) lines.push(`CATEGORIES:${ev.categories.map(escapeIcsText).join(',')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
