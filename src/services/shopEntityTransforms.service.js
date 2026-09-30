import { fetchFromShop } from './shopClient.service.js';

/**
 * The frontend (built separately, against its own mock-data contract) was
 * never shown Shops 1-4's actual schemas. Comparing the two side by side
 * turned up real, structural mismatches on every entity — not just naming
 * (`_id` vs `id`, which breaks React's list reconciliation and every
 * row-click entirely) but fields that don't exist in this business at all
 * (no per-sale cashier/discount/tax, no supplier contact person, no
 * expense "payment method"). This file is the single place that maps real
 * shop data onto the frontend's contract, so ResourceListPage and every
 * SECTION_CONFIGS renderDetail function keep working exactly as built.
 *
 * Where a field genuinely has no real-world source, it's left `undefined`
 * on purpose rather than invented — DetailGrid already renders `undefined`
 * as "—", so this never looks broken, just honestly blank.
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Query param translation ────────────────────────────────────────────
// Several of the frontend's filter param NAMES (and in one case, a VALUE)
// don't match what Shops 1-4's own /admin/* endpoints expect — found by
// comparing sectionConfigs.jsx's extraFilters against each shop route's
// zod schema directly. Left untranslated, these don't error — the shop's
// schema silently drops an unrecognized key — so the filter dropdown just
// quietly does nothing, which is worse than an error (looks like a bug in
// the data, not a mismatched param).
const QUERY_PARAM_ALIASES = {
  sales: { paymentType: 'paymentMethod' },
  // Purchases have the same cash/credit filter on the shop side.
  purchases: { paymentType: 'paymentMethod' },
  products: { status: 'filter' },
  expenses: { category: 'reason' },
};

// products' "متوفر" filter option is valued 'ok' on the frontend but
// 'available' on the shop's own filter enum — a value rename, not just a
// key rename.
const QUERY_VALUE_ALIASES = {
  products: { filter: { ok: 'available' } },
};

export function translateQuery(entity, query) {
  if (!query) return query;
  let translated = { ...query };

  const keyAliases = QUERY_PARAM_ALIASES[entity];
  if (keyAliases) {
    for (const [from, to] of Object.entries(keyAliases)) {
      if (translated[from] !== undefined) {
        translated[to] = translated[from];
        delete translated[from];
      }
    }
  }

  const valueAliases = QUERY_VALUE_ALIASES[entity];
  if (valueAliases) {
    for (const [key, valueMap] of Object.entries(valueAliases)) {
      if (translated[key] !== undefined && valueMap[translated[key]] !== undefined) {
        translated[key] = valueMap[translated[key]];
      }
    }
  }

  return translated;
}

// ── Products ─────────────────────────────────────────────────────────────
function productStatus(quantity, minQuantity) {
  if (quantity <= 0) return 'out';
  if (quantity <= minQuantity) return 'low';
  return 'ok';
}

function transformProduct(p) {
  return {
    id: p._id,
    name: p.name,
    sku: p.code,
    price: p.salePrice,
    cost: p.purchasePrice,
    stock: p.quantity,
    lowStockThreshold: p.minQuantity,
    status: productStatus(p.quantity, p.minQuantity),
    notes: p.notes,
    // Cloudinary URL uploaded from the shop's own inventory screen (or null).
    image: p.image || null,
    createdAt: p.createdAt,
    // Not in Shops 1-4's Product model — see back/README.md "Known gaps".
    category: null,
    unit: '',
    supplierName: undefined,
  };
}

// ── Customers / Suppliers ───────────────────────────────────────────────
function transformCustomer(c) {
  return {
    id: c._id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    totalOrders: c.totals?.count ?? 0,
    totalSpent: c.totals?.total ?? 0,
    totalPaid: c.totals?.paid ?? 0,
    balance: c.totals?.remaining ?? 0,
    lastPurchase: c.totals?.lastPurchase ?? null,
    createdAt: c.createdAt,
    email: undefined, // Customer model has no email field
  };
}

function transformSupplier(s) {
  return {
    id: s._id,
    name: s.name,
    phone: s.phone,
    address: s.address,
    totalPurchases: s.totals?.count ?? 0,
    totalAmount: s.totals?.total ?? 0,
    totalPaid: s.totals?.paid ?? 0,
    balance: s.totals?.remaining ?? 0,
    lastPurchase: s.totals?.lastPurchase ?? null,
    createdAt: s.createdAt,
    contactPerson: undefined, // Supplier model has no separate contact field
    email: undefined,
  };
}

// ── Sales / Purchases ────────────────────────────────────────────────────
// Sale/Purchase only store customerId/supplierId (no name) — resolving a
// human-readable name needs a lookup against the shop's customers/suppliers.
//
// A list page resolves names from one directory per shop + entity, built by
// paging through the shop's /customers (or /suppliers) at the shop's max
// page size, and cached for LOOKUP_TTL_MS. Before this cache, EVERY sales or
// purchases page (every page flip, every filter change) cost an extra call
// to the shop — which counts against the shop's /api/admin rate limit — and
// only the first 100 people were ever searched, so any later customer
// showed as the generic "عميل مسجّل". Capped at LOOKUP_MAX_PAGES so a
// pathological shop can't turn one page view into dozens of calls.
//
// The cache lives in this server instance's memory only (nothing persisted,
// nothing shared between shops). A name missing from a fresh directory
// falls back to a generic label rather than blocking the page.
export const LOOKUP_TTL_MS = 5 * 60 * 1000;
export const LOOKUP_PAGE_SIZE = 100; // the shops' own max page size
export const LOOKUP_MAX_PAGES = 10; // → up to 1,000 people per shop

const lookupCache = new Map(); // `${shopId}:${entity}` → { at, promise }

/** Test/ops hook: forget every cached directory. */
export function clearNameLookupCache() {
  lookupCache.clear();
}

