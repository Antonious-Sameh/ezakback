import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchFromShop = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/shopClient.service.js', () => ({ fetchFromShop }));
vi.mock('../../src/config/shops.js', () => ({
  SHOPS: [
    { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' },
    { id: 'shop2', name: 'المحل الثاني', apiUrl: 'https://s2.example.com/api', adminKey: 'k2' },
  ],
}));

import * as fx from '../fixtures/shopResponses.js';
const { getPositionReport, buildTotals } = await import('../../src/services/positionReport.service.js');

beforeEach(() => vi.clearAllMocks());

/** figures per shop; a missing shop (or `fail` list) = those calls reject. */
function fakeShops(figures) {
  fetchFromShop.mockImplementation((shop, path) => {
    const f = figures[shop.id];
    if (!f || f.fail?.includes(path)) return Promise.reject(new Error('down'));
    const data = {
      '/reports/customers': fx.customersReport({ totalOutstanding: f.customersOwe, withBalanceCount: f.customersOweCount ?? 1 }),
      '/reports/suppliers': fx.suppliersReport({ totalOutstanding: f.suppliersOwed }),
      '/reports/inventory': fx.inventoryReport({ costValue: f.stockCost, saleValue: f.stockSale ?? f.stockCost * 1.3, lowCount: 3, outCount: 1 }),
      '/cashbox/summary': fx.cashboxSummary({ balance: f.cash }),
    }[path];
    return Promise.resolve({ success: true, data });
  });
}

describe('getPositionReport — "معانا كام"', () => {
  it('collects debts, stock and cash per shop from the shops\' REAL report shapes', async () => {
    fakeShops({
      shop1: { customersOwe: 12000, customersOweCount: 15, suppliersOwed: 7000, stockCost: 45000, stockSale: 60000, cash: 3500 },
      shop2: { customersOwe: 3000, suppliersOwed: 1000, stockCost: 20000, stockSale: 26000, cash: 500 },
    });

    const r = await getPositionReport();

    expect(r.byShop[0]).toEqual({
      shopId: 'shop1', shopName: 'المحل الأول', available: true,
      customersOwe: 12000, customersOweCount: 15, suppliersOwed: 7000, cash: 3500,
      stockCost: 45000, stockSale: 60000, productsCount: 120, lowCount: 4,
    });
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('totals, and an estimate of what we have: cash + stock at cost + owed to us − owed by us', async () => {
    fakeShops({
      shop1: { customersOwe: 12000, suppliersOwed: 7000, stockCost: 45000, cash: 3500 },
      shop2: { customersOwe: 3000, suppliersOwed: 1000, stockCost: 20000, cash: 500 },
    });

    const { totals } = await getPositionReport();

    expect(totals).toMatchObject({ customersOwe: 15000, suppliersOwed: 8000, cash: 4000, stockCost: 65000, complete: true });
    expect(totals.net).toBe(4000 + 65000 + 15000 - 8000);
  });

  it('a figure that could not be read is null (unknown), not 0, and the totals say they are partial', async () => {
    fakeShops({
      shop1: { customersOwe: 100, suppliersOwed: 0, stockCost: 500, cash: 50, fail: ['/reports/inventory'] },
      shop2: { customersOwe: 200, suppliersOwed: 0, stockCost: 700, cash: 70 },
    });

    const r = await getPositionReport();

    expect(r.byShop[0]).toMatchObject({ customersOwe: 100, stockCost: null, stockSale: null, available: true });
    expect(r.totals).toMatchObject({ customersOwe: 300, stockCost: 700, complete: false });
  });

  it('a shop that does not answer at all is unavailable; the others are unaffected', async () => {
    fakeShops({ shop1: { customersOwe: 100, suppliersOwed: 0, stockCost: 500, cash: 50 } });

    const r = await getPositionReport();

    expect(r.byShop[1]).toMatchObject({ shopId: 'shop2', available: false, customersOwe: null, cash: null, stockCost: null });
    expect(r.totals).toMatchObject({ customersOwe: 100, cash: 50, complete: false });
  });

  it('buildTotals on nothing is all zeros', () => {
    expect(buildTotals([]).net).toBe(0);
  });
});
