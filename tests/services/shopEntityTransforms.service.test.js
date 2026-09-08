import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/shopClient.service.js', () => ({
  fetchFromShop: vi.fn(),
}));

const { fetchFromShop } = await import('../../src/services/shopClient.service.js');
const { translateQuery, transformList, transformItem } = await import(
  '../../src/services/shopEntityTransforms.service.js'
);

const shop = { id: 'shop1', name: 'المحل الأول', apiUrl: 'https://s1.example.com/api', adminKey: 'k1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('translateQuery', () => {
  it("renames sales' paymentType to paymentMethod", () => {
    expect(translateQuery('sales', { paymentType: 'cash', page: 1 })).toEqual({ paymentMethod: 'cash', page: 1 });
  });

  it("renames products' status to filter, and remaps value 'ok' -> 'available'", () => {
    expect(translateQuery('products', { status: 'ok' })).toEqual({ filter: 'available' });
    expect(translateQuery('products', { status: 'low' })).toEqual({ filter: 'low' });
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
});

describe('customers / suppliers transform', () => {
  it('flattens totals.* into totalOrders/totalSpent/balance for customers', async () => {
    const [result] = await transformList(shop, 'customers', [
      { _id: 'c1', name: 'أحمد', phone: '0100', address: 'القاهرة', totals: { total: 900, paid: 700, remaining: 200, count: 5 } },
    ]);
    expect(result).toMatchObject({ id: 'c1', name: 'أحمد', totalOrders: 5, totalSpent: 900, balance: 200 });
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
    total: 500,
    date: '2026-09-01',
    paymentMethod: 'credit',
    items: [{ name: 'فلتر', code: 'F1', price: 100, cost: 60, quantity: 2 }],
  };

  it('maps invoiceNumber/paymentMethod and computes item totals', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [{ _id: 'c1', name: 'أحمد' }] });

    const [result] = await transformList(shop, 'sales', [rawSale]);

    expect(result).toMatchObject({ id: 's1', invoiceNo: 'INV-1', paymentType: 'credit', total: 500, subtotal: 500, status: 'completed' });
    expect(result.items[0]).toEqual({ productName: 'فلتر', qty: 2, price: 100, cost: 60, total: 200 });
  });

  it('resolves the customer name via a single batched lookup call for a whole list', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [{ _id: 'c1', name: 'أحمد سالم' }] });

    const [result] = await transformList(shop, 'sales', [rawSale, { ...rawSale, _id: 's2', customerId: 'c1' }]);

    expect(fetchFromShop).toHaveBeenCalledTimes(1); // one lookup for the whole page, not per row
    expect(result.customerName).toBe('أحمد سالم');
  });

  it('labels a null customerId as "عميل نقدي"', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [] });
    const [result] = await transformList(shop, 'sales', [{ ...rawSale, customerId: null }]);
    expect(result.customerName).toBe('عميل نقدي');
  });

  it('falls back to a generic label when the customer is outside the lookup batch', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [] }); // customer not found in the batch
    const [result] = await transformList(shop, 'sales', [rawSale]);
    expect(result.customerName).toBe('عميل مسجّل');
  });

  it('detail (single item) resolves the name via a direct by-id fetch, not a batch', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: { name: 'أحمد سالم' } });

    const result = await transformItem(shop, 'sales', rawSale);

    expect(fetchFromShop).toHaveBeenCalledWith(shop, '/customers/c1');
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
    total: 900,
    date: '2026-09-01',
    items: [{ name: 'فلتر', code: 'F1', price: 40, quantity: 3 }],
  };

  it('maps purchaseNumber and uses item.price as both price and cost (purchase items have no separate cost field)', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [{ _id: 'sup1', name: 'مورد أ' }] });

    const [result] = await transformList(shop, 'purchases', [rawPurchase]);

    expect(result).toMatchObject({ id: 'pu1', invoiceNo: 'PUR-1', status: 'received', supplierName: 'مورد أ' });
    expect(result.items[0]).toEqual({ productName: 'فلتر', qty: 3, price: 40, cost: 40, total: 120 });
  });

  it('falls back to a generic supplier label when not found in the lookup batch', async () => {
    fetchFromShop.mockResolvedValue({ success: true, data: [] });
    const [result] = await transformList(shop, 'purchases', [rawPurchase]);
    expect(result.supplierName).toBe('مورد مسجّل');
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

  it('activity: maps _id -> id and leaves user honestly undefined', async () => {
    const [result] = await transformList(shop, 'activity', [
      { _id: 'a1', type: 'sale', description: 'تم إنشاء فاتورة', date: '2026-09-01' },
    ]);
    expect(result).toMatchObject({ id: 'a1', type: 'sale', description: 'تم إنشاء فاتورة' });
    expect(result.user).toBeUndefined();
  });
});
