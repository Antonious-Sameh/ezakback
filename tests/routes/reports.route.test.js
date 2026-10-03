import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/compareReport.service.js', () => ({
  getCompareReport: vi.fn(),
}));
vi.mock('../../src/services/positionReport.service.js', () => ({
  getPositionReport: vi.fn(),
}));

const { getCompareReport } = await import('../../src/services/compareReport.service.js');
const { getPositionReport } = await import('../../src/services/positionReport.service.js');
const { createApp } = await import('../../src/app.js');
const { signOwnerToken } = await import('../../src/config/jwt.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/reports/compare', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/reports/compare');
    expect(res.status).toBe(401);
  });

  it('passes explicit from/to through to the service', async () => {
    getCompareReport.mockResolvedValue({ totalSales: 0, totalProfit: 0, byShop: [] });
    const app = createApp();
    const token = signOwnerToken();

    await request(app)
      .get('/api/reports/compare?from=2026-09-01&to=2026-09-08')
      .set('Authorization', `Bearer ${token}`);

    expect(getCompareReport).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-08' });
  });

  it('defaults to month-to-date when from/to are omitted', async () => {
    getCompareReport.mockResolvedValue({ totalSales: 0, totalProfit: 0, byShop: [] });
    const app = createApp();
    const token = signOwnerToken();

    await request(app).get('/api/reports/compare').set('Authorization', `Bearer ${token}`);

    const rangeArg = getCompareReport.mock.calls[0][0];
    expect(rangeArg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rangeArg.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects a malformed date', async () => {
    const app = createApp();
    const token = signOwnerToken();

    const res = await request(app)
      .get('/api/reports/compare?from=not-a-date&to=2026-09-08')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns the aggregated result', async () => {
    getCompareReport.mockResolvedValue({
      totalSales: 3000,
      totalProfit: 800,
      byShop: [{ shopId: 'shop1', shopName: 'المحل الأول', sales: 1000, profit: 300 }],
    });
    const app = createApp();
    const token = signOwnerToken();

    const res = await request(app).get('/api/reports/compare').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSales).toBe(3000);
  });
});

describe('GET /api/reports/position', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/reports/position');
    expect(res.status).toBe(401);
  });

  it('returns the position report (debts, stock, cash per shop and in total)', async () => {
    getPositionReport.mockResolvedValue({ generatedAt: '2026-10-01T09:00:00.000Z', totals: { net: 100, complete: true }, byShop: [] });
    const app = createApp();
    const token = signOwnerToken();

    const res = await request(app).get('/api/reports/position').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { generatedAt: '2026-10-01T09:00:00.000Z', totals: { net: 100, complete: true }, byShop: [] } });
  });
});

