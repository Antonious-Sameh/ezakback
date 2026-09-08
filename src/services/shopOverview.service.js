import { fetchFromShop } from './shopClient.service.js';
import { todayRange, monthToDateRange } from '../utils/dateRanges.js';

/**
 * Maps a shop's raw product document to the shape the overview page's
 * "تنبيهات المخزون" list expects.
 *
 * NOTE: Shops 1-4's Product model (see src/models/Product.js there) has no
 * `category` or `unit` field — only name, code, quantity, minQuantity,
 * price fields. `category` is returned as null and `unit` as an empty
 * string rather than inventing data that doesn't exist in the shop. This is
 * a known, deliberate gap versus what the frontend's mock data assumed;
 * cosmetically the unit badge will show just the number with no unit label
 * until either the frontend drops that assumption or a shop's Product model
 * grows a real unit field.
 */
function mapLowStockProduct(product, status) {
  return {
    id: product._id,
    name: product.name,
    category: null,
    sku: product.code,
    status,
    stock: product.quantity,
    unit: '',
  };
}

/** Up to 10 items: out-of-stock first (more urgent), then low-stock. */
async function getLowStockItems(shop) {
  const [outResult, lowResult] = await Promise.allSettled([
    fetchFromShop(shop, '/products', { params: { filter: 'out', limit: 10 } }),
    fetchFromShop(shop, '/products', { params: { filter: 'low', limit: 10 } }),
  ]);

  const outItems = outResult.status === 'fulfilled' ? outResult.value.data : [];
  const lowItems = lowResult.status === 'fulfilled' ? lowResult.value.data : [];

  return [
    ...outItems.map((p) => mapLowStockProduct(p, 'out')),
    ...lowItems.map((p) => mapLowStockProduct(p, 'low')),
  ].slice(0, 10);
}

/**
 * Every call here is independent (each `.catch(() => null)`), so a single
 * failing report degrades that one stat to 0 instead of failing the whole
 * overview page — consistent with shopSummary.service.js's approach for the
 * home page cards.
 */
export async function getShopOverview(shop) {
  const today = todayRange();
  const month = monthToDateRange();

  const [todaySalesR, monthSalesR, todayProfitR, inventoryR, cashboxR, customersR, lowStockItems] =
    await Promise.all([
      fetchFromShop(shop, '/reports/sales', { params: today }).catch(() => null),
      fetchFromShop(shop, '/reports/sales', { params: month }).catch(() => null),
      fetchFromShop(shop, '/reports/profit', { params: today }).catch(() => null),
      fetchFromShop(shop, '/reports/inventory').catch(() => null),
      fetchFromShop(shop, '/cashbox/summary').catch(() => null),
      fetchFromShop(shop, '/reports/customers', { params: { limit: 1 } }).catch(() => null),
      getLowStockItems(shop),
    ]);

  return {
    todaySales: todaySalesR?.data.revenue ?? 0,
    todayOrders: todaySalesR?.data.invoiceCount ?? 0,
    monthSales: monthSalesR?.data.revenue ?? 0,
    todayProfit: todayProfitR?.data.net ?? 0,
    cashboxBalance: cashboxR?.data.balance ?? 0,
    productCount: inventoryR?.data.productsCount ?? 0,
    lowStockCount: inventoryR ? inventoryR.data.lowCount + inventoryR.data.outCount : 0,
    customerCount: customersR?.data.count ?? 0,
    lowStockItems,
  };
}
