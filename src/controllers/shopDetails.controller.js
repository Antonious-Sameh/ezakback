import { asyncHandler } from '../middleware/asyncHandler.js';
import { fetchFromShop } from '../services/shopClient.service.js';
import { getShopOverview } from '../services/shopOverview.service.js';
import { n } from '../services/shopReportFields.js';

/** GET /api/shops/:shopId/overview */
export const overview = asyncHandler(async (req, res) => {
  const data = await getShopOverview(req.shop);
  res.json({ success: true, data });
});

/**
 * GET /api/shops/:shopId/cashbox/summary and .../expenses/summary.
 *
 * These used to be blind pass-throughs, on the assumption that the shop's
 * answer already matched the frontend. It didn't: the shops send
 * { balance, todayIn, todayOut } and { todayTotal, monthTotal }, while the
 * cards read totalIn / totalOut / total / thisMonth — so they showed 0.
 * The shape is now spelled out here, explicitly.
 */
export const cashboxSummary = asyncHandler(async (req, res) => {
  const d = (await fetchFromShop(req.shop, '/cashbox/summary')).data || {};
  const todayIn = n(d.todayIn);
  const todayOut = n(d.todayOut);
  res.json({
    success: true,
    data: { balance: n(d.balance), todayIn, todayOut, todayNet: Math.round((todayIn - todayOut) * 100) / 100 },
  });
});

export const expensesSummary = asyncHandler(async (req, res) => {
  const d = (await fetchFromShop(req.shop, '/expenses/summary')).data || {};
  res.json({ success: true, data: { todayTotal: n(d.todayTotal), monthTotal: n(d.monthTotal) } });
});

/**
 * Fields of a shop's settings that are safe and useful to show the owner
 * (invoice header/footer). Whitelisted — never a blind pass-through — so
 * nothing the shop may add to its Settings document later (codes, flags,
 * thresholds) can leak through System 5 by accident.
 */
export const SHOP_SETTINGS_FIELDS = ['shopName', 'ownerName', 'phone', 'address', 'invoiceFooter'];

export function pickShopSettings(raw, shop) {
  const data = {};
  for (const key of SHOP_SETTINGS_FIELDS) {
    const value = raw?.[key];
    data[key] = typeof value === 'string' ? value.trim() : '';
  }
  // The shop's own name on file wins; System 5's configured label is the fallback.
  if (!data.shopName) data.shopName = shop.name;
  return data;
}

/** GET /api/shops/:shopId/settings — invoice header info for printing. */
export const settings = asyncHandler(async (req, res) => {
  const payload = await fetchFromShop(req.shop, '/settings');
  res.json({ success: true, data: pickShopSettings(payload.data, req.shop) });
});

/**
 * GET /api/shops/:shopId/expenses/reasons — the distinct expense reasons
 * actually recorded in this shop (the expense list filter matches reason
 * exactly, so the options must come from real data).
 *
 * `supported: false` + an empty list when the shop hasn't received the
 * Phase 1 patch yet (its admin router answers 404 for this path): the
 * frontend then simply hides the filter instead of showing an error.
 */
export const expenseReasons = asyncHandler(async (req, res) => {
  try {
    const payload = await fetchFromShop(req.shop, '/expenses/reasons');
    const reasons = Array.isArray(payload.data) ? payload.data.filter((r) => typeof r === 'string' && r.trim()) : [];
    res.json({ success: true, data: reasons, supported: true });
  } catch (err) {
    if (err?.name === 'ShopClientError' && err.status === 404) {
      res.json({ success: true, data: [], supported: false });
      return;
    }
    throw err;
  }
});
