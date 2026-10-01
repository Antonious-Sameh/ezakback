/**
 * REAL response shapes of Shops 1-4's /api/admin report & summary
 * endpoints, copied field-for-field from the shops' own code
 * (back/src/services/reports.service.js, cashbox.service.js,
 * expense.service.js — Shop 4, September 2026).
 *
 * Tests MUST use these instead of hand-invented shapes: the previous tests
 * used an older `{ revenue }` shape the shops no longer send, so they kept
 * passing while every sales figure in production showed 0.
 * If a shop's report shape ever changes, update THIS file first.
 */

export const salesReport = (over = {}) => ({
  grossSales: 5200,
  invoiceCount: 40,
  cashTotal: 3200,
  creditTotal: 2000,
  paid: 4100,
  creditOutstandingAtSale: 900,
  salesReturns: 200,
  netSales: 5000,
  bestSellers: [
    { productId: 'p1', name: 'فلتر زيت', grossSold: 25, returned: 2, netSold: 23, total: 2500 },
    { productId: 'p2', name: 'شمعة', grossSold: 18, returned: 0, netSold: 18, total: 720 },
  ],
  ...over,
});

export const profitReport = (over = {}) => ({
  grossSales: 5200,
  discount: 150,
  salesReturns: 200,
  netRevenue: 5000,
  grossCogs: 3100,
  returnedCogs: 100,
  netCogs: 3000,
  grossProfit: 2000,
  expenses: 500,
  net: 1500,
  ...over,
});

export const purchasesReport = (over = {}) => ({
  total: 8000, count: 12, paid: 6000, creditOutstandingAtPurchase: 2000, supplierBalances: [], ...over,
});

export const inventoryReport = (over = {}) => ({
  productsCount: 120, hiddenCount: 3, totalQuantity: 2400, costValue: 45000, saleValue: 60000,
  hiddenValue: 500, lowCount: 6, outCount: 2, expectedProfit: 15000, ...over,
});

export const customersReport = (over = {}) => ({
  count: 80, totalOutstanding: 12000, withBalanceCount: 15, totalSettlements: 0,
  topCustomers: [{ _id: 'c1', name: 'أحمد', total: 9000, paid: 7000, remaining: 2000 }],
  ...over,
});

export const suppliersReport = (over = {}) => ({
  count: 10, totalOutstanding: 7000, withBalanceCount: 3, totalSettlements: 0,
  topSuppliers: [{ _id: 's1', name: 'شركة الصفا', total: 30000, paid: 25000, remaining: 5000 }],
  ...over,
});

export const cashboxSummary = (over = {}) => ({ balance: 3500, todayIn: 1200, todayOut: 300, ...over });
export const expensesSummary = (over = {}) => ({ todayTotal: 150, monthTotal: 2400, ...over });

/** What the shops sent BEFORE sales returns existed — still accepted as a fallback. */
export const legacySalesReport = { revenue: 1000, invoiceCount: 5, cashTotal: 1000, creditTotal: 0, bestSellers: [{ name: 'x', qty: 3 }] };
