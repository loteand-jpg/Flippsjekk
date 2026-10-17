import { describe, expect, it } from 'vitest';
import { findOverlaps } from './calendarOverlap';

const ev = (uid: string, propertyId: string, start: string, end: string | null, kind = 'visning', status = 'planlagt') => ({ uid, kind, propertyId, start, end, status });

describe('overlappende visninger', () => {
  it('finner overlapp mellom ulike objekter, ignorerer buddag og avlyste', () => {
    const m = findOverlaps([
      ev('a', 'p1', '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z'),
      ev('b', 'p2', '2026-11-03T16:30:00Z', '2026-11-03T17:30:00Z'),
      ev('c', 'p3', '2026-11-03T16:30:00Z', null, 'buddag'),
      ev('d', 'p4', '2026-11-03T16:15:00Z', '2026-11-03T16:45:00Z', 'visning', 'avlyst'),
      ev('e', 'p5', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z'),
    ]);
    expect(m.get('a')!.map((x) => x.uid)).toEqual(['b']);
    expect(m.has('c')).toBe(false);
    expect(m.has('d')).toBe(false);
    expect(m.get('e')!.map((x) => x.uid)).toEqual(['b']);
  });
});
