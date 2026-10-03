import { describe, it, expect, vi } from 'vitest';
import { createTtlCache } from '../../src/utils/ttlCache.js';

describe('createTtlCache', () => {
  it('computes once, then serves the cached answer until the TTL passes', async () => {
    let t = 0;
    const cache = createTtlCache({ ttlMs: 1000, now: () => t });
    const compute = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');

    expect(await cache.get('k', compute)).toBe('a');
    t = 999;
    expect(await cache.get('k', compute)).toBe('a');
    expect(compute).toHaveBeenCalledTimes(1);

    t = 1000;
    expect(await cache.get('k', compute)).toBe('b');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps different keys apart', async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const compute = vi.fn((k) => Promise.resolve(k));
    expect(await cache.get('x', () => compute('x'))).toBe('x');
    expect(await cache.get('y', () => compute('y'))).toBe('y');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers share ONE computation', async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    let release;
    const compute = vi.fn(() => new Promise((r) => { release = r; }));

    const [p1, p2, p3] = [cache.get('k', compute), cache.get('k', compute), cache.get('k', compute)];
    await new Promise((r) => setTimeout(r, 0)); // let the single computation start
    release('done');

    expect(await Promise.all([p1, p2, p3])).toEqual(['done', 'done', 'done']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('never caches a failure', async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const compute = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');

    await expect(cache.get('k', compute)).rejects.toThrow('down');
    expect(await cache.get('k', compute)).toBe('ok');
  });

  it('can be switched off (used under tests)', async () => {
    const cache = createTtlCache({ ttlMs: 1000, enabled: () => false });
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get('k', compute)).toBe(1);
    expect(await cache.get('k', compute)).toBe(2);
  });

  it('forgets the oldest entry past maxEntries', async () => {
    const cache = createTtlCache({ ttlMs: 1000, maxEntries: 2 });
    await cache.get('a', () => 1);
    await cache.get('b', () => 2);
    await cache.get('c', () => 3);
    expect(cache.size()).toBe(2);
  });
});
