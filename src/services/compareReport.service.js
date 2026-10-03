import { SHOPS } from '../config/shops.js';
import { fetchFromShop } from './shopClient.service.js';
import { salesNet, profitNet, profitRevenue, salesCount, marginPct, n } from './shopReportFields.js';
import { previousRange, pctChange } from '../utils/dateRanges.js';

/**
 * The owner's home-page analytics: all four shops over a date range,
 * compared with the previous period of the same length.
 *
 * Per shop (in parallel, each call allowed to fail on its own):
 *   sales + profit for the range, sales + profit for the previous range,
 *   and the day-by-day series. (What customers owe / stock value / cash are
 *   NOT range-bound and live in positionReport.service.js.)
 * A shop that doesn't answer is flagged `available: false` and counts as 0 —
 * one bad shop never blanks the other three.
 */

const settled = (p) => p.then((r) => r, () => null);
const round2 = (v) => Math.round(v * 100) / 100;

async function getShopCompare(shop, range, prev) {
  const [sales, profit, prevSales, prevProfit, daily] = await Promise.all([
    settled(fetchFromShop(shop, '/reports/sales', { params: range })),
    settled(fetchFromShop(shop, '/reports/profit', { params: range })),
    settled(fetchFromShop(shop, '/reports/sales', { params: prev })),
    settled(fetchFromShop(shop, '/reports/profit', { params: prev })),
    // Needs shop patch 2 — absent on an older shop build, which is fine.
    settled(fetchFromShop(shop, '/reports/daily', { params: range })),
  ]);

  const salesValue = sales ? salesNet(sales.data) : 0;
  const profitValue = profit ? profitNet(profit.data) : 0;
  const prevSalesValue = prevSales ? salesNet(prevSales.data) : 0;
  const prevProfitValue = prevProfit ? profitNet(prevProfit.data) : 0;
  const hasPrevious = Boolean(prevSales && prevProfit);

  return {
    shopId: shop.id,
    shopName: shop.name,
    // Sales after returns — the same basis as the profit figure next to it.
    sales: salesValue,
    // "net" (revenue - cost of goods - expenses) is the shop's own bottom line.
    profit: profitValue,
    invoices: sales ? salesCount(sales.data) : 0,
    margin: profit ? marginPct(profitValue, profitRevenue(profit.data)) : 0,
    // false = this shop didn't answer; its zeros are "unknown", not "no sales".
    available: Boolean(sales && profit),
    previous: hasPrevious ? { sales: prevSalesValue, profit: prevProfitValue } : null,
    change: hasPrevious
      ? { sales: pctChange(salesValue, prevSalesValue), profit: pctChange(profitValue, prevProfitValue) }
      : { sales: null, profit: null },
    _daily: daily?.data?.days || null,
  };
}

/** Sums the shops' day series by date (only shops that have the daily report). */
function combineDaily(shops) {
  const withDaily = shops.filter((s) => Array.isArray(s._daily));
  const byDate = new Map();
  for (const s of withDaily) {
    for (const d of s._daily) {
      const cur = byDate.get(d.date) || { date: d.date, sales: 0, profit: 0 };
      cur.sales = round2(cur.sales + n(d.netSales));
      cur.profit = round2(cur.profit + n(d.net));
      byDate.set(d.date, cur);
    }
  }
  return {
    available: withDaily.length > 0,
    // true = some shops aren't in the series (not updated / not answering).
    partial: withDaily.length > 0 && withDaily.length < shops.length,
    shopsIncluded: withDaily.length,
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function getCompareReport(range) {
  const prev = previousRange(range);
  const shops = await Promise.all(SHOPS.map((shop) => getShopCompare(shop, range, prev)));

  const sum = (pick) => round2(shops.reduce((acc, s) => acc + pick(s), 0));
  const totalSales = sum((s) => s.sales);
  const totalProfit = sum((s) => s.profit);
  const totalInvoices = shops.reduce((acc, s) => acc + s.invoices, 0);
  const prevSales = sum((s) => s.previous?.sales || 0);
  const prevProfit = sum((s) => s.previous?.profit || 0);
  const anyPrevious = shops.some((s) => s.previous);

  // Rank by sales among the shops that answered (1 = best).
  const ranked = shops.filter((s) => s.available).sort((a, b) => b.sales - a.sales);
  const rankOf = new Map(ranked.map((s, i) => [s.shopId, i + 1]));

  const byShop = shops.map(({ _daily, ...s }) => ({
    ...s,
    // This shop's share of all four shops' sales, in %.
    share: totalSales > 0 ? Math.round((s.sales / totalSales) * 1000) / 10 : 0,
    rank: rankOf.get(s.shopId) ?? null,
  }));

  return {
    range,
    previousRange: prev,
    totalSales,
    totalProfit,
    totalInvoices,
    margin: marginPct(totalProfit, totalSales),
    previous: anyPrevious ? { sales: prevSales, profit: prevProfit } : null,
    change: anyPrevious
      ? { sales: pctChange(totalSales, prevSales), profit: pctChange(totalProfit, prevProfit) }
      : { sales: null, profit: null },
    shopsAvailable: ranked.length,
    byShop,
    daily: combineDaily(shops),
  };
}
