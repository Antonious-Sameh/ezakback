import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/shops.js', () => ({
  SHOPS: [{ id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' }],
  getShopById: (id) =>
    id === 'shop1' ? { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' } : null,
}));

vi.mock('../../src/services/shopReports.service.js', async () => {
  const actual = await vi.importActual('../../src/services/shopReports.service.js');
  return { ...actual, getShopReport: vi.fn() };
});

const { getShopReport } = await import('../../src/services/shopReports.service.js');
const { createApp } = await import('../../src/app.js');
const { signOwnerToken } = await import('../../src/config/jwt.js');

let token;

beforeEach(() => {
  vi.clearAllMocks();
  token = signOwnerToken();
});

describe('GET /api/shops/:shopId/reports/:type', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/reports/sales');
    expect(res.status).toBe(401);
  });

  it('404s for an unknown report type', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop1/reports/nonsense').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(getShopReport).not.toHaveBeenCalled();
  });

  it('404s for an unknown shop', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops/shop99/reports/sales').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed date', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/reports/sales?from=bad-date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns the transformed report for a valid type', async () => {
    getShopReport.mockResolvedValue({ totalSales: 5000, count: 12, byDay: [], topProducts: [], byPaymentType: {} });
    const app = createApp();

    const res = await request(app)
      .get('/api/shops/shop1/reports/sales?from=2026-09-01&to=2026-09-08')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSales).toBe(5000);
    expect(getShopReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'shop1' }),
      'sales',
      expect.objectContaining({ from: '2026-09-01', to: '2026-09-08' }),
    );
  });

  it('is checked BEFORE the generic /:shopId/:entity/:id proxy (route precedence)', async () => {
    getShopReport.mockResolvedValue({ totalPurchases: 0, count: 0 });
    const app = createApp();

    const res = await request(app).get('/api/shops/shop1/reports/purchases').set('Authorization', `Bearer ${token}`);

    // If the generic proxy had matched first, this would have gone through
    // shopEntities' 404 (entity="reports" not in ALLOWED_ENTITIES) instead.
    expect(res.status).toBe(200);
  });
});

describe('?compare=previous', () => {
  it('returns the previous period of the same length and the % change of every figure', async () => {
    getShopReport.mockImplementation((shop, type, params) =>
      Promise.resolve(params.from === '2026-09-01'
        ? { totalSales: 1200, count: 12, topProducts: [{ name: 'x' }] }
        : { totalSales: 1000, count: 15, topProducts: [] }));

    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/reports/sales?from=2026-09-01&to=2026-09-30&compare=previous')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(getShopReport).toHaveBeenCalledWith(expect.anything(), 'sales', { from: '2026-08-02', to: '2026-08-31' });
    expect(res.body.data).toMatchObject({
      totalSales: 1200,
      topProducts: [{ name: 'x' }],
      previous: { totalSales: 1000, count: 15 },
      change: { totalSales: 20, count: -20 },
      previousRange: { from: '2026-08-02', to: '2026-08-31' },
    });
    expect(res.body.data.previous).not.toHaveProperty('topProducts');
  });

  it('does not compare report types that are not period-based (inventory)', async () => {
    getShopReport.mockResolvedValue({ totalStockValue: 5 });
    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/reports/inventory?from=2026-09-01&to=2026-09-30&compare=previous')
      .set('Authorization', `Bearer ${token}`);

    expect(getShopReport).toHaveBeenCalledTimes(1);
    expect(res.body.data).toEqual({ totalStockValue: 5 });
  });

  it('still answers with the current period if the previous one fails', async () => {
    getShopReport
      .mockResolvedValueOnce({ totalProfit: 10 })
      .mockRejectedValueOnce(new Error('down'));
    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/reports/profit?from=2026-09-01&to=2026-09-07&compare=previous')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ totalProfit: 10 });
  });

  it('rejects an unknown compare mode', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/shops/shop1/reports/sales?from=2026-09-01&to=2026-09-07&compare=year')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
