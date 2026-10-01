import { fetchFromShop } from './shopClient.service.js';
import {
  n, salesNet, salesGross, salesReturns, salesCount, profitNet, profitRevenue, marginPct,
} from './shopReportFields.js';

/**
 * Each entry maps one report `type` to the shop's own /admin/reports/*
 * path and a `transform` that reshapes the shop's raw response into
 * exactly what ShopReportsPage.jsx (already built) reads. Field names
 * differ from the shop's own report shapes on purpose in a few places
 * (e.g. purchases' `total` -> `totalPurchases`) because that's what the
 * frontend contract already specifies — this layer is where that
 * reshaping happens, once, instead of on both ends.
 *
 * (Superseded by the `daily` report type below — kept for reference.)
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
    transform: (d) => {
      const totalSales = salesNet(d);
      const count = salesCount(d);
      return {
        totalSales, // after returns
        grossSales: salesGross(d), // invoice totals, before returns
        returns: salesReturns(d),
        count,
        avgInvoice: count > 0 ? Math.round((salesGross(d) / count) * 100) / 100 : 0,
        collected: n(d.paid),
        creditOutstanding: n(d.creditOutstandingAtSale),
        byDay: [], // see KNOWN GAP above
        topProducts: (d.bestSellers || []).map((b) => ({
          name: b.name,
          // Units sold net of returns (older shop builds only sent `qty`).
          qty: n(b.netSold ?? b.grossSold ?? b.qty),
          total: n(b.total),
        })),
        byPaymentType: { cash: n(d.cashTotal), credit: n(d.creditTotal) },
      };
    },
  },
  purchases: {
    path: '/reports/purchases',
    transform: (d) => ({
      totalPurchases: n(d.total),
      count: n(d.count),
      paid: n(d.paid),
      creditOutstanding: n(d.creditOutstandingAtPurchase),
    }),
  },
  profit: {
    path: '/reports/profit',
    transform: (d) => {
      const totalProfit = profitNet(d);
      const revenue = profitRevenue(d);
      return {
        totalProfit,
        margin: marginPct(totalProfit, revenue),
        // The shop's full profit & loss for the range, step by step:
        // grossSales − returns = revenue; revenue − cogs = grossProfit;
        // grossProfit − expenses = totalProfit.
        grossSales: n(d.grossSales),
        discount: n(d.discount),
        returns: n(d.salesReturns),
        revenue,
        cogs: n(d.netCogs ?? d.cogs),
        grossProfit: n(d.grossProfit ?? d.gross),
        expenses: n(d.expenses),
        byDay: [], // see KNOWN GAP above
      };
    },
  },
  inventory: {
    // Always a current snapshot — the shop's inventory report has no date
    // range of its own (stock levels aren't a historical figure), so `from`
    // /`to` are accepted on this endpoint for a consistent query shape but
    // simply have no effect here.
    path: '/reports/inventory',
    transform: (d) => ({
      totalStockValue: n(d.costValue),
      saleValue: n(d.saleValue),
      expectedProfit: n(d.expectedProfit),
      totalProducts: n(d.productsCount),
      totalQuantity: n(d.totalQuantity),
      lowCount: n(d.lowCount),
      outCount: n(d.outCount),
    }),
  },
  // Customers / suppliers: the shop ranks by ALL-TIME totals (these reports
  // take no date range) — the frontend labels them accordingly.
  customers: {
    path: '/reports/customers',
    transform: (d) => ({
      count: n(d.count),
      totalOutstanding: n(d.totalOutstanding),
      withBalanceCount: n(d.withBalanceCount),
      topCustomers: (d.topCustomers || []).map((c) => ({
        id: c._id, name: c.name, totalSpent: n(c.total), remaining: n(c.remaining),
      })),
    }),
  },
  // Day-by-day series (Shops 1-4's /reports/daily, added by shop patch 2).
  // `available: false` + no days when a shop hasn't been patched yet — the
  // trend charts then say so instead of showing an empty frame.
  daily: {
    path: '/reports/daily',
    optional: true,
    transform: (d) => ({
      available: true,
      days: (d?.days || []).map((x) => ({
        date: x.date,
        sales: n(x.sales),
        returns: n(x.returns),
        netSales: n(x.netSales),
        invoices: n(x.invoices),
        cogs: n(x.cogs),
        grossProfit: n(x.grossProfit),
        expenses: n(x.expenses),
        net: n(x.net),
        purchases: n(x.purchases),
      })),
    }),
    unavailable: () => ({ available: false, days: [] }),
  },
  suppliers: {
    path: '/reports/suppliers',
    transform: (d) => ({
      count: n(d.count),
      totalOutstanding: n(d.totalOutstanding),
      withBalanceCount: n(d.withBalanceCount),
      topSuppliers: (d.topSuppliers || []).map((s) => ({
        id: s._id, name: s.name, totalAmount: n(s.total), remaining: n(s.remaining),
      })),
    }),
  },
};

export const REPORT_TYPES = Object.keys(REPORT_HANDLERS);

export function isAllowedReportType(type) {
  return Object.prototype.hasOwnProperty.call(REPORT_HANDLERS, type);
}

/** GET .../reports/{type} on the shop, reshaped for the frontend. */
export async function getShopReport(shop, type, params) {
  const { path, transform, optional, unavailable } = REPORT_HANDLERS[type];
  try {
    const payload = await fetchFromShop(shop, path, { params });
    return transform(payload.data);
  } catch (err) {
    // An optional report the shop doesn't have yet (404 on its admin router).
    if (optional && err?.name === 'ShopClientError' && err.status === 404) return unavailable();
    throw err;
  }
}
