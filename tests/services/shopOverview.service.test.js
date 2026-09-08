import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { getShopOverview } = await import('../../src/services/shopOverview.service.js');

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAllSucceed() {
  fetchFromShop.mockImplementation((s, path, options) => {
    if (path === '/reports/sales') {
      const isToday = options?.params?.from === options?.params?.to;
      return Promise.resolve({ success: true, data: { revenue: isToday ? 100 : 900, invoiceCount: isToday ? 3 : 20 } });
    }
    if (path === '/reports/profit') return Promise.resolve({ success: true, data: { net: 40 } });
    if (path === '/reports/inventory') {
      return Promise.resolve({ success: true, data: { productsCount: 50, lowCount: 2, outCount: 1 } });
    }
    if (path === '/cashbox/summary') return Promise.resolve({ success: true, data: { balance: 1200 } });
    if (path === '/reports/customers') return Promise.resolve({ success: true, data: { count: 30 } });
    if (path === '/products') {
      const status = options?.params?.filter;
      return Promise.resolve({
        success: true,
        data: [{ _id: `${status}-1`, name: `منتج ${status}`, code: `SKU-${status}`, quantity: status === 'out' ? 0 : 2 }],
      });
    }
    return Promise.reject(new Error('unexpected path ' + path));
  });
}

describe('getShopOverview', () => {
  it('builds the full overview shape when every call succeeds', async () => {
    mockAllSucceed();

    const result = await getShopOverview(shop);

    expect(result).toMatchObject({
      todaySales: 100,
      todayOrders: 3,
      monthSales: 900,
      todayProfit: 40,
      cashboxBalance: 1200,
      productCount: 50,
      lowStockCount: 3,
      customerCount: 30,
    });
    expect(result.lowStockItems).toHaveLength(2);
    expect(result.lowStockItems[0]).toMatchObject({ status: 'out', sku: 'SKU-out', stock: 0, category: null, unit: '' });
    expect(result.lowStockItems[1]).toMatchObject({ status: 'low', sku: 'SKU-low' });
  });

  it('defaults every figure to 0 when all shop calls fail', async () => {
    fetchFromShop.mockRejectedValue(new Error('down'));

    const result = await getShopOverview(shop);

    expect(result).toMatchObject({
      todaySales: 0,
      todayOrders: 0,
      monthSales: 0,
      todayProfit: 0,
      cashboxBalance: 0,
      productCount: 0,
      lowStockCount: 0,
      customerCount: 0,
    });
    expect(result.lowStockItems).toEqual([]);
  });
});
