import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getCompareReport } from '../services/compareReport.service.js';
import { monthToDateRange } from '../utils/dateRanges.js';

export const compareQuerySchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD').optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD').optional(),
});

/** GET /api/reports/compare?from=&to= — defaults to month-to-date when omitted. */
export const compare = asyncHandler(async (req, res) => {
  const { from, to } = req.validatedQuery;
  const range = from && to ? { from, to } : monthToDateRange();

  const data = await getCompareReport(range);
  res.json({ success: true, data });
});
