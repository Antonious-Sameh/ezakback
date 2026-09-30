import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { translateQuery, transformList, transformItem, clearNameLookupCache, LOOKUP_TTL_MS } = await import(
  '../../src/services/shopEntityTransforms.service.js'
);

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
  clearNameLookupCache();
});

describe('translateQuery', () => {
  it("renames sales' paymentType to paymentMethod", () => {
    expect(translateQuery('sales', { paymentType: 'cash', page: 1 })).toEqual({ paymentMethod: 'cash', page: 1 });
  });

  it("renames products' status to filter, and remaps value 'ok' -> 'available'", () => {
    expect(translateQuery('products', { status: 'ok' })).toEqual({ filter: 'available' });
    expect(translateQuery('products', { status: 'low' })).toEqual({ filter: 'low' });
  });

  it("renames purchases' paymentType to paymentMethod too", () => {
    expect(translateQuery('purchases', { paymentType: 'credit' })).toEqual({ paymentMethod: 'credit' });
  });

  it("renames expenses' category to reason", () => {
    expect(translateQuery('expenses', { category: 'إيجار' })).toEqual({ reason: 'إيجار' });
  });

  it('leaves other entities and unrelated params untouched', () => {
    expect(translateQuery('customers', { search: 'x' })).toEqual({ search: 'x' });
    expect(translateQuery('sales', { search: 'x' })).toEqual({ search: 'x' });
  });

  it('handles an undefined/empty query gracefully', () => {
    expect(translateQuery('sales', undefined)).toBeUndefined();
  });
});

describe('products transform', () => {
  it('maps _id -> id and every renamed field', async () => {
    const raw = [
      { _id: 'p1', name: 'فلتر زيت', code: 'F-1', quantity: 10, minQuantity: 3, salePrice: 50, purchasePrice: 30, notes: 'ملاحظة' },
    ];
    const [result] = await transformList(shop, 'products', raw);

    expect(result).toMatchObject({
      id: 'p1', name: 'فلتر زيت', sku: 'F-1', stock: 10, lowStockThreshold: 3, price: 50, cost: 30, notes: 'ملاحظة',
    });
  });

  it('computes status: ok / low / out from quantity vs minQuantity', async () => {
    const raw = [
      { _id: '1', name: 'A', code: 'A', quantity: 10, minQuantity: 3, salePrice: 1, purchasePrice: 1 },
      { _id: '2', name: 'B', code: 'B', quantity: 2, minQuantity: 3, salePrice: 1, purchasePrice: 1 },
      { _id: '3', name: 'C', code: 'C', quantity: 0, minQuantity: 3, salePrice: 1, purchasePrice: 1 },
    ];
    const result = await transformList(shop, 'products', raw);
    expect(result.map((p) => p.status)).toEqual(['ok', 'low', 'out']);
  });

  it('leaves category/unit honestly blank rather than inventing data', async () => {
    const [result] = await transformList(shop, 'products', [
      { _id: '1', name: 'A', code: 'A', quantity: 1, minQuantity: 0, salePrice: 1, purchasePrice: 1 },
    ]);
    expect(result.category).toBeNull();
    expect(result.unit).toBe('');
  });

  it('exposes the product image, or null when there is none', async () => {
    const [withImage, without] = await transformList(shop, 'products', [
      { _id: '1', name: 'A', code: 'A', quantity: 1, minQuantity: 0, salePrice: 1, purchasePrice: 1, image: 'https://res.cloudinary.com/x.jpg' },
      { _id: '2', name: 'B', code: 'B', quantity: 1, minQuantity: 0, salePrice: 1, purchasePrice: 1, image: '' },
    ]);
    expect(withImage.image).toBe('https://res.cloudinary.com/x.jpg');
    expect(without.image).toBeNull();
  });
});

