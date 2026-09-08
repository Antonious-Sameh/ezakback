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
