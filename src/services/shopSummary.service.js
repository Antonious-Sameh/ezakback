import { SHOPS } from '../config/shops.js';
import { fetchFromShop } from './shopClient.service.js';
import { todayRange, monthToDateRange } from '../utils/dateRanges.js';

/**
 * One shop's card data for the overview page. Never rejects: every call to
 * the shop is independent (Promise.allSettled), so a shop that's slow on
 * one report but fine on another still shows partial real data instead of
 * the whole card falling back to zeros.
 *
 * `status` reflects reachability, not data completeness — "online" means at
 * least one call to this shop succeeded; a shop that's fully unreachable
 * reports "offline" with every number defaulted to 0, which is what the
 * frontend's gray-dot state already expects.
 */
async function getShopSummary(shop) {
  const today = todayRange();
  const month = monthToDateRange();

  const [todayResult, monthResult, inventoryResult] = await Promise.allSettled([
    fetchFromShop(shop, '/reports/sales', { params: today }),
    fetchFromShop(shop, '/reports/sales', { params: month }),
    fetchFromShop(shop, '/reports/inventory'),
  ]);

  const anySucceeded = [todayResult, monthResult, inventoryResult].some((r) => r.status === 'fulfilled');

  return {
    id: shop.id,
    name: shop.name,
    // Branding (logo/colors) lives in each shop's own frontend as static
    // assets, never in its data (confirmed during the System 1 audit) — so
    // there is nothing to fetch here. Always null until/unless a shop ever
    // starts storing a logo URL in its own Settings.
    logoUrl: null,
    status: anySucceeded ? 'online' : 'offline',
    todaySales: todayResult.status === 'fulfilled' ? todayResult.value.data.revenue : 0,
    monthSales: monthResult.status === 'fulfilled' ? monthResult.value.data.revenue : 0,
    lowStockCount:
      inventoryResult.status === 'fulfilled'
        ? inventoryResult.value.data.lowCount + inventoryResult.value.data.outCount
        : 0,
  };
}

/** Summaries for every configured shop, fetched in parallel. */
export async function getAllShopsSummary() {
  return Promise.all(SHOPS.map(getShopSummary));
}
