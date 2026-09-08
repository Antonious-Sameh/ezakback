import { fetchFromShop } from './shopClient.service.js';

/**
 * Each entry maps one report `type` to the shop's own /admin/reports/*
 * path and a `transform` that reshapes the shop's raw response into
 * exactly what ShopReportsPage.jsx (already built) reads. Field names
 * differ from the shop's own report shapes on purpose in a few places
 * (e.g. purchases' `total` -> `totalPurchases`) because that's what the
 * frontend contract already specifies — this layer is where that
 * reshaping happens, once, instead of on both ends.
 *
 * KNOWN GAP: `sales.byDay` and `profit.byDay` (the two trend charts on the
 * reports page) are returned as empty arrays. Shops 1-4's own reports
 * endpoints only return range TOTALS (see their reports.service.js) — there
 * is no day-by-day breakdown to reshape here, and estimating one client-side
 * from the shop's list endpoints would mean paginating through every sale
 * in the range on every report load, which is slow and not "read-only
 * reporting" so much as "recompute the shop's own data occasionally
 * again". The correct fix is a small, focused addition to Shops 1-4's
 * reports.service.js (a $group-by-day aggregation, same pattern already
 * used there) — flagging this rather than faking the chart data.
 */
const REPORT_HANDLERS = {
  sales: {
    path: '/reports/sales',
    transform: (d) => ({
      totalSales: d.revenue,
      count: d.invoiceCount,
      byDay: [], // see KNOWN GAP above
      topProducts: d.bestSellers.map((b) => ({ name: b.name, qty: b.qty })),
      byPaymentType: { cash: d.cashTotal, credit: d.creditTotal },
    }),
  },
  purchases: {
    path: '/reports/purchases',
    transform: (d) => ({ totalPurchases: d.total, count: d.count }),
  },
  profit: {
    path: '/reports/profit',
    transform: (d) => ({
      totalProfit: d.net,
      margin: d.revenue > 0 ? Math.round((d.net / d.revenue) * 1000) / 10 : 0,
      byDay: [], // see KNOWN GAP above
    }),
  },
  inventory: {
    // Always a current snapshot — the shop's inventory report has no date
    // range of its own (stock levels aren't a historical figure), so `from`
    // /`to` are accepted on this endpoint for a consistent query shape but
    // simply have no effect here.
    path: '/reports/inventory',
    transform: (d) => ({ totalStockValue: d.costValue, totalProducts: d.productsCount }),
  },
  customers: {
    path: '/reports/customers',
    transform: (d) => ({
      topCustomers: d.topCustomers.map((c) => ({ id: c._id, name: c.name, totalSpent: c.total })),
    }),
  },
  suppliers: {
    path: '/reports/suppliers',
    transform: (d) => ({
      topSuppliers: d.topSuppliers.map((s) => ({ id: s._id, name: s.name, totalAmount: s.total })),
    }),
  },
};

export const REPORT_TYPES = Object.keys(REPORT_HANDLERS);

export function isAllowedReportType(type) {
  return Object.prototype.hasOwnProperty.call(REPORT_HANDLERS, type);
}

/** GET .../reports/{type} on the shop, reshaped for the frontend. */
export async function getShopReport(shop, type, params) {
  const { path, transform } = REPORT_HANDLERS[type];
  const payload = await fetchFromShop(shop, path, { params });
  return transform(payload.data);
}
