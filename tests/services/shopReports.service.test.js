import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { getShopReport, isAllowedReportType, REPORT_TYPES } = await import('../../src/services/shopReports.service.js');

import * as fx from '../fixtures/shopResponses.js';

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAllowedReportType', () => {
  it('allows exactly the documented report types (six + daily)', () => {
    expect([...REPORT_TYPES].sort()).toEqual(['customers', 'daily', 'inventory', 'profit', 'purchases', 'sales', 'suppliers']);
    for (const type of REPORT_TYPES) expect(isAllowedReportType(type)).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isAllowedReportType('nonsense')).toBe(false);
  });
});

describe('getShopReport transforms (against the shops\' REAL response shapes)', () => {
  it('sales: net sales AFTER returns, plus gross, returns, collected, credit, avg invoice', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.salesReport() });

    const r = await getShopReport(shop, 'sales', {});

    expect(r).toMatchObject({
      totalSales: 5000,
      grossSales: 5200,
      returns: 200,
      count: 40,
      avgInvoice: 130,
      collected: 4100,
      creditOutstanding: 900,
      byPaymentType: { cash: 3200, credit: 2000 },
      byDay: [],
    });
  });

  it('sales: top products use units sold NET of returns, and their value', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.salesReport() });
    const r = await getShopReport(shop, 'sales', {});
    expect(r.topProducts).toEqual([
      { name: 'فلتر زيت', qty: 23, total: 2500 },
      { name: 'شمعة', qty: 18, total: 720 },
    ]);
  });

  it('sales: never returns undefined / NaN for a period with no sales', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: fx.salesReport({ grossSales: 0, netSales: 0, invoiceCount: 0, salesReturns: 0, paid: 0, bestSellers: [] }),
    });
    const r = await getShopReport(shop, 'sales', {});
    expect(r).toMatchObject({ totalSales: 0, count: 0, avgInvoice: 0 });
    expect(JSON.stringify(r)).not.toMatch(/null|NaN/);
  });

  it('sales: still reads an older shop build that sends { revenue, qty }', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.legacySalesReport });
    const r = await getShopReport(shop, 'sales', {});
    expect(r.totalSales).toBe(1000);
    expect(r.topProducts[0].qty).toBe(3);
  });

  it('profit: net profit, margin on net revenue, and the full P&L steps', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.profitReport() });

    const r = await getShopReport(shop, 'profit', {});

    expect(r).toEqual({
      totalProfit: 1500,
      margin: 30,
      grossSales: 5200,
      discount: 150,
      returns: 200,
      revenue: 5000,
      cogs: 3000,
      grossProfit: 2000,
      expenses: 500,
      byDay: [],
    });
  });

  it('profit: margin is 0 when there was no revenue (no division by zero)', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.profitReport({ netRevenue: 0, net: -100 }) });
    const r = await getShopReport(shop, 'profit', {});
    expect(r.margin).toBe(0);
    expect(r.totalProfit).toBe(-100);
  });

  it('purchases', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.purchasesReport() });
    expect(await getShopReport(shop, 'purchases', {})).toEqual({
      totalPurchases: 8000, count: 12, paid: 6000, creditOutstanding: 2000,
    });
  });

  it('inventory: stock value at cost and at sale price, expected profit, low / out counts', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.inventoryReport() });
    expect(await getShopReport(shop, 'inventory', {})).toEqual({
      totalStockValue: 45000, saleValue: 60000, expectedProfit: 15000,
      totalProducts: 120, totalQuantity: 2400, lowCount: 6, outCount: 2,
    });
  });

  it('customers: top customers with what they still owe, plus totals', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.customersReport() });
    expect(await getShopReport(shop, 'customers', {})).toEqual({
      count: 80, totalOutstanding: 12000, withBalanceCount: 15,
      topCustomers: [{ id: 'c1', name: 'أحمد', totalSpent: 9000, remaining: 2000 }],
    });
  });

  it('suppliers: top suppliers with what we still owe them, plus totals', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: fx.suppliersReport() });
    expect(await getShopReport(shop, 'suppliers', {})).toEqual({
      count: 10, totalOutstanding: 7000, withBalanceCount: 3,
      topSuppliers: [{ id: 's1', name: 'شركة الصفا', totalAmount: 30000, remaining: 5000 }],
    });
  });
});

describe('daily report (shop patch 2)', () => {
  const dailyFromShop = {
    from: '2026-09-01',
    to: '2026-09-02',
    days: [
      { date: '2026-09-01', sales: 1000, returns: 100, netSales: 900, invoices: 4, cogs: 540, grossProfit: 360, expenses: 50, net: 310, purchases: 2000 },
      { date: '2026-09-02', sales: 0, returns: 0, netSales: 0, invoices: 0, cogs: 0, grossProfit: 0, expenses: 0, net: 0, purchases: 0 },
    ],
  };

  it('passes the day series through, numbers guaranteed', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: dailyFromShop });

    const r = await getShopReport(shop, 'daily', { from: '2026-09-01', to: '2026-09-02' });

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/reports/daily', { params: { from: '2026-09-01', to: '2026-09-02' } });
    expect(r.available).toBe(true);
    expect(r.days).toEqual(dailyFromShop.days);
  });

  it('a shop without patch 2 (404) → available:false, not an error', async () => {
    const err = Object.assign(new Error('not found'), { name: 'ShopClientError', status: 404 });
    fetchFromShop.mockRejectedValue(err);

    expect(await getShopReport(shop, 'daily', {})).toEqual({ available: false, days: [] });
  });

  it('any other failure is still an error', async () => {
    const err = Object.assign(new Error('down'), { name: 'ShopClientError', status: 502 });
    fetchFromShop.mockRejectedValue(err);
    await expect(getShopReport(shop, 'daily', {})).rejects.toThrow('down');
  });

  it('a 404 on a NON-optional report is still an error', async () => {
    const err = Object.assign(new Error('nf'), { name: 'ShopClientError', status: 404 });
    fetchFromShop.mockRejectedValue(err);
    await expect(getShopReport(shop, 'sales', {})).rejects.toThrow('nf');
  });
});