async function fetchDirectory(shop, entity) {
  const map = new Map();
  for (let page = 1; page <= LOOKUP_MAX_PAGES; page += 1) {
    // Pages are fetched one after another on purpose (stop as soon as the last one arrives).
    const payload = await fetchFromShop(shop, `/${entity}`, { params: { page, limit: LOOKUP_PAGE_SIZE } });
    for (const person of payload?.data || []) map.set(String(person._id), person.name);
    const totalPages = payload?.pagination?.totalPages ?? 1;
    if (page >= totalPages) break;
  }
  return map;
}

async function getNameDirectory(shop, entity) {
  const key = `${shop.id}:${entity}`;
  const cached = lookupCache.get(key);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) return cached.promise;

  // Cache the in-flight promise so concurrent requests share one fetch.
  const promise = fetchDirectory(shop, entity).catch(() => {
    lookupCache.delete(key); // don't cache a failure — try again next time
    return new Map();
  });
  lookupCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function resolveOneName(shop, entity, id) {
  if (!id) return null;
  const directory = await getNameDirectory(shop, entity);
  const known = directory.get(String(id));
  if (known) return known;
  // Not in the (possibly stale) directory — e.g. created in the last few
  // minutes. One direct by-id call is exact and cheap for a single item.
  const payload = await fetchFromShop(shop, `/${entity}/${id}`).catch(() => null);
  return payload?.data?.name ?? null;
}

// Pure payment state, from the shop's own paid/remaining snapshot.
function paymentStatus(total, paid, remaining) {
  if (remaining === undefined || remaining === null) return null;
  if (remaining <= 0) return 'paid';
  if ((paid ?? 0) > 0) return 'partial';
  return total > 0 ? 'unpaid' : 'paid';
}

function transformSaleItem(it) {
  return {
    productName: it.name,
    code: it.code || undefined,
    qty: it.quantity,
    price: it.price,
    cost: it.cost,
    total: round2(it.price * it.quantity),
  };
}

function transformSale(sale, customerName) {
  return {
    id: sale._id,
    invoiceNo: sale.invoiceNumber,
    customerName: customerName || (sale.customerId ? 'عميل مسجّل' : 'عميل نقدي'),
    date: sale.date,
    // Sale stores subtotal (before discount), a flat invoice discount, the
    // final total, and what was paid / is still owed. Older invoices saved
    // before discounts existed have no subtotal → subtotal === total.
    subtotal: sale.subtotal ?? sale.total,
    discount: sale.discount ?? 0,
    total: sale.total,
    paid: sale.paid,
    remaining: sale.remaining,
    paymentStatus: paymentStatus(sale.total, sale.paid, sale.remaining),
    profit: sale.profit,
    paymentType: sale.paymentMethod,
    status: 'completed', // no draft/returned workflow exists on Sale
    items: (sale.items || []).map(transformSaleItem),
    createdAt: sale.createdAt,
    cashier: undefined, // single shared shop login — no per-sale attribution
    tax: undefined, // no tax concept in this business
  };
}

function transformPurchaseItem(it) {
  return {
    productName: it.name,
    code: it.code || undefined,
    qty: it.quantity,
    price: it.price,
    cost: it.price,
    total: round2(it.price * it.quantity),
  };
}

