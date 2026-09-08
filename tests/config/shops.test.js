import { describe, it, expect, vi, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function resetShopEnvVars() {
  for (let n = 1; n <= 4; n += 1) {
    delete process.env[`SHOP${n}_NAME`];
    delete process.env[`SHOP${n}_API_URL`];
    delete process.env[`SHOP${n}_ADMIN_KEY`];
  }
}

describe('SHOPS config derivation', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('produces an empty list when no shop is configured', async () => {
    resetShopEnvVars();
    vi.resetModules();
    const { SHOPS } = await import('../../src/config/shops.js');
    expect(SHOPS).toEqual([]);
  });

  it('includes only fully-configured shops, in order', async () => {
    resetShopEnvVars();
    process.env.SHOP1_API_URL = 'https://shop1.example.com/api';
    process.env.SHOP1_ADMIN_KEY = 'key-1';
    process.env.SHOP3_API_URL = 'https://shop3.example.com/api';
    process.env.SHOP3_ADMIN_KEY = 'key-3';
    vi.resetModules();

    const { SHOPS } = await import('../../src/config/shops.js');

    expect(SHOPS.map((s) => s.id)).toEqual(['shop1', 'shop3']);
  });

  it('strips a trailing slash from apiUrl', async () => {
    resetShopEnvVars();
    process.env.SHOP1_API_URL = 'https://shop1.example.com/api/';
    process.env.SHOP1_ADMIN_KEY = 'key-1';
    vi.resetModules();

    const { SHOPS } = await import('../../src/config/shops.js');

    expect(SHOPS[0].apiUrl).toBe('https://shop1.example.com/api');
  });

  it('defaults a shop name when SHOP{N}_NAME is not set', async () => {
    resetShopEnvVars();
    process.env.SHOP2_API_URL = 'https://shop2.example.com/api';
    process.env.SHOP2_ADMIN_KEY = 'key-2';
    vi.resetModules();

    const { SHOPS } = await import('../../src/config/shops.js');

    expect(SHOPS[0].name).toBe('المحل الثاني');
  });

  it('exits the process if a shop has a URL but no key (half-configured)', async () => {
    resetShopEnvVars();
    process.env.SHOP1_API_URL = 'https://shop1.example.com/api';
    // SHOP1_ADMIN_KEY intentionally left unset
    vi.resetModules();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(import('../../src/config/shops.js')).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('getShopById finds a configured shop and returns null for an unknown one', async () => {
    resetShopEnvVars();
    process.env.SHOP1_API_URL = 'https://shop1.example.com/api';
    process.env.SHOP1_ADMIN_KEY = 'key-1';
    vi.resetModules();

    const { getShopById } = await import('../../src/config/shops.js');

    expect(getShopById('shop1')?.apiUrl).toBe('https://shop1.example.com/api');
    expect(getShopById('shop9')).toBeNull();
  });
});
