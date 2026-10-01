import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../middleware/errorHandler.js';
import { isAllowedReportType, getShopReport } from '../services/shopReports.service.js';
import { previousRange, pctChange } from '../utils/dateRanges.js';

/** Reports that can be compared with the previous period (`?compare=previous`). */
export const COMPARABLE_REPORTS = ['sales', 'profit', 'purchases'];

/** The scalar figures of a report (no lists / series) — what "previous" carries. */
function scalars(report) {
  return Object.fromEntries(Object.entries(report).filter(([, v]) => typeof v === 'number'));
}

/** Previous-period figures + % change for every scalar figure. */
export function withComparison(current, previous) {
  const prev = scalars(previous);
  const change = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, pctChange(current[k] ?? 0, v)]));
  return { ...current, previous: prev, change };
}

const dateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

export const reportQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  // "previous": also return the same figures for the period of the same
  // length right before, and the % change (sales / profit / purchases only).
  compare: z.enum(['previous']).optional(),
});

/** GET /api/shops/:shopId/reports/:type */
export const report = asyncHandler(async (req, res) => {
  const { type } = req.params;
  if (!isAllowedReportType(type)) {
    throw new AppError('نوع التقرير غير موجود', 404);
  }

  const { compare, ...params } = req.validatedQuery;
  const comparable = compare === 'previous' && COMPARABLE_REPORTS.includes(type) && params.from && params.to;

  if (!comparable) {
    const data = await getShopReport(req.shop, type, params);
    res.json({ success: true, data });
    return;
  }

  const prev = previousRange({ from: params.from, to: params.to });
  const [current, previous] = await Promise.all([
    getShopReport(req.shop, type, params),
    // The comparison is a bonus: if the previous period fails, still answer.
    getShopReport(req.shop, type, { ...params, ...prev }).catch(() => null),
  ]);
  res.json({
    success: true,
    data: previous ? { ...withComparison(current, previous), previousRange: prev } : current,
  });
});
