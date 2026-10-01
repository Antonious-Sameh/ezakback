/**
 * The ONE place that knows the field names of Shops 1-4's report responses.
 *
 * Why this file exists: when the shops gained sales returns, their
 * /admin/reports/sales stopped returning `revenue` and started returning
 * `grossSales` (before returns) + `netSales` (after returns), and
 * /reports/profit started returning `netRevenue`. System 5 kept reading the
 * old names in four different services, so every sales figure in the
 * dashboard (shop cards, the big total, the shop comparison, "today's
 * sales", report margins) silently came out as 0.
 *
 * Every reader now goes through these helpers, which accept both the
 * current shape and the older one (in case a shop is ever on an older
 * build), and never return undefined / NaN.
 *
 * Current shapes (Shops 1-4, src/services/reports.service.js):
 *   /reports/sales   → { grossSales, invoiceCount, cashTotal, creditTotal, paid,
 *                        creditOutstandingAtSale, salesReturns, netSales,
 *                        bestSellers: [{ productId, name, grossSold, returned, netSold, total }] }
 *   /reports/profit  → { grossSales, discount, salesReturns, netRevenue, grossCogs,
 *                        returnedCogs, netCogs, grossProfit, expenses, net }
 *   /reports/purchases → { total, count, paid, creditOutstandingAtPurchase, supplierBalances }
 *   /reports/inventory → { productsCount, hiddenCount, totalQuantity, costValue, saleValue,
 *                          hiddenValue, lowCount, outCount, expectedProfit, ... }
 *   /cashbox/summary → { balance, todayIn, todayOut }
 *   /expenses/summary → { todayTotal, monthTotal }
 */

/** A finite number, or 0. */
export function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

const pick = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return n(obj[k]);
  }
  return 0;
};

/** Sales for the range, AFTER returns — what the shop actually kept. */
export const salesNet = (d) => pick(d, 'netSales', 'revenue', 'grossSales');
/** Sales before returns (invoice totals). */
export const salesGross = (d) => pick(d, 'grossSales', 'revenue', 'netSales');
export const salesReturns = (d) => pick(d, 'salesReturns');
export const salesCount = (d) => pick(d, 'invoiceCount', 'count');

/** Net profit for the range (after cost of goods AND expenses). */
export const profitNet = (d) => pick(d, 'net');
/** Revenue the profit report is based on (after returns). */
export const profitRevenue = (d) => pick(d, 'netRevenue', 'revenue', 'grossSales');

/** Net margin in % with one decimal (0 when there were no sales). */
export function marginPct(net, revenue) {
  return revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : 0;
}

export const inventoryLowTotal = (d) => pick(d, 'lowCount') + pick(d, 'outCount');
