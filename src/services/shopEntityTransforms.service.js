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
    balance: c.totals?.remaining ?? 0,
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
    balance: s.totals?.remaining ?? 0,
    createdAt: s.createdAt,
    contactPerson: undefined, // Supplier model has no separate contact field
    email: undefined,
  };
}

// ── Sales / Purchases ────────────────────────────────────────────────────
// Sale/Purchase only store customerId/supplierId (no name) — resolving a
// human-readable name needs a lookup. For a LIST, one batched fetch of up
// to 100 customers/suppliers covers realistic shop sizes in a single extra
// call (not one call per row). For a single DETAIL item, a direct by-id
// fetch is exact and just as cheap. A name outside that batch, or a lookup
// that fails, falls back to a generic label rather than blocking the page.
async function buildNameLookup(shop, entity) {
  const map = new Map();
  const payload = await fetchFromShop(shop, `/${entity}`, { params: { limit: 100 } }).catch(() => null);
  for (const person of payload?.data || []) map.set(person._id, person.name);
  return map;
}

async function resolveOneName(shop, entity, id) {
  if (!id) return null;
  const payload = await fetchFromShop(shop, `/${entity}/${id}`).catch(() => null);
  return payload?.data?.name ?? null;
}

function transformSaleItem(it) {
  return { productName: it.name, qty: it.quantity, price: it.price, cost: it.cost, total: round2(it.price * it.quantity) };
}

function transformSale(sale, customerName) {
  return {
    id: sale._id,
    invoiceNo: sale.invoiceNumber,
    customerName: customerName || (sale.customerId ? 'عميل مسجّل' : 'عميل نقدي'),
    date: sale.date,
    total: sale.total,
    subtotal: sale.total, // no separate subtotal/discount/tax concept in this system
    paymentType: sale.paymentMethod,
    status: 'completed', // no draft/returned workflow exists on Sale
    items: (sale.items || []).map(transformSaleItem),
    createdAt: sale.createdAt,
    cashier: undefined, // single shared shop login — no per-sale attribution
    discount: undefined,
    tax: undefined,
  };
}

function transformPurchaseItem(it) {
  return { productName: it.name, qty: it.quantity, price: it.price, cost: it.price, total: round2(it.price * it.quantity) };
}

function transformPurchase(purchase, supplierName) {
  return {
    id: purchase._id,
    invoiceNo: purchase.purchaseNumber,
    supplierName: supplierName || 'مورد مسجّل',
    date: purchase.date,
    total: purchase.total,
    subtotal: purchase.total,
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
    createdAt: t.createdAt,
    method: undefined,
  };
}

function transformActivity(a) {
  return {
    id: a._id,
    type: a.type,
    description: a.description,
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
    const names = await buildNameLookup(shop, 'customers');
    return rawItems.map((sale) => transformSale(sale, sale.customerId ? names.get(sale.customerId) : null));
  }
  if (entity === 'purchases') {
    const names = await buildNameLookup(shop, 'suppliers');
    return rawItems.map((purchase) => transformPurchase(purchase, names.get(purchase.supplierId)));
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
