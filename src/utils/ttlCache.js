/**
 * Tiny in-memory TTL cache with in-flight de-duplication.
 *
 * Why: the home page fans out to ~40 calls against the shops' /api/admin
 * (which is rate limited to 300 per 15 min per shop). Opening the app twice
 * in a minute should not cost twice. Cached answers live in this server
 * instance's memory only — nothing persisted, nothing shared between users
 * beyond the same dashboard (there is one owner login).
 *
 *   const cache = createTtlCache({ ttlMs: 60_000 });
 *   const data = await cache.get('key', () => expensiveCall());
 *
 * - Concurrent callers for the same key share ONE computation.
 * - A failed computation is never cached.
 * - `enabled` (boolean or function) turns it off — used to bypass the cache
 *   under tests so mocks can't leak between test cases.
 */
export function createTtlCache({ ttlMs, enabled = true, maxEntries = 50, now = () => Date.now() } = {}) {
  const entries = new Map(); // key -> { at, promise }

  const isEnabled = () => (typeof enabled === 'function' ? enabled() : enabled);

  async function get(key, compute) {
    if (!isEnabled()) return compute();

    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.promise;

    const promise = Promise.resolve()
      .then(compute)
      .catch((err) => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
        throw err;
      });
    entries.set(key, { at: now(), promise });

    if (entries.size > maxEntries) entries.delete(entries.keys().next().value); // drop the oldest
    return promise;
  }

  return { get, clear: () => entries.clear(), size: () => entries.size };
}

/** Caches are off while running the test suite (see tests/utils/ttlCache.test.js for the cache itself). */
export const notInTests = () => process.env.NODE_ENV !== 'test';