describe('customers / suppliers transform', () => {
  it('flattens totals.* into totalOrders/totalSpent/balance for customers', async () => {
    const [result] = await transformList(shop, 'customers', [
      { _id: 'c1', name: 'أحمد', phone: '0100', address: 'القاهرة', totals: { total: 900, paid: 700, remaining: 200, count: 5 } },
    ]);
    expect(result).toMatchObject({ id: 'c1', name: 'أحمد', totalOrders: 5, totalSpent: 900, totalPaid: 700, balance: 200 });
  });

  it('flattens totals.* into totalPurchases/totalAmount/balance for suppliers', async () => {
    const [result] = await transformList(shop, 'suppliers', [
      { _id: 's1', name: 'مورد أ', phone: '0111', totals: { total: 3000, paid: 3000, remaining: 0, count: 8 } },
    ]);
    expect(result).toMatchObject({ id: 's1', name: 'مورد أ', totalPurchases: 8, totalAmount: 3000, balance: 0 });
  });

  it('defaults totals to 0 when a person has no transactions on file', async () => {
    const [result] = await transformList(shop, 'customers', [{ _id: 'c2', name: 'سارة' }]);
    expect(result).toMatchObject({ totalOrders: 0, totalSpent: 0, balance: 0 });
  });
});

describe('sales transform', () => {
  const rawSale = {
    _id: 's1',
    invoiceNumber: 'INV-1',
    customerId: 'c1',
    subtotal: 520,
    discount: 20,
    total: 500,
    paid: 300,
    remaining: 200,
    profit: 80,
    date: '2026-09-01',
    paymentMethod: 'credit',
    items: [{ name: 'فلتر', code: 'F1', price: 100, cost: 60, quantity: 2 }],
  };
  const directory = (people, totalPages = 1) => ({ success: true, data: people, pagination: { page: 1, totalPages } });

  it('maps invoiceNumber/paymentMethod and computes item totals (keeping the product code)', async () => {
    fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد' }]));

    const [result] = await transformList(shop, 'sales', [rawSale]);

    expect(result).toMatchObject({ id: 's1', invoiceNo: 'INV-1', paymentType: 'credit', total: 500, status: 'completed' });
    expect(result.items[0]).toEqual({ productName: 'فلتر', code: 'F1', qty: 2, price: 100, cost: 60, total: 200 });
  });

  it('keeps the real subtotal, discount, paid, remaining and profit (they used to be dropped)', async () => {
    fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد' }]));

    const [result] = await transformList(shop, 'sales', [rawSale]);

    expect(result).toMatchObject({ subtotal: 520, discount: 20, total: 500, paid: 300, remaining: 200, profit: 80 });
  });

  it('derives paymentStatus from paid/remaining', async () => {
    const results = await transformList(shop, 'sales', [
      { ...rawSale, customerId: null, paid: 500, remaining: 0 },
      { ...rawSale, customerId: null, paid: 100, remaining: 400 },
      { ...rawSale, customerId: null, paid: 0, remaining: 500 },
    ]);
    expect(results.map((r) => r.paymentStatus)).toEqual(['paid', 'partial', 'unpaid']);
  });

  it('treats an old invoice without subtotal/discount as subtotal === total, discount 0', async () => {
    const { subtotal, discount, ...old } = rawSale; // eslint-disable-line no-unused-vars
    const [result] = await transformList(shop, 'sales', [{ ...old, customerId: null }]);
    expect(result).toMatchObject({ subtotal: 500, discount: 0 });
  });

  it('resolves the customer name via one directory call for a whole list', async () => {
    fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد سالم' }]));

    const [result] = await transformList(shop, 'sales', [rawSale, { ...rawSale, _id: 's2', customerId: 'c1' }]);

    expect(fetchFromShop).toHaveBeenCalledTimes(1); // one lookup for the whole page, not per row
    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/customers', { params: { page: 1, limit: 100 } });
    expect(result.customerName).toBe('أحمد سالم');
  });

  it('reuses the cached directory on the next page instead of calling the shop again', async () => {
    fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد' }]));

    await transformList(shop, 'sales', [rawSale]);
    await transformList(shop, 'sales', [rawSale]);

    expect(fetchFromShop).toHaveBeenCalledTimes(1);
  });

  it('refreshes the directory after the cache TTL expires', async () => {
    vi.useFakeTimers();
    try {
      fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد' }]));
      await transformList(shop, 'sales', [rawSale]);
      vi.advanceTimersByTime(LOOKUP_TTL_MS + 1);
      await transformList(shop, 'sales', [rawSale]);
      expect(fetchFromShop).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps separate directories per shop', async () => {
    const other = { ...shop, id: 'shop2' };
    fetchFromShop.mockResolvedValue(directory([{ _id: 'c1', name: 'أحمد' }]));

    await transformList(shop, 'sales', [rawSale]);
    await transformList(other, 'sales', [rawSale]);

    expect(fetchFromShop).toHaveBeenCalledTimes(2);
  });

  it('pages through customers beyond the first 100', async () => {
    fetchFromShop
      .mockResolvedValueOnce({ success: true, data: [{ _id: 'c0', name: 'أول' }], pagination: { page: 1, totalPages: 2 } })
      .mockResolvedValueOnce({ success: true, data: [{ _id: 'c1', name: 'في الصفحة التانية' }], pagination: { page: 2, totalPages: 2 } });

    const [result] = await transformList(shop, 'sales', [rawSale]);

    expect(fetchFromShop).toHaveBeenCalledTimes(2);
    expect(fetchFromShop.mock.calls[1][2]).toEqual({ params: { page: 2, limit: 100 } });
    expect(result.customerName).toBe('في الصفحة التانية');
  });

  it('skips the lookup entirely when every row is a walk-in customer', async () => {
    const [result] = await transformList(shop, 'sales', [{ ...rawSale, customerId: null }]);
    expect(fetchFromShop).not.toHaveBeenCalled();
    expect(result.customerName).toBe('عميل نقدي');
  });

  it('falls back to a generic label when the customer is not in the directory', async () => {
    fetchFromShop.mockResolvedValue(directory([]));
    const [result] = await transformList(shop, 'sales', [rawSale]);
    expect(result.customerName).toBe('عميل مسجّل');
  });

  it('does not cache a failed directory fetch (tries again next time)', async () => {
    fetchFromShop.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(directory([{ _id: 'c1', name: 'أحمد' }]));

    const [first] = await transformList(shop, 'sales', [rawSale]);
    const [second] = await transformList(shop, 'sales', [rawSale]);

    expect(first.customerName).toBe('عميل مسجّل');
    expect(second.customerName).toBe('أحمد');
  });

  it('detail uses the directory, and falls back to a direct by-id fetch for a brand-new customer', async () => {
    fetchFromShop
      .mockResolvedValueOnce(directory([])) // directory doesn't know c1 yet
      .mockResolvedValueOnce({ success: true, data: { name: 'أحمد سالم' } });

    const result = await transformItem(shop, 'sales', rawSale);

    expect(fetchFromShop).toHaveBeenLastCalledWith(shop, '/customers/c1');
    expect(result.customerName).toBe('أحمد سالم');
  });

  it('detail skips the lookup entirely for a null customerId', async () => {
    const result = await transformItem(shop, 'sales', { ...rawSale, customerId: null });
    expect(fetchFromShop).not.toHaveBeenCalled();
    expect(result.customerName).toBe('عميل نقدي');
  });
});

describe('purchases transform', () => {
  const rawPurchase = {
    _id: 'pu1',
    purchaseNumber: 'PUR-1',
    supplierId: 'sup1',
    subtotal: 950,
    discount: 50,
    total: 900,
    paid: 900,
    remaining: 0,
    paymentMethod: 'cash',
    notes: 'دفعة أكتوبر',
    date: '2026-09-01',
    items: [{ name: 'فلتر', code: 'F1', price: 40, quantity: 3 }],
  };

  it('maps purchaseNumber and uses item.price as both price and cost (purchase items have no separate cost field)', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [{ _id: 'sup1', name: 'مورد أ' }], pagination: { totalPages: 1 } });

    const [result] = await transformList(shop, 'purchases', [rawPurchase]);

    expect(result).toMatchObject({ id: 'pu1', invoiceNo: 'PUR-1', status: 'received', supplierName: 'مورد أ' });
    expect(result.items[0]).toEqual({ productName: 'فلتر', code: 'F1', qty: 3, price: 40, cost: 40, total: 120 });
  });

  it('keeps payment method, subtotal, discount, paid, remaining and notes', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [], pagination: { totalPages: 1 } });

    const [result] = await transformList(shop, 'purchases', [rawPurchase]);

    expect(result).toMatchObject({
      paymentType: 'cash', subtotal: 950, discount: 50, total: 900, paid: 900, remaining: 0, paymentStatus: 'paid', notes: 'دفعة أكتوبر',
    });
  });

  it('falls back to a generic supplier label when not found in the directory', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [], pagination: { totalPages: 1 } });
    const [result] = await transformList(shop, 'purchases', [rawPurchase]);
    expect(result.supplierName).toBe('مورد مسجّل');
  });

  it('does not call the shop for an empty page', async () => {
    const result = await transformList(shop, 'purchases', []);
    expect(result).toEqual([]);
    expect(fetchFromShop).not.toHaveBeenCalled();
  });
});

