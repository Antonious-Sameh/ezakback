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

describe('DETAIL_ENTITIES', () => {
  it('matches the shops\' real by-id admin routes (no cashbox / expenses / activity)', async () => {
    const { DETAIL_ENTITIES, hasDetailEndpoint } = await import('../../src/services/shopProxy.service.js');
    expect(DETAIL_ENTITIES).toEqual(['products', 'customers', 'suppliers', 'sales', 'purchases']);
    expect(hasDetailEndpoint('activity')).toBe(false);
    expect(hasDetailEndpoint('cashbox')).toBe(false);
    expect(hasDetailEndpoint('expenses')).toBe(false);
    expect(hasDetailEndpoint('sales')).toBe(true);
  });
});


describe('exportShopEntityList', () => {
  async function load() {
    const mod = await import('../../src/services/shopProxy.service.js');
    const transforms = await import('../../src/services/shopEntityTransforms.service.js');
    transforms.clearNameLookupCache();
    fetchFromShop.mockReset(); // drop any queued mockResolvedValueOnce from earlier tests
    return mod;
  }
  const page = (rows, p, totalPages, total) => ({ success: true, data: rows, pagination: { page: p, totalPages, total } });
  const expenses = (n, offset = 0) =>
    Array.from({ length: n }, (_, i) => ({ _id: `e${offset + i}`, reason: 'إيجار', amount: 10, date: '2026-09-01' }));

  it('pages through ALL matching rows at 100 per page, keeping the filters and dropping page/limit', async () => {
    const { exportShopEntityList } = await load();
    fetchFromShop
      .mockResolvedValueOnce(page(expenses(100), 1, 3, 230))
      .mockResolvedValueOnce(page(expenses(100, 100), 2, 3, 230))
      .mockResolvedValueOnce(page(expenses(30, 200), 3, 3, 230));

    const result = await exportShopEntityList(shop, 'expenses', { page: 7, limit: 20, category: 'إيجار', from: '2026-09-01' });

    expect(fetchFromShop).toHaveBeenCalledTimes(3);
    expect(fetchFromShop.mock.calls[0][2]).toEqual({ params: { reason: 'إيجار', from: '2026-09-01', page: 1, limit: 100 } });
    expect(fetchFromShop.mock.calls[2][2].params.page).toBe(3);
    expect(result.data).toHaveLength(230);
    expect(result.data[0]).toMatchObject({ id: 'e0', category: 'إيجار', amount: 10 });
    expect(result).toMatchObject({ total: 230, truncated: false });
  });

  it('stops at EXPORT_MAX_ROWS and reports truncated', async () => {
    const { exportShopEntityList, EXPORT_MAX_ROWS, EXPORT_PAGE_SIZE } = await load();
    const pages = EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE;
    for (let p = 1; p <= pages + 5; p += 1) {
      fetchFromShop.mockResolvedValueOnce(page(expenses(100, (p - 1) * 100), p, 99, 9900));
    }

    const result = await exportShopEntityList(shop, 'expenses', {});

    expect(fetchFromShop).toHaveBeenCalledTimes(pages);
    expect(result.data).toHaveLength(EXPORT_MAX_ROWS);
    expect(result).toMatchObject({ total: 9900, truncated: true });
  });

  it('stops on an empty page even if the shop claims more pages', async () => {
    const { exportShopEntityList } = await load();
    fetchFromShop.mockResolvedValueOnce(page(expenses(5), 1, 10, 5)).mockResolvedValueOnce(page([], 2, 10, 5));

    const result = await exportShopEntityList(shop, 'expenses', {});

    expect(fetchFromShop).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(5);
  });

  it('resolves customer names for sales with ONE directory lookup for the whole export', async () => {
    const { exportShopEntityList } = await load();
    const sale = (i) => ({ _id: `s${i}`, invoiceNumber: `INV-${i}`, customerId: 'c1', total: 10, items: [] });
    fetchFromShop
      .mockResolvedValueOnce(page([sale(1), sale(2)], 1, 2, 3))
      .mockResolvedValueOnce(page([sale(3)], 2, 2, 3))
      .mockResolvedValueOnce({ success: true, data: [{ _id: 'c1', name: 'أحمد' }], pagination: { totalPages: 1 } });

    const result = await exportShopEntityList(shop, 'sales', {});

    expect(fetchFromShop).toHaveBeenCalledTimes(3);
    expect(result.data.map((r) => r.customerName)).toEqual(['أحمد', 'أحمد', 'أحمد']);
  });
});
