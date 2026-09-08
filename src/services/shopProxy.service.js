import { fetchFromShop } from './shopClient.service.js';

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
 * GET /api/admin/{entity}?... on the given shop, passed through as-is.
 * Deliberately does not re-validate individual filter params here (page,
 * search, status, paymentType, ...) — each shop's own /api/admin/* already
 * validates its own accepted filters per entity (see Shops 1-4's
 * admin.route.js), so re-declaring that same set of rules a second time on
 * this side would just be two places that can drift out of sync. This
 * layer's job is routing and auth, not re-implementing per-entity schemas.
 */
export async function getShopEntityList(shop, entity, query) {
  const payload = await fetchFromShop(shop, `/${entity}`, { params: query });
  return { data: payload.data, pagination: payload.pagination };
}

/** GET /api/admin/{entity}/:id on the given shop. */
export async function getShopEntityItem(shop, entity, id) {
  const payload = await fetchFromShop(shop, `/${entity}/${id}`);
  return payload.data;
}
