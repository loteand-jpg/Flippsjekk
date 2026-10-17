import { describe, expect, it } from 'vitest';
import type { Viewing } from '../domain/schemas';
import { deriveBidDay } from './bidDay';
import { localDateKey, getZonedParts } from './time';

function viewing(id: string, start: string, extra: Partial<Viewing> = {}): Viewing {
  return {
    id,
    propertyId: 'p1',
    kind: 'official',
    start,
    end: null,
    status: 'planlagt',
    sourceId: null,
    sourceLabel: 'Annonse',
    verifiedAt: '2026-10-01T08:00:00.000Z',
    replacesViewingId: null,
    note: null,
    ...extra,
  };
}

describe('forventet buddag', () => {
  it('ingen offisiell visning gir ingen buddag', () => {
    expect(deriveBidDay('p1', [])).toBeNull();
  });

  it('bruker siste ikke-avlyste offisielle visning og gir én prognose kl. 12:00 dagen etter', () => {
    const vs = [
      viewing('a', '2026-11-03T16:00:00.000Z'), // tirsdag 17:00
      viewing('b', '2026-11-05T16:00:00.000Z'), // torsdag 17:00
      viewing('c', '2026-11-08T12:00:00.000Z', { status: 'avlyst' }), // avlyst søndag
    ];
    const p = deriveBidDay('p1', vs)!;
    expect(p.basedOnViewingId).toBe('b');
    expect(p.dateKey).toBe('2026-11-06');
    expect(p.start).toBe('2026-11-06T11:00:00.000Z'); // 12:00 CET
    expect(p.id).toBe('bidday-p1');
    expect(p.nonBusinessDay).toBeNull();
  });

  it('flyttet/ny visning oppdaterer samme prognose uten duplikater', () => {
    const before = deriveBidDay('p1', [viewing('a', '2026-11-03T16:00:00.000Z')])!;
    const after = deriveBidDay('p1', [
      viewing('a', '2026-11-03T16:00:00.000Z', { status: 'avlyst' }),
      viewing('a2', '2026-11-10T16:00:00.000Z', { replacesViewingId: 'a' }),
    ])!;
    expect(after.id).toBe(before.id);
    expect(after.dateKey).toBe('2026-11-11');
  });

  it('alle visninger avlyst gir ingen prognose', () => {
    expect(deriveBidDay('p1', [viewing('a', '2026-11-03T16:00:00.000Z', { status: 'avlyst' })])).toBeNull();
  });

  it('ligger kl. 12 lokal tid ved overgang til sommertid', () => {
    // Visning lørdag 28. mars 2026 kl. 13 CET; sommertid starter søndag 29. mars kl. 02.
    const p = deriveBidDay('p1', [viewing('a', '2026-03-28T12:00:00.000Z')])!;
    expect(p.dateKey).toBe('2026-03-29');
    expect(p.start).toBe('2026-03-29T10:00:00.000Z'); // 12:00 CEST = 10:00 UTC
    expect(getZonedParts(new Date(p.start)).hour).toBe(12);
    expect(p.nonBusinessDay).toBe('søndag');
    expect(p.firstBusinessDayAfterViewing).toBe('2026-03-30');
  });

  it('ligger kl. 12 lokal tid ved overgang til normaltid', () => {
    // Visning lørdag 24. okt 2026 kl. 12 CEST; normaltid fra søndag 25. okt kl. 03.
    const p = deriveBidDay('p1', [viewing('a', '2026-10-24T10:00:00.000Z')])!;
    expect(p.start).toBe('2026-10-25T11:00:00.000Z'); // 12:00 CET = 11:00 UTC
    expect(getZonedParts(new Date(p.start)).hour).toBe(12);
  });

  it('bruker lokal dato for visninger sent på kvelden', () => {
    // 23:30 lokal tid 4. nov = 22:30 UTC
    const p = deriveBidDay('p1', [viewing('a', '2026-11-04T22:30:00.000Z')])!;
    expect(localDateKey('2026-11-04T22:30:00.000Z')).toBe('2026-11-04');
    expect(p.dateKey).toBe('2026-11-05');
  });

  it('markerer helligdag dagen etter visning', () => {
    // Visning 16. mai 2027 (søndag) → 17. mai
    const p = deriveBidDay('p1', [viewing('a', '2027-05-16T10:00:00.000Z')])!;
    expect(p.nonBusinessDay).toContain('17. mai');
    expect(p.firstBusinessDayAfterViewing).toBe('2027-05-18');
  });

  it('private visninger inngår ikke (kun offisielle)', () => {
    const priv = { ...viewing('x', '2026-12-01T10:00:00.000Z'), kind: 'private' } as unknown as Viewing;
    const p = deriveBidDay('p1', [viewing('a', '2026-11-03T16:00:00.000Z'), priv])!;
    expect(p.basedOnViewingId).toBe('a');
  });
});
