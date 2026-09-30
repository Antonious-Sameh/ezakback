import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/shops.js', () => ({
  SHOPS: [{ id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' }],
  getShopById: (id) => (id === 'shop1' ? { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' } : null),
}));

vi.mock('../../src/services/shopClient.service.js', async () => {
  const actual = await vi.importActual('../../src/services/shopClient.service.js');
  return { ...actual, fetchFromShop: vi.fn() };
});

const { fetchFromShop, ShopClientError } = await import('../../src/services/shopClient.service.js');
const { createApp } = await import('../../src/app.js');
const { signOwnerToken } = await import('../../src/config/jwt.js');

let token;

beforeEach(() => {
  vi.clearAllMocks();
  token = signOwnerToken();
});

describe('GET /api/shops/:shopId/:entity', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/products');
    expect(res.status).toBe(401);
  });

  it('404s for an unknown shop id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop99/products').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404s for an entity outside the whitelist', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/nonsense').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(fetchFromShop).not.toHaveBeenCalled();
  });

  it('proxies a valid entity list request with data + pagination, reshaped for the frontend', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: [{ _id: '1', name: 'منتج 1', code: 'C-1', quantity: 5, minQuantity: 1, salePrice: 10, purchasePrice: 5 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/products?search=منتج')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: '1', name: 'منتج 1', sku: 'C-1' });
    expect(res.body.pagination.total).toBe(1);
    expect(fetchFromShop.mock.calls[0][1]).toBe('/products');
  });
});

describe('GET /api/shops/:shopId/:entity/:id', () => {
  it('proxies a single-item request, reshaped for the frontend', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: {
        _id: 'abc',
        invoiceNumber: 'INV-100',
        customerId: null,
        total: 250,
        date: '2026-09-01',
        paymentMethod: 'cash',
        items: [],
      },
    });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/sales/abc').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'abc', invoiceNo: 'INV-100', customerName: 'عميل نقدي' });
    expect(fetchFromShop.mock.calls[0][1]).toBe('/sales/abc');
  });

  it('404s for an entity outside the whitelist even with an id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/nonsense/abc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('shop failures surface with the right status, not a hidden generic 500', () => {
  it('an unreachable shop returns 502 with the friendly ShopClientError message', async () => {
    fetchFromShop.mockRejectedValue(new ShopClientError('المحل الأول: تعذر الاتصال بالمحل', { shopId: 'shop1' }));

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/products').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('تعذر الاتصال');
  });

  it('a legitimate 404 from the shop (item not found) passes through as 404, not 502', async () => {
    fetchFromShop.mockRejectedValue(
      new ShopClientError('العنصر غير موجود', { shopId: 'shop1', status: 404 }),
    );

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/products/abc').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('العنصر غير موجود');
  });
});

describe('detail requests for sections the shop has no detail endpoint for', () => {
  it.each(['activity', 'cashbox', 'expenses'])(
    '%s/:id answers 404 with a clear message, without calling the shop',
    async (entity) => {
      const app = createApp();
      const res = await request(app).get(`/api/shops/shop1/${entity}/abc`).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('التفاصيل غير متاحة');
      expect(fetchFromShop).not.toHaveBeenCalled();
    },
  );

  it.each(['products', 'customers', 'suppliers', 'sales', 'purchases'])('%s/:id is still forwarded', async (entity) => {
    fetchFromShop.mockResolvedValue({ success: true, data: { _id: 'abc', name: 'x', items: [] } });

    const app = createApp();
    const res = await request(app).get(`/api/shops/shop1/${entity}/abc`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(fetchFromShop.mock.calls.some(([, path]) => path === `/${entity}/abc`)).toBe(true);
  });
});


describe('GET /api/shops/:shopId/:entity/export', () => {
  it('returns every matching row with total / truncated / maxRows', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: [{ _id: 'e1', reason: 'إيجار', amount: 50, date: '2026-09-01' }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/expenses/export?from=2026-09-01').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, total: 1, truncated: false, maxRows: 3000 });
    expect(res.body.data[0]).toMatchObject({ id: 'e1', category: 'إيجار' });
  });

  it('is not mistaken for a detail request (export is not an id)', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [], pagination: { totalPages: 1, total: 0 } });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/activity/export').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200); // activity has no detail endpoint → would be 404 if routed as an item
    expect(fetchFromShop.mock.calls[0][1]).toBe('/activity');
  });

  it('rejects unknown sections and requires auth', async () => {
    const app = createApp();
    expect((await request(app).get('/api/shops/shop1/secrets/export').set('Authorization', `Bearer ${token}`)).status).toBe(404);
    expect((await request(app).get('/api/shops/shop1/sales/export')).status).toBe(401);
  });
});
