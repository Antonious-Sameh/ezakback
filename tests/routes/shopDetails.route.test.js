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