describe('expenses / cashbox / activity transforms', () => {
  it('expenses: maps reason -> category, prefers notes for description', async () => {
    const [result] = await transformList(shop, 'expenses', [
      { _id: 'e1', reason: 'إيجار', amount: 500, date: '2026-09-01', notes: 'إيجار شهر سبتمبر' },
    ]);
    expect(result).toMatchObject({ id: 'e1', category: 'إيجار', description: 'إيجار شهر سبتمبر' });
  });

  it('expenses: falls back to reason as description when notes is empty', async () => {
    const [result] = await transformList(shop, 'expenses', [{ _id: 'e1', reason: 'كهرباء', amount: 200, date: '2026-09-01', notes: '' }]);
    expect(result.description).toBe('كهرباء');
  });

  it('cashbox: preserves type (in/out) and maps reason -> category', async () => {
    const [result] = await transformList(shop, 'cashbox', [
      { _id: 't1', type: 'in', amount: 300, date: '2026-09-01', reason: 'إيداع نقدي' },
    ]);
    expect(result).toMatchObject({ id: 't1', type: 'in', category: 'إيداع نقدي' });
  });

  it('cashbox: exposes what created the movement (refType -> source), defaulting to manual', async () => {
    const [fromSale, manual] = await transformList(shop, 'cashbox', [
      { _id: 't1', type: 'in', amount: 300, reason: 'فاتورة 5', refType: 'sale' },
      { _id: 't2', type: 'out', amount: 50, reason: 'سحب' },
    ]);
    expect(fromSale.source).toBe('sale');
    expect(manual.source).toBe('manual');
  });

  it('activity: links a sale/purchase entry to its invoice, with its amount', async () => {
    const [sale, purchase] = await transformList(shop, 'activity', [
      { _id: 'a1', type: 'sale', description: 'تم إنشاء فاتورة بيع رقم 12', amount: 250, refId: 'inv12' },
      { _id: 'a2', type: 'purchase', description: 'تم تسجيل عملية شراء رقم 3', amount: 900, refId: 'pur3' },
    ]);
    expect(sale).toMatchObject({ amount: 250, ref: { entity: 'sales', id: 'inv12' } });
    expect(purchase.ref).toEqual({ entity: 'purchases', id: 'pur3' });
  });

  it('activity: never links a return entry (its refId points at a return, not an invoice)', async () => {
    const [result] = await transformList(shop, 'activity', [
      { _id: 'a1', type: 'sale', description: 'تم تسجيل مرتجع بقيمة 50 على الفاتورة رقم 12', amount: 50, refId: 'ret1' },
    ]);
    expect(result.ref).toBeNull();
    expect(result.amount).toBe(50);
  });

  it('activity: no link for non-invoice types, and no amount when it is 0', async () => {
    const [result] = await transformList(shop, 'activity', [
      { _id: 'a1', type: 'product', description: 'تمت إضافة منتج', amount: 0, refId: 'p1' },
    ]);
    expect(result.ref).toBeNull();
    expect(result.amount).toBeUndefined();
  });

  it('activity: maps _id -> id and leaves user honestly undefined', async () => {
    const [result] = await transformList(shop, 'activity', [
      { _id: 'a1', type: 'sale', description: 'تم إنشاء فاتورة', date: '2026-09-01' },
    ]);
    expect(result).toMatchObject({ id: 'a1', type: 'sale', description: 'تم إنشاء فاتورة' });
    expect(result.user).toBeUndefined();
  });
});
