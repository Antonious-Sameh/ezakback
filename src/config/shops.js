import env from './env.js';

/**
 * Turns the raw SHOP1_.../SHOP4_... env vars into a clean, validated list.
 * A shop is either fully configured (both URL and key set) or left out
 * entirely — never half-configured — so later stages (the shop client,
 * /api/shops, ...) can trust that every entry in SHOPS is actually callable,
 * instead of every call site re-checking for missing keys.
 *
 * This lets you configure shops incrementally (e.g. only Shop 1 during
 * early development) without the server refusing to start — it just serves
 * a shorter shop list until the rest are added.
 */
function buildShopsConfig() {
  const candidates = [
    { id: 'shop1', name: env.SHOP1_NAME, apiUrl: env.SHOP1_API_URL, adminKey: env.SHOP1_ADMIN_KEY },
    { id: 'shop2', name: env.SHOP2_NAME, apiUrl: env.SHOP2_API_URL, adminKey: env.SHOP2_ADMIN_KEY },
    { id: 'shop3', name: env.SHOP3_NAME, apiUrl: env.SHOP3_API_URL, adminKey: env.SHOP3_ADMIN_KEY },
    { id: 'shop4', name: env.SHOP4_NAME, apiUrl: env.SHOP4_API_URL, adminKey: env.SHOP4_ADMIN_KEY },
  ];

  const shops = [];

  for (const candidate of candidates) {
    const hasUrl = Boolean(candidate.apiUrl);
    const hasKey = Boolean(candidate.adminKey);

    if (!hasUrl && !hasKey) continue; // not configured — skip silently

    if (hasUrl !== hasKey) {
      // Half-configured is always a mistake, in every environment — fail
      // loudly and immediately rather than silently dropping the shop or
      // (worse) calling it with an empty key.
      console.error(
        `❌ ${candidate.id.toUpperCase()} is half-configured: ` +
          `${hasUrl ? 'API_URL is set but ADMIN_KEY is missing' : 'ADMIN_KEY is set but API_URL is missing'}.`,
      );
      process.exit(1);
    }

    shops.push({
      id: candidate.id,
      name: candidate.name,
      // Strip a trailing slash so later stages can safely do
      // `${apiUrl}/admin/...` without producing a double slash.
      apiUrl: candidate.apiUrl.replace(/\/+$/, ''),
      adminKey: candidate.adminKey,
    });
  }

  return shops;
}

export const SHOPS = buildShopsConfig();

export function getShopById(shopId) {
  return SHOPS.find((shop) => shop.id === shopId) || null;
}

export default SHOPS;
