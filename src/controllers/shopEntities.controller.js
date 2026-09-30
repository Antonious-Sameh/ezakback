import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  isAllowedEntity,
  hasDetailEndpoint,
  getShopEntityList,
  getShopEntityItem,
  exportShopEntityList,
  EXPORT_MAX_ROWS,
} from '../services/shopProxy.service.js';

// Light shape check only (page/limit are numeric if present) — everything
// else passes through untouched for the shop's own validation to accept or
// reject. See shopProxy.service.js for why filters aren't re-declared here.
export const entityListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .passthrough();

function requireAllowedEntity(entity) {
  if (!isAllowedEntity(entity)) {
    throw new AppError('القسم غير موجود', 404);
  }
}

/** GET /api/shops/:shopId/:entity */
export const list = asyncHandler(async (req, res) => {
  requireAllowedEntity(req.params.entity);
  const result = await getShopEntityList(req.shop, req.params.entity, req.validatedQuery);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

/** GET /api/shops/:shopId/:entity/:id */
export const item = asyncHandler(async (req, res) => {
  requireAllowedEntity(req.params.entity);
  if (!hasDetailEndpoint(req.params.entity)) {
    // Answered here, without calling the shop — see DETAIL_ENTITIES.
    throw new AppError('التفاصيل غير متاحة لهذا القسم، كل بياناته معروضة في القائمة نفسها', 404);
  }
  const data = await getShopEntityItem(req.shop, req.params.entity, req.params.id);
  res.json({ success: true, data });
});

/** GET /api/shops/:shopId/:entity/export — all matching rows (capped), for CSV/Excel. */
export const exportList = asyncHandler(async (req, res) => {
  requireAllowedEntity(req.params.entity);
  const result = await exportShopEntityList(req.shop, req.params.entity, req.validatedQuery);
  res.json({
    success: true,
    data: result.data,
    total: result.total,
    truncated: result.truncated,
    maxRows: EXPORT_MAX_ROWS,
  });
});

