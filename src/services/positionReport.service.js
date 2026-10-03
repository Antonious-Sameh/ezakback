import { SHOPS } from '../config/shops.js';
import { fetchFromShop } from './shopClient.service.js';
import { n } from './shopReportFields.js';

/**
 * "معانا كام" — each shop's financial position RIGHT NOW (not range-bound):
 *   customersOwe   what customers still owe the shop      (receivables)
 *   suppliersOwed  what the shop still owes its suppliers (payables)
 *   cash           the cashbox balance
 *   stockCost      the stock valued at cost price
 *   stockSale      the same stock valued at sale price
 * plus the totals across the four shops.
 *
 * Every figure comes from a report the shops already have (customers,
 * suppliers, inventory, cashbox summary). Each call may fail on its own:
 * that figure is then `null` (unknown — NOT zero), the totals skip it and
 * say `complete: false`, and the other three shops are unaffected.
 */

const settled = (p) => p.then((r) => r.data, () => null);
const round2 = (v) => Math.round(v * 100) / 100;
const figure = (data, key) => (data ? n(data[key]) : null);

async function getShopPosition(shop) {
  const [customers, suppliers, inventory, cashbox] = await Promise.all([
    settled(fetchFromShop(shop, '/reports/customers', { params: { limit: 1 } })),
    settled(fetchFromShop(shop, '/reports/suppliers', { params: { limit: 1 } })),
    settled(fetchFromShop(shop, '/reports/inventory')),
    settled(fetchFromShop(shop, '/cashbox/summary')),
  ]);

  return {
    shopId: shop.id,
    shopName: shop.name,
    available: Boolean(customers || suppliers || inventory || cashbox),
    customersOwe: figure(customers, 'totalOutstanding'),
    customersOweCount: figure(customers, 'withBalanceCount'),
    suppliersOwed: figure(suppliers, 'totalOutstanding'),
    cash: figure(cashbox, 'balance'),
    stockCost: figure(inventory, 'costValue'),
    stockSale: figure(inventory, 'saleValue'),
    productsCount: figure(inventory, 'productsCount'),
    lowCount: inventory ? n(inventory.lowCount) + n(inventory.outCount) : null,
  };
}

const sumOf = (rows, key) => round2(rows.reduce((acc, r) => acc + (r[key] ?? 0), 0));

export function buildTotals(byShop) {
  const totals = {
    customersOwe: sumOf(byShop, 'customersOwe'),
    suppliersOwed: sumOf(byShop, 'suppliersOwed'),
    cash: sumOf(byShop, 'cash'),
    stockCost: sumOf(byShop, 'stockCost'),
    stockSale: sumOf(byShop, 'stockSale'),
  };
  return {
    ...totals,
    // An estimate of "what we have in total": drawer cash + stock (at COST,
    // the conservative figure) + what customers owe − what we owe suppliers.
    net: round2(totals.cash + totals.stockCost + totals.customersOwe - totals.suppliersOwed),
    // false = at least one figure is missing (shop down), so the totals are partial.
    complete: byShop.every((r) => ['customersOwe', 'suppliersOwed', 'cash', 'stockCost'].every((k) => r[k] !== null)),
  };
}

export async function getPositionReport() {
  const byShop = await Promise.all(SHOPS.map(getShopPosition));
  return { generatedAt: new Date().toISOString(), totals: buildTotals(byShop), byShop };
}
