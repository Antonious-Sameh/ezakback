import { asyncHandler } from '../middleware/asyncHandler.js';
import { getAllShopsSummary } from '../services/shopSummary.service.js';

/** GET /api/shops — summary card data for every configured shop. */
export const list = asyncHandler(async (req, res) => {
  const data = await getAllShopsSummary();
  res.json({ success: true, data });
});
