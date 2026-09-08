import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../middleware/errorHandler.js';
import { isAllowedReportType, getShopReport } from '../services/shopReports.service.js';

const dateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

export const reportQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

/** GET /api/shops/:shopId/reports/:type */
export const report = asyncHandler(async (req, res) => {
  const { type } = req.params;
  if (!isAllowedReportType(type)) {
    throw new AppError('نوع التقرير غير موجود', 404);
  }

  const data = await getShopReport(req.shop, type, req.validatedQuery);
  res.json({ success: true, data });
});
