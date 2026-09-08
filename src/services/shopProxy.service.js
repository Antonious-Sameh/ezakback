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
