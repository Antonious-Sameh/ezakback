import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { getShopReport, isAllowedReportType, REPORT_TYPES } = await import('../../src/services/shopReports.service.js');

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAllowedReportType', () => {
  it('allows exactly the six documented report types', () => {
    expect(REPORT_TYPES).toEqual(['sales', 'purchases', 'profit', 'inventory', 'customers', 'suppliers']);
    for (const type of REPORT_TYPES) expect(isAllowedReportType(type)).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isAllowedReportType('nonsense')).toBe(false);
  });
});

describe('getShopReport transforms', () => {
  it('sales: reshapes revenue/invoiceCount/bestSellers into the frontend contract', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: {
        revenue: 5000,
        invoiceCount: 12,
        cashTotal: 3000,
        creditTotal: 2000,
        bestSellers: [{ productId: 'p1', name: 'منتج أ', qty: 10, total: 500 }],
      },
    });

    const result = await getShopReport(shop, 'sales', { from: '2026-09-01', to: '2026-09-08' });

    expect(result).toEqual({
      totalSales: 5000,
      count: 12,
      byDay: [],
      topProducts: [{ name: 'منتج أ', qty: 10 }],
      byPaymentType: { cash: 3000, credit: 2000 },
    });
    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/reports/sales', { params: { from: '2026-09-01', to: '2026-09-08' } });
  });

  it('purchases: maps total -> totalPurchases', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { total: 900, count: 4, paid: 400, remaining: 500 } });
    const result = await getShopReport(shop, 'purchases', {});
    expect(result).toEqual({ totalPurchases: 900, count: 4 });
  });

  it('profit: computes margin from revenue and net', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { revenue: 1000, cogs: 400, gross: 600, expenses: 100, net: 500 } });
    const result = await getShopReport(shop, 'profit', {});
    expect(result).toEqual({ totalProfit: 500, margin: 50, byDay: [] });
  });

  it('profit: margin is 0 when revenue is 0 (avoids division by zero)', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { revenue: 0, cogs: 0, gross: 0, expenses: 0, net: 0 } });
    const result = await getShopReport(shop, 'profit', {});
    expect(result.margin).toBe(0);
  });

  it('inventory: maps costValue/productsCount -> totalStockValue/totalProducts', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: { productsCount: 30, totalQuantity: 500, costValue: 12000, saleValue: 18000, lowCount: 2, outCount: 1, expectedProfit: 6000 },
    });
    const result = await getShopReport(shop, 'inventory', {});
    expect(result).toEqual({ totalStockValue: 12000, totalProducts: 30 });
  });

  it('customers: maps _id/total -> id/totalSpent', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: { count: 10, totalOutstanding: 200, withBalanceCount: 2, topCustomers: [{ _id: 'c1', name: 'أحمد', total: 900, paid: 700, remaining: 200 }] },
    });
    const result = await getShopReport(shop, 'customers', { limit: 8 });
    expect(result).toEqual({ topCustomers: [{ id: 'c1', name: 'أحمد', totalSpent: 900 }] });
  });

  it('suppliers: maps _id/total -> id/totalAmount', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: { count: 5, totalOutstanding: 100, withBalanceCount: 1, topSuppliers: [{ _id: 's1', name: 'مورد أ', total: 3000, paid: 3000, remaining: 0 }] },
    });
    const result = await getShopReport(shop, 'suppliers', {});
    expect(result).toEqual({ topSuppliers: [{ id: 's1', name: 'مورد أ', totalAmount: 3000 }] });
  });
});
