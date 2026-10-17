import { describe, expect, it } from 'vitest';
import { buildIcs, foldIcsLine } from './ics';

describe('ics-eksport', () => {
  const ics = buildIcs(
    [
      { uid: 'bidday-p1@flipprom.no', start: '2026-10-25T11:00:00.000Z', end: null, summary: 'Forventet buddag (prognose): Testveien 1, Trondheim' },
      { uid: 'viewing-v1@flipprom.no', start: '2026-07-01T15:00:00.000Z', end: '2026-07-01T16:00:00.000Z', summary: 'Visning; test' },
    ],
    new Date('2026-10-16T10:00:00Z'),
  );
  it('bruker lokal Oslo-tid med TZID og riktig sommertid', () => {
    expect(ics).toContain('DTSTART;TZID=Europe/Oslo:20261025T120000');
    expect(ics).toContain('DTSTART;TZID=Europe/Oslo:20260701T170000');
    expect(ics).toContain('BEGIN:VTIMEZONE');
  });
  it('har stabile UID-er, CRLF og escaping', () => {
    expect(ics).toContain('UID:bidday-p1@flipprom.no');
    expect(ics).toContain('SUMMARY:Visning\; test');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });
  it('bretter lange linjer på 75 oktetter', () => {
    const folded = foldIcsLine('DESCRIPTION:' + 'æ'.repeat(80));
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
