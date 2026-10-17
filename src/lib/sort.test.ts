import { describe, expect, it } from 'vitest';
import { sortByNullableLast } from './sort';

describe('sortering med ukjente verdier', () => {
  const rows = [{ v: 10 }, { v: null }, { v: 2 }, { v: 100 }, { v: null }, { v: -5 }];
  it('sorterer tall numerisk stigende med ukjente sist', () => {
    expect(sortByNullableLast(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([-5, 2, 10, 100, null, null]);
  });
  it('sorterer synkende med ukjente fortsatt sist', () => {
    expect(sortByNullableLast(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([100, 10, 2, -5, null, null]);
  });
  it('sorterer tekst med norsk alfabet', () => {
    const t = [{ v: 'Øya' }, { v: 'Byåsen' }, { v: 'Ålesund' }, { v: 'Lade' }];
    expect(sortByNullableLast(t, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['Byåsen', 'Lade', 'Øya', 'Ålesund']);
  });
});