function transformPurchase(purchase, supplierName) {
  return {
    id: purchase._id,
    invoiceNo: purchase.purchaseNumber,
    supplierName: supplierName || 'مورد مسجّل',
    date: purchase.date,
    subtotal: purchase.subtotal ?? purchase.total,
    discount: purchase.discount ?? 0,
    total: purchase.total,
    paid: purchase.paid,
    remaining: purchase.remaining,
    paymentStatus: paymentStatus(purchase.total, purchase.paid, purchase.remaining),
    paymentType: purchase.paymentMethod,
    notes: purchase.notes || undefined,
    status: 'received', // no pending workflow exists on Purchase
    items: (purchase.items || []).map(transformPurchaseItem),
    createdAt: purchase.createdAt,
  };
}

// ── Expenses / Cashbox / Activity ───────────────────────────────────────
function transformExpense(e) {
  return {
    id: e._id,
    category: e.reason, // closest real equivalent — Expense has no separate category field
    amount: e.amount,
    date: e.date,
    description: e.notes || e.reason,
    createdAt: e.createdAt,
    method: undefined, // no payment-method concept on Expense
    beneficiary: undefined,
  };
}

function transformCashboxTx(t) {
  return {
    id: t._id,
    type: t.type,
    amount: t.amount,
    date: t.date,
    category: t.reason,
    description: t.notes || t.reason,
    notes: t.notes || undefined,
    // What created this movement: sale / purchase / expense / manual /
    // customer_payment / ... (the shop's CASHBOX_REF_TYPES).
    source: t.refType || 'manual',
    createdAt: t.createdAt,
    method: undefined, // no payment-method concept on a cashbox movement
  };
}

// Activity entries of type 'sale'/'purchase' carry refId = the invoice they
// were written for — EXCEPT return entries, which share the same type but
// point at the return document (see the shops' salesReturn/purchaseReturn
// services), which has no admin endpoint. The shops write those with a
// fixed description ("تم تسجيل مرتجع ..."), so that's how they're told apart.
const ACTIVITY_INVOICE_ENTITY = { sale: 'sales', purchase: 'purchases' };

function activityRef(a) {
  const entity = ACTIVITY_INVOICE_ENTITY[a.type];
  if (!entity || !a.refId) return null;
  if (typeof a.description === 'string' && a.description.includes('مرتجع')) return null;
  return { entity, id: String(a.refId) };
}

function transformActivity(a) {
  return {
    id: a._id,
    type: a.type,
    description: a.description,
    amount: a.amount || undefined, // 0 = "no amount" for non-money activities
    ref: activityRef(a),
    date: a.date,
    createdAt: a.createdAt,
    user: undefined, // single shared shop login — no per-action attribution
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────
const SIMPLE_TRANSFORMS = {
  products: transformProduct,
  customers: transformCustomer,
  suppliers: transformSupplier,
  expenses: transformExpense,
  cashbox: transformCashboxTx,
  activity: transformActivity,
};

/** Transforms an already-fetched list payload's `data` array in place (returns a new array). */
export async function transformList(shop, entity, rawItems) {
  if (entity === 'sales') {
    // Skip the lookup entirely when every row is a walk-in (cash) customer.
    const needsNames = rawItems.some((sale) => sale.customerId);
    const names = needsNames ? await getNameDirectory(shop, 'customers') : new Map();
    return rawItems.map((sale) =>
      transformSale(sale, sale.customerId ? names.get(String(sale.customerId)) : null),
    );
  }
  if (entity === 'purchases') {
    const names = rawItems.length ? await getNameDirectory(shop, 'suppliers') : new Map();
    return rawItems.map((purchase) => transformPurchase(purchase, names.get(String(purchase.supplierId))));
  }
  const transform = SIMPLE_TRANSFORMS[entity];
  return transform ? rawItems.map(transform) : rawItems;
}

/** Transforms an already-fetched single item. */
export async function transformItem(shop, entity, rawItem) {
  if (entity === 'sales') {
    const name = rawItem.customerId ? await resolveOneName(shop, 'customers', rawItem.customerId) : null;
    return transformSale(rawItem, name);
  }
  if (entity === 'purchases') {
    const name = await resolveOneName(shop, 'suppliers', rawItem.supplierId);
    return transformPurchase(rawItem, name);
  }
  const transform = SIMPLE_TRANSFORMS[entity];
  return transform ? transform(rawItem) : rawItem;
}
