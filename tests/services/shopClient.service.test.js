import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFromShop, fetchFromAllShops, buildQueryString } from '../../src/services/shopClient.service.js';

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://shop1.example.com/api', adminKey: 'secret-key' };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('buildQueryString', () => {
  it('returns an empty string for no usable params', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ filter: 'all', search: '' })).toBe('');
    expect(buildQueryString({ page: undefined, limit: null })).toBe('');
  });

  it('includes only meaningful params, URL-encoded', () => {
    const qs = buildQueryString({ page: 2, search: 'أحمد سالم', filter: 'all' });
    expect(qs).toContain('page=2');
    expect(qs).toContain('search=');
    expect(qs).not.toContain('filter');
  });
});

describe('fetchFromShop', () => {
  it('sends the admin key header and hits the right /admin path', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchFromShop(shop, '/products', { params: { page: 1 } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://shop1.example.com/api/admin/products?page=1');
    expect(options.headers['X-Admin-Key']).toBe('secret-key');
  });

  it('returns the parsed JSON payload on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { total: 5 } })));

    const result = await fetchFromShop(shop, '/cashbox/summary');
    expect(result).toEqual({ success: true, data: { total: 5 } });
  });

  it('throws ShopClientError with the shop id on a non-2xx response, mapping an auth failure to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'غير مصرح' }, { ok: false, status: 401 })),
    );

    await expect(fetchFromShop(shop, '/products')).rejects.toMatchObject({
      name: 'ShopClientError',
      shopId: 'shop1',
      status: 401,
      message: 'غير مصرح',
      // 401/403 from the shop means OUR key was rejected — a System 5
      // misconfiguration, never surfaced as 401 (would look like the
      // caller's own System 5 session expired).
      statusCode: 502,
      isOperational: true,
    });
  });

  it('passes through a legitimate 404 from the shop unchanged (e.g. item not found)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'العنصر غير موجود' }, { ok: false, status: 404 })),
    );

    await expect(fetchFromShop(shop, '/products/abc')).rejects.toMatchObject({
      statusCode: 404,
      message: 'العنصر غير موجود',
    });
  });

  it('passes through a legitimate 400 from the shop unchanged (e.g. bad filter value)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: false, message: 'قيمة غير صالحة' }, { ok: false, status: 400 })),
    );

    await expect(fetchFromShop(shop, '/products')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps a shop-side 500 to 502 (the shop itself is broken, not this request)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false }, { ok: false, status: 500 })));

    await expect(fetchFromShop(shop, '/products')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('throws ShopClientError on a network failure (no status)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    await expect(fetchFromShop(shop, '/products')).rejects.toMatchObject({
      name: 'ShopClientError',
      shopId: 'shop1',
      status: null,
    });
  });

  it('aborts and throws a clear timeout error when the shop never responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })),
    );

    await expect(fetchFromShop(shop, '/products', { timeoutMs: 20 })).rejects.toMatchObject({
      name: 'ShopClientError',
      shopId: 'shop1',
      message: expect.stringContaining('انتهت مهلة الاتصال'),
    });
  });
});

describe('fetchFromAllShops', () => {
  const shops = [
    { id: 'shop1', name: 'محل 1', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' },
    { id: 'shop2', name: 'محل 2', apiUrl: 'https://s2.example.com/api', adminKey: 'k2' },
  ];

  it('never rejects — one failing shop does not affect the other', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.startsWith('https://s1.example.com')) {
          return Promise.resolve(jsonResponse({ success: true, data: { ok: true } }));
        }
        return Promise.reject(new Error('connection refused'));
      }),
    );

    const results = await fetchFromAllShops(shops, '/overview');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ shopId: 'shop1', ok: true });
    expect(results[1]).toMatchObject({ shopId: 'shop2', ok: false });
    expect(results[1].error).toBeTruthy();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
