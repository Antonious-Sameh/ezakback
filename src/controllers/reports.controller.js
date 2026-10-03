import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getCompareReport } from '../services/compareReport.service.js';
import { getPositionReport } from '../services/positionReport.service.js';
import { createTtlCache, notInTests } from '../utils/ttlCache.js';

// One owner, one dashboard: the same answer is good for a minute. This keeps
// "open the app, switch tabs, open it again" from costing the shops a full
// round of calls each time (their /api/admin is rate limited).
export const compareCache = createTtlCache({ ttlMs: 60_000, enabled: notInTests });
export const positionCache = createTtlCache({ ttlMs: 60_000, enabled: notInTests });
import { monthToDateRange } from '../utils/dateRanges.js';

export const compareQuerySchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD').optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD').optional(),
});

/** GET /api/reports/compare?from=&to= — defaults to month-to-date when omitted. */
export const compare = asyncHandler(async (req, res) => {
  const { from, to } = req.validatedQuery;
  const range = from && to ? { from, to } : monthToDateRange();

  const data = await compareCache.get(`${range.from}:${range.to}`, () => getCompareReport(range));
  res.json({ success: true, data });
});

/** GET /api/reports/position — "معانا كام": debts, stock, cash per shop and in total. */
export const position = asyncHandler(async (req, res) => {
  const data = await positionCache.get('position', () => getPositionReport());
  res.json({ success: true, data });
});
