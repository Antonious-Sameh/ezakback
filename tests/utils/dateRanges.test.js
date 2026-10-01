import { describe, it, expect } from 'vitest';
import { todayRange, monthToDateRange } from '../../src/utils/dateRanges.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('todayRange', () => {
  it('returns the same YYYY-MM-DD value for from and to', () => {
    const { from, to } = todayRange();
    expect(from).toMatch(DATE_RE);
    expect(from).toBe(to);
  });
});

describe('monthToDateRange', () => {
  it('returns the 1st of the current month through today', () => {
    const { from, to } = monthToDateRange();
    expect(from).toMatch(DATE_RE);
    expect(to).toMatch(DATE_RE);
    expect(from.endsWith('-01')).toBe(true);
    expect(from <= to).toBe(true);
  });
});

import { cairoToday, previousRange, daysInRange, pctChange } from '../../src/utils/dateRanges.js';

describe('Cairo calendar days (the shops use Cairo day boundaries)', () => {
  it('00:30 in Cairo is already the new day, even though it is still yesterday in UTC', () => {
    // 2026-10-01 00:30 Cairo (UTC+3 in summer time) = 2026-09-30 21:30 UTC
    const now = new Date('2026-09-30T21:30:00Z');
    expect(cairoToday(now)).toBe('2026-10-01');
    expect(todayRange(now)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
    expect(monthToDateRange(now)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });

  it('month to date in the middle of a month', () => {
    expect(monthToDateRange(new Date('2026-09-15T10:00:00Z'))).toEqual({ from: '2026-09-01', to: '2026-09-15' });
  });
});

describe('previousRange', () => {
  it('is the period of the same length right before', () => {
    expect(previousRange({ from: '2026-09-15', to: '2026-09-15' })).toEqual({ from: '2026-09-14', to: '2026-09-14' });
    expect(previousRange({ from: '2026-09-24', to: '2026-09-30' })).toEqual({ from: '2026-09-17', to: '2026-09-23' });
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });

  it('crosses year ends', () => {
    expect(previousRange({ from: '2026-01-01', to: '2026-01-10' })).toEqual({ from: '2025-12-22', to: '2025-12-31' });
  });

  it('daysInRange is inclusive', () => {
    expect(daysInRange({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
  });
});

describe('pctChange', () => {
  it('computes % change with one decimal, sign included', () => {
    expect(pctChange(1200, 1000)).toBe(20);
    expect(pctChange(800, 1000)).toBe(-20);
    expect(pctChange(1000, 3000)).toBe(-66.7);
  });

  it('uses the absolute base, so going from a loss to a profit reads as an increase', () => {
    expect(pctChange(100, -100)).toBe(200);
  });

  it('null when there is nothing to compare with (previous = 0), 0 when both are 0', () => {
    expect(pctChange(500, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });
});
