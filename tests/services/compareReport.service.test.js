import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/shops.js', () => ({
  SHOPS: [
    { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' },
    { id: 'shop2', name: 'المحل الثاني', apiUrl: 'https://s2.example.com/api', adminKey: 'k2' },
  ],
}));

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { getCompareReport } = await import('../../src/services/compareReport.service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

import * as fx from '../fixtures/shopResponses.js';

const range = { from: '2026-09-01', to: '2026-09-08' };


/**
 * Fake shops: `figures[shopId]` = { sales, profit, invoices, prevSales, prevProfit, outstanding, daily }.
 * Routes by path AND by whether the requested range is the current or the previous one.
 */
function fakeShops(figures) {
  fetchFromShop.mockImplementation((shop, path, opts = {}) => {
    const f = figures[shop.id];
    if (!f) return Promise.reject(new Error('down'));
    const isPrev = opts.params?.from && opts.params.from !== range.from;
    if (path === '/reports/sales') {
      return Promise.resolve({ success: true, data: fx.salesReport({ netSales: isPrev ? f.prevSales : f.sales, invoiceCount: f.invoices ?? 0 }) });
    }
    if (path === '/reports/profit') {
      const net = isPrev ? f.prevProfit : f.profit;
      return Promise.resolve({ success: true, data: fx.profitReport({ net, netRevenue: isPrev ? f.prevSales : f.sales }) });
    }
    if (path === '/reports/customers') return Promise.resolve({ success: true, data: fx.customersReport({ totalOutstanding: f.outstanding ?? 0 }) });
    if (path === '/reports/daily') {
      if (!f.daily) return Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
      return Promise.resolve({ success: true, data: { days: f.daily } });
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe('getCompareReport (real shop shapes)', () => {
  it('uses sales AFTER returns per shop, sums them, adds invoices, margin, share and rank', async () => {
    fakeShops({
      shop1: { sales: 1000, profit: 300, invoices: 10, prevSales: 800, prevProfit: 200 },
      shop2: { sales: 3000, profit: 600, invoices: 20, prevSales: 3000, prevProfit: 800 },
    });

    const r = await getCompareReport(range);

    expect(r).toMatchObject({ totalSales: 4000, totalProfit: 900, totalInvoices: 30, margin: 22.5, shopsAvailable: 2 });
    const [s1, s2] = r.byShop;
    expect(s1).toMatchObject({ shopId: 'shop1', sales: 1000, profit: 300, invoices: 10, margin: 30, share: 25, rank: 2, available: true });
    expect(s2).toMatchObject({ shopId: 'shop2', sales: 3000, share: 75, rank: 1 });
  });

  it('compares with the previous period of the same length (per shop and in total)', async () => {
    fakeShops({
      shop1: { sales: 1000, profit: 300, prevSales: 800, prevProfit: 200 },
      shop2: { sales: 3000, profit: 600, prevSales: 3000, prevProfit: 800 },
    });

    const r = await getCompareReport(range);

    expect(r.previousRange).toEqual({ from: '2026-08-24', to: '2026-08-31' });
    expect(fetchFromShop).toHaveBeenCalledWith(expect.objectContaining({ id: 'shop1' }), '/reports/sales', { params: { from: '2026-08-24', to: '2026-08-31' } });
    expect(r.byShop[0].previous).toEqual({ sales: 800, profit: 200 });
    expect(r.byShop[0].change).toEqual({ sales: 25, profit: 50 });
    expect(r.byShop[1].change).toEqual({ sales: 0, profit: -25 });
    expect(r.previous).toEqual({ sales: 3800, profit: 1000 });
    expect(r.change).toEqual({ sales: 5.3, profit: -10 });
  });

  it('REGRESSION: with the shops\' current report shape, sales are no longer 0', async () => {
    fetchFromShop.mockImplementation((shop, path) => {
      if (path === '/reports/sales') return Promise.resolve({ success: true, data: fx.salesReport() });
      if (path === '/reports/profit') return Promise.resolve({ success: true, data: fx.profitReport() });
      if (path === '/reports/customers') return Promise.resolve({ success: true, data: fx.customersReport() });
      return Promise.reject(new Error('nf'));
    });

    const r = await getCompareReport(range);

    expect(r.totalSales).toBe(10000);
    expect(r.byShop.every((s) => s.sales === 5000)).toBe(true);
  });

  it('adds up what customers owe across the shops', async () => {
    fakeShops({
      shop1: { sales: 1, profit: 0, prevSales: 1, prevProfit: 0, outstanding: 1200 },
      shop2: { sales: 1, profit: 0, prevSales: 1, prevProfit: 0, outstanding: 800.5 },
    });
    const r = await getCompareReport(range);
    expect(r.totalOutstanding).toBe(2000.5);
    expect(r.byShop.map((s) => s.outstanding)).toEqual([1200, 800.5]);
  });

  it('combines the shops\' day series (sales after returns, net profit) and flags a partial series', async () => {
    fakeShops({
      shop1: {
        sales: 1, profit: 0, prevSales: 0, prevProfit: 0,
        daily: [
          { date: '2026-09-01', netSales: 100, net: 30 },
          { date: '2026-09-02', netSales: 50, net: -10 },
        ],
      },
      shop2: { sales: 1, profit: 0, prevSales: 0, prevProfit: 0 }, // no patch 2
    });

    const r = await getCompareReport(range);

    expect(r.daily).toEqual({
      available: true,
      partial: true,
      shopsIncluded: 1,
      days: [
        { date: '2026-09-01', sales: 100, profit: 30 },
        { date: '2026-09-02', sales: 50, profit: -10 },
      ],
    });
    expect(r.byShop[0]).not.toHaveProperty('_daily');
  });

  it('a shop that does not answer contributes 0, is flagged, has no rank, and never breaks the total', async () => {
    fakeShops({ shop1: { sales: 500, profit: 100, prevSales: 250, prevProfit: 100 } });

    const r = await getCompareReport(range);

    expect(r.totalSales).toBe(500);
    expect(r.shopsAvailable).toBe(1);
    expect(r.byShop.find((s) => s.shopId === 'shop2')).toMatchObject({
      sales: 0, profit: 0, available: false, previous: null, change: { sales: null, profit: null }, rank: null, share: 0,
    });
  });

  it('growth from nothing is "null" (no base), not Infinity', async () => {
    fakeShops({
      shop1: { sales: 500, profit: 100, prevSales: 0, prevProfit: 0 },
      shop2: { sales: 0, profit: 0, prevSales: 0, prevProfit: 0 },
    });
    const r = await getCompareReport(range);
    expect(r.byShop[0].change.sales).toBeNull();
    expect(r.byShop[1].change.sales).toBe(0);
    expect(r.change.sales).toBeNull();
  });
});
