import { SHOPS } from '../config/shops.js';
import { fetchFromShop } from './shopClient.service.js';

/**
 * One shop's row in the comparison — sales and profit for the given range.
 * Never rejects: a shop that fails either call contributes 0 for that
 * figure rather than breaking the whole comparison (same reasoning as
 * shopSummary.service.js — one bad shop shouldn't blank the other three).
 */
async function getShopCompare(shop, range) {
  const [salesResult, profitResult] = await Promise.allSettled([
    fetchFromShop(shop, '/reports/sales', { params: range }),
    fetchFromShop(shop, '/reports/profit', { params: range }),
  ]);

  return {
    shopId: shop.id,
    shopName: shop.name,
    sales: salesResult.status === 'fulfilled' ? salesResult.value.data.revenue : 0,
    // "net" (revenue - cost of goods - expenses) is the shop's own bottom
    // line for the period — see Shops 1-4's reports.service.js getProfitReport.
    profit: profitResult.status === 'fulfilled' ? profitResult.value.data.net : 0,
  };
}

/** Totals + a per-shop breakdown for the requested date range. */
export async function getCompareReport(range) {
  const byShop = await Promise.all(SHOPS.map((shop) => getShopCompare(shop, range)));

  const totalSales = byShop.reduce((sum, s) => sum + s.sales, 0);
  const totalProfit = byShop.reduce((sum, s) => sum + s.profit, 0);

  return { totalSales, totalProfit, byShop };
}
