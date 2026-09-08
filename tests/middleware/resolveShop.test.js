import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/shops.js', () => ({
  getShopById: (id) => (id === 'shop1' ? { id: 'shop1', name: 'المحل الأول' } : null),
}));

const { resolveShop } = await import('../../src/middleware/resolveShop.js');

describe('resolveShop', () => {
  it('attaches the shop to req.shop when found', () => {
    const req = { params: { shopId: 'shop1' } };
    const next = vi.fn();
    resolveShop(req, {}, next);

    expect(req.shop).toEqual({ id: 'shop1', name: 'المحل الأول' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 404 for an unknown shop id', () => {
    const req = { params: { shopId: 'shop99' } };
    const next = vi.fn();
    resolveShop(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(req.shop).toBeUndefined();
  });
});
