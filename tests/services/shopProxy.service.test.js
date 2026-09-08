import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { isAllowedEntity, getShopEntityList, getShopEntityItem, ALLOWED_ENTITIES } = await import(
  '../../src/services/shopProxy.service.js'
);

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAllowedEntity', () => {
  it('allows every documented entity', () => {
    for (const entity of ['products', 'customers', 'suppliers', 'sales', 'purchases', 'cashbox', 'expenses', 'activity']) {
      expect(isAllowedEntity(entity)).toBe(true);
    }
    expect(ALLOWED_ENTITIES).toHaveLength(8);
  });

  it('rejects anything not on the whitelist, including endpoints handled elsewhere', () => {
    expect(isAllowedEntity('overview')).toBe(false);
    expect(isAllowedEntity('reports')).toBe(false);
    expect(isAllowedEntity('settings')).toBe(false);
    expect(isAllowedEntity('nonsense')).toBe(false);
  });
});

describe('getShopEntityList', () => {
  it('reshapes a simple entity (products) and returns data + pagination', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: [{ _id: 'p1', name: 'فلتر زيت', code: 'F-1', quantity: 5, minQuantity: 2, salePrice: 50, purchasePrice: 30 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await getShopEntityList(shop, 'products', { page: 1, search: 'فلتر' });

    expect(result.data[0]).toMatchObject({ id: 'p1', name: 'فلتر زيت', sku: 'F-1', stock: 5, status: 'ok' });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('translates paymentType -> paymentMethod before calling the shop, for sales', async () => {
    fetchFromShop.mockImplementation((s, path) => {
      if (path === '/sales') {
        return Promise.resolve({
          success: true,
          data: [{ _id: 's1', invoiceNumber: 'INV-1', customerId: null, total: 100, date: '2026-09-01', items: [] }],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }
      return Promise.resolve({ success: true, data: [] }); // the customer name-lookup call
    });

    await getShopEntityList(shop, 'sales', { paymentType: 'cash', page: 1 });

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/sales', { params: { paymentMethod: 'cash', page: 1 } });
  });
});

describe('getShopEntityItem', () => {
  it('reshapes a single simple item (products)', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: { _id: 'abc', name: 'منتج', code: 'X1', quantity: 0, minQuantity: 3, salePrice: 10, purchasePrice: 5 },
    });

    const result = await getShopEntityItem(shop, 'products', 'abc');

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/products/abc');
    expect(result).toMatchObject({ id: 'abc', name: 'منتج', sku: 'X1', status: 'out' });
  });
});
