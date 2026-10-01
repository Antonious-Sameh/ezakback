import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fx from '../fixtures/shopResponses.js';

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
const { getAllShopsSummary } = await import('../../src/services/shopSummary.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze "now" mid-month: these tests tell "today" and "month to date"
  // apart by their ranges, which are legitimately identical on the 1st.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getAllShopsSummary', () => {
  it('builds a full summary when every call succeeds', async () => {
    fetchFromShop.mockImplementation((shop, path) => {
      if (path === '/reports/sales') return Promise.resolve({ success: true, data: fx.salesReport({ netSales: 1000 }) });
      if (path === '/reports/inventory') {
        return Promise.resolve({ success: true, data: { lowCount: 2, outCount: 1 } });
      }
      return Promise.reject(new Error('unexpected path ' + path));
    });

    const [shop1] = await getAllShopsSummary();

    expect(shop1).toMatchObject({
      id: 'shop1',
      name: 'المحل الأول',
      logoUrl: null,
      status: 'online',
      todaySales: 1000,
      monthSales: 1000,
      lowStockCount: 3,
    });
  });

  it('marks a shop offline and zeroes its numbers when every call fails', async () => {
    fetchFromShop.mockRejectedValue(new Error('connection refused'));

    const results = await getAllShopsSummary();

    for (const shop of results) {
      expect(shop.status).toBe('offline');
      expect(shop.todaySales).toBe(0);
      expect(shop.monthSales).toBe(0);
      expect(shop.lowStockCount).toBe(0);
    }
  });

  it('stays online with partial data when only one call fails', async () => {
    fetchFromShop.mockImplementation((shop, path, options) => {
      if (path === '/reports/inventory') return Promise.reject(new Error('timeout'));
      // today vs month both hit /reports/sales — distinguish by params.from === params.to
      const isToday = options?.params?.from === options?.params?.to;
      return Promise.resolve({ success: true, data: fx.salesReport({ netSales: isToday ? 100 : 900 }) });
    });

    const [shop1] = await getAllShopsSummary();

    expect(shop1.status).toBe('online');
    expect(shop1.todaySales).toBe(100);
    expect(shop1.monthSales).toBe(900);
    expect(shop1.lowStockCount).toBe(0);
  });

  it('queries every configured shop independently and in parallel', async () => {
    fetchFromShop.mockImplementation((shop, path) => {
      if (path === '/reports/inventory') return Promise.resolve({ success: true, data: { lowCount: 0, outCount: 0 } });
      return Promise.resolve({ success: true, data: fx.salesReport({ netSales: shop.id === 'shop1' ? 10 : 20 }) });
    });

    const results = await getAllShopsSummary();

    expect(results.map((s) => s.id)).toEqual(['shop1', 'shop2']);
    expect(results[0].todaySales).toBe(10);
    expect(results[1].todaySales).toBe(20);
  });
});
