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
  it('forwards the query as-is and returns data + pagination', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: [{ id: '1' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await getShopEntityList(shop, 'sales', { page: 1, search: 'أحمد', paymentType: 'cash' });

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/sales', {
      params: { page: 1, search: 'أحمد', paymentType: 'cash' },
    });
    expect(result).toEqual({ data: [{ id: '1' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
  });
});

describe('getShopEntityItem', () => {
  it('fetches the single-item path and returns its data', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { id: 'abc', name: 'منتج' } });

    const result = await getShopEntityItem(shop, 'products', 'abc');

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/products/abc');
    expect(result).toEqual({ id: 'abc', name: 'منتج' });
  });
});
