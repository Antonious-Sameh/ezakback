import { fetchFromShop } from './shopClient.service.js';
import { translateQuery, transformList, transformItem } from './shopEntityTransforms.service.js';

/**
 * The only entities this proxy will forward to a shop's /api/admin/*.
 * Deliberately a fixed whitelist, not "whatever path the frontend asks
 * for" — /overview, /reports/:type, /cashbox/summary and /expenses/summary
 * have their own dedicated endpoints (Stage 8-9) because their response
 * shape isn't the standard { data, pagination } list shape this proxy
 * assumes. Keeping this list exact also means a typo'd or unexpected
 * entity name fails fast with a clear 404 instead of silently forwarding
 * to a shop path nobody intended to expose.
 */
export const ALLOWED_ENTITIES = [
  'products',
  'customers',
  'suppliers',
  'sales',
  'purchases',
  'cashbox',
  'expenses',
  'activity',
];

export function isAllowedEntity(entity) {
  return ALLOWED_ENTITIES.includes(entity);
}

/**
 * Entities whose shop exposes a single-item endpoint (/api/admin/{entity}/:id).
 * Checked against Shops 1-4's admin.route.js: there is NO by-id route for
 * cashbox, expenses or activity — only lists. Forwarding those used to
 * reach the shop, get its 404, and surface to the owner as a vague
 * "خطأ من الخادم". Their list rows already carry every field the shop has,
 * so there is nothing more a detail call could add anyway.
 */
export const DETAIL_ENTITIES = ['products', 'customers', 'suppliers', 'sales', 'purchases'];

export function hasDetailEndpoint(entity) {
  return DETAIL_ENTITIES.includes(entity);
}

/**
 * GET /api/admin/{entity}?... on the given shop, then reshaped to match the
 * frontend's contract — see shopEntityTransforms.service.js for exactly
 * what changes and why per entity (field renames, computed fields, name
 * lookups for sales/purchases).
 */
export async function getShopEntityList(shop, entity, query) {
  const payload = await fetchFromShop(shop, `/${entity}`, { params: translateQuery(entity, query) });
  const data = await transformList(shop, entity, payload.data);
  return { data, pagination: payload.pagination };
}

/** GET /api/admin/{entity}/:id on the given shop, reshaped the same way as the list. */
export async function getShopEntityItem(shop, entity, id) {
  const payload = await fetchFromShop(shop, `/${entity}/${id}`);
  return transformItem(shop, entity, payload.data);
}

/**
 * Export: every row matching the current filters (not just one page), in
 * the same transformed shape as the list, for CSV / Excel download.
 *
 * Pages through the shop at its max page size. Capped at EXPORT_MAX_ROWS
 * so one click can never turn into an unbounded run of calls against the
 * shop (each page counts against the shop's /api/admin rate limit):
 * 3,000 rows = 30 calls + one cached name lookup. If more rows match, the
 * result says `truncated: true` and the frontend tells the owner to narrow
 * the date range.
 */
export const EXPORT_PAGE_SIZE = 100;
export const EXPORT_MAX_ROWS = 3000;

export async function exportShopEntityList(shop, entity, query = {}) {
  // page/limit from the caller are meaningless for an export.
  const { page: _page, limit: _limit, ...filters } = query;
  const params = translateQuery(entity, filters);

  const raw = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    // Sequential on purpose: stop as soon as the last page (or the cap) is reached.
    const payload = await fetchFromShop(shop, `/${entity}`, {
      params: { ...params, page, limit: EXPORT_PAGE_SIZE },
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    raw.push(...rows);
    total = payload?.pagination?.total ?? raw.length;
    const totalPages = payload?.pagination?.totalPages ?? 1;
    if (raw.length >= EXPORT_MAX_ROWS || page >= totalPages || rows.length === 0) break;
  }

  const kept = raw.slice(0, EXPORT_MAX_ROWS);
  const data = await transformList(shop, entity, kept);
  return { data, total, truncated: total > kept.length };
}

