import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/shopSummary.service.js', () => ({
  getAllShopsSummary: vi.fn(),
}));

const { getAllShopsSummary } = await import('../../src/services/shopSummary.service.js');
const { createApp } = await import('../../src/app.js');
const { signOwnerToken } = await import('../../src/config/jwt.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/shops', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/shops');
    expect(res.status).toBe(401);
  });

  it('returns the shop summary list for an authenticated request', async () => {
    getAllShopsSummary.mockResolvedValue([
      { id: 'shop1', name: 'المحل الأول', logoUrl: null, status: 'online', todaySales: 100, monthSales: 900, lowStockCount: 2 },
    ]);

    const app = createApp();
    const token = signOwnerToken();
    const res = await request(app).get('/api/shops').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('shop1');
  });
});
