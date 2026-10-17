import { describe, expect, it } from 'vitest';
import { daysInMonth, isoWeekOfKey, monthWeeks, shiftMonth } from './calendarGrid';

describe('månedskalender', () => {
  it('oktober 2026: starter mandag 28. sep, slutter søndag 1. nov, fem uker', () => {
    const w = monthWeeks(2026, 10);
    expect(w).toHaveLength(5);
    expect(w[0][0]).toBe('2026-09-28');
    expect(w[0][3]).toBe('2026-10-01');
    expect(w[4][6]).toBe('2026-11-01');
    expect(w.every((week) => week.length === 7)).toBe(true);
  });

  it('februar 2027 starter mandag og slutter søndag: nøyaktig fire uker', () => {
    const w = monthWeeks(2027, 2);
    expect(w).toHaveLength(4);
    expect(w[0][0]).toBe('2027-02-01');
    expect(w[3][6]).toBe('2027-02-28');
  });

  it('måned med seks uker (august 2027 starter søndag)', () => {
    const w = monthWeeks(2027, 8);
    expect(w).toHaveLength(6);
    expect(w[0][6]).toBe('2027-08-01');
  });

  it('ISO-ukenummer over årsskifte', () => {
    expect(isoWeekOfKey('2026-01-01')).toBe(1);
    expect(isoWeekOfKey('2026-10-19')).toBe(43);
    expect(isoWeekOfKey('2026-12-31')).toBe(53);
    expect(isoWeekOfKey('2027-01-01')).toBe(53);
    expect(isoWeekOfKey('2027-01-04')).toBe(1);
  });

  it('månedsnavigering og antall dager', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});
