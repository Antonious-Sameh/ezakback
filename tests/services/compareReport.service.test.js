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

const range = { from: '2026-09-01', to: '2026-09-08' };

describe('getCompareReport', () => {
  it('sums sales and profit across every shop', async () => {
    fetchFromShop.mockImplementation((shop, path) => {
      if (path === '/reports/sales') return Promise.resolve({ success: true, data: { revenue: shop.id === 'shop1' ? 1000 : 2000 } });
      return Promise.resolve({ success: true, data: { net: shop.id === 'shop1' ? 300 : 500 } });
    });

    const result = await getCompareReport(range);

    expect(result.totalSales).toBe(3000);
    expect(result.totalProfit).toBe(800);
    expect(result.byShop).toEqual([
      { shopId: 'shop1', shopName: 'المحل الأول', sales: 1000, profit: 300 },
      { shopId: 'shop2', shopName: 'المحل الثاني', sales: 2000, profit: 500 },
    ]);
  });

  it('contributes 0 for a shop whose calls fail, without breaking the total', async () => {
    fetchFromShop.mockImplementation((shop, path) => {
      if (shop.id === 'shop2') return Promise.reject(new Error('down'));
      if (path === '/reports/sales') return Promise.resolve({ success: true, data: { revenue: 500 } });
      return Promise.resolve({ success: true, data: { net: 100 } });
    });

    const result = await getCompareReport(range);

    expect(result.totalSales).toBe(500);
    expect(result.totalProfit).toBe(100);
    expect(result.byShop.find((s) => s.shopId === 'shop2')).toEqual({
      shopId: 'shop2',
      shopName: 'المحل الثاني',
      sales: 0,
      profit: 0,
    });
  });
});
