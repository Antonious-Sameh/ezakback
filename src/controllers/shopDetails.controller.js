import { asyncHandler } from '../middleware/asyncHandler.js';
import { fetchFromShop } from '../services/shopClient.service.js';
import { getShopOverview } from '../services/shopOverview.service.js';

/** GET /api/shops/:shopId/overview */
export const overview = asyncHandler(async (req, res) => {
  const data = await getShopOverview(req.shop);
  res.json({ success: true, data });
});

/**
 * GET /api/shops/:shopId/cashbox/summary and .../expenses/summary are thin,
 * direct proxies (unlike /overview, there's no reshaping to do — each
 * shop's own /admin/.../summary response is already exactly what the
 * frontend's cashbox/expenses section headers expect).
 */
export const cashboxSummary = asyncHandler(async (req, res) => {
  const payload = await fetchFromShop(req.shop, '/cashbox/summary');
  res.json({ success: true, data: payload.data });
});

export const expensesSummary = asyncHandler(async (req, res) => {
  const payload = await fetchFromShop(req.shop, '/expenses/summary');
  res.json({ success: true, data: payload.data });
});
