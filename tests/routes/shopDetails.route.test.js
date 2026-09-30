import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/shops.js', () => ({
  SHOPS: [{ id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' }],
  getShopById: (id) =>
    id === 'shop1' ? { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' } : null,
}));

vi.mock('../../src/services/shopOverview.service.js', () => ({
  getShopOverview: vi.fn(),
}));

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { getShopOverview } = await import('../../src/services/shopOverview.service.js');
const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { createApp } = await import('../../src/app.js');
const { signOwnerToken } = await import('../../src/config/jwt.js');

let token;

beforeEach(() => {
  vi.clearAllMocks();
  token = signOwnerToken();
});

describe('GET /api/shops/:shopId/overview', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/overview');
    expect(res.status).toBe(401);
  });

  it('returns the overview data for a valid shop', async () => {
    getShopOverview.mockResolvedValue({ todaySales: 100, lowStockItems: [] });
    const app = createApp();

    const res = await request(app).get('/api/shops/shop1/overview').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.todaySales).toBe(100);
  });

  it('is NOT swallowed by the generic /:shopId/:entity proxy', async () => {
    getShopOverview.mockResolvedValue({ todaySales: 0, lowStockItems: [] });
    const app = createApp();

    await request(app).get('/api/shops/shop1/overview').set('Authorization', `Bearer ${token}`);

    expect(getShopOverview).toHaveBeenCalled();
    expect(fetchFromShop).not.toHaveBeenCalledWith(expect.anything(), '/overview', expect.anything());
  });
});

describe('GET /api/shops/:shopId/cashbox/summary', () => {
  it('proxies directly to the shop and returns its data', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { balance: 500, todayIn: 100, todayOut: 20 } });
    const app = createApp();

    const res = await request(app).get('/api/shops/shop1/cashbox/summary').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(500);
    expect(fetchFromShop).toHaveBeenCalledWith(expect.objectContaining({ id: 'shop1' }), '/cashbox/summary');
  });
});

describe('GET /api/shops/:shopId/expenses/summary', () => {
  it('proxies directly to the shop and returns its data', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { todayTotal: 50, monthTotal: 900 } });
    const app = createApp();

    const res = await request(app).get('/api/shops/shop1/expenses/summary').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.monthTotal).toBe(900);
  });
});

function shopError(message, status) {
  const err = new Error(message);
  err.name = 'ShopClientError';
  err.status = status;
  err.statusCode = status >= 500 ? 502 : status;
  err.isOperational = true;
  return err;
}

describe('GET /api/shops/:shopId/settings', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/settings');
    expect(res.status).toBe(401);
  });

  it('returns ONLY the whitelisted invoice-header fields', async () => {
    fetchFromShop.mockResolvedValue({
      success: true,
      data: {
        _id: 'x', singletonKey: 'main', shopName: ' محل النور ', ownerName: 'بيشوي', phone: '0100', address: 'ملوي',
        invoiceFooter: 'شكراً لزيارتكم', lowStockThreshold: 5, accessCode: 'SECRET', updatedAt: '2026-09-01',
      },
    });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/settings').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      shopName: 'محل النور', ownerName: 'بيشوي', phone: '0100', address: 'ملوي', invoiceFooter: 'شكراً لزيارتكم',
    });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(fetchFromShop).toHaveBeenCalledWith(expect.objectContaining({ id: 'shop1' }), '/settings');
  });

  it("falls back to System 5's configured shop name and empty strings", async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { shopName: '', phone: null } });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/settings').set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toEqual({ shopName: 'المحل الأول', ownerName: '', phone: '', address: '', invoiceFooter: '' });
  });
});

describe('GET /api/shops/:shopId/expenses/reasons', () => {
  it('returns the real distinct reasons from the shop', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: ['إيجار', '', 'كهرباء'] });

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/expenses/reasons').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: ['إيجار', 'كهرباء'], supported: true });
    expect(fetchFromShop.mock.calls[0][1]).toBe('/expenses/reasons');
  });

  it('reports supported:false (not an error) when the shop has not been patched yet', async () => {
    fetchFromShop.mockRejectedValue(shopError('المسار غير موجود', 404));

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/expenses/reasons').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [], supported: false });
  });

  it('still reports a real failure (shop down) as an error', async () => {
    fetchFromShop.mockRejectedValue(shopError('المحل الأول: تعذر الاتصال بالمحل', 500));

    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/expenses/reasons').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
  });
});
