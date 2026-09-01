import { describe, expect, it } from 'vitest'
import type { Order, Product } from './index'
import { aggregateOperationalReport, summarizeOperationalReport } from './index'

const products: Product[] = [
  { id: 'P-APPLE', name: '苹果', category: '生鲜', price: 10, cost: 5, stock: 10, sales: 0, source: 'platform', status: 'active', image: '', supplier: '湘西供应商', supplierId: 'S-XI', supplierName: '湘西供应商', tags: [], skus: [], farmIds: [] },
  { id: 'P-TEA', name: '茶叶', category: '茶叶', price: 20, cost: 8, stock: 10, sales: 0, source: 'platform', status: 'active', image: '', supplier: '安化供应商', supplierId: 'S-AN', supplierName: '安化供应商', tags: [], skus: [], farmIds: [] }
]

const order = (input: Partial<Order> & Pick<Order, 'id' | 'createdAt' | 'status' | 'customer' | 'amount'>): Order => ({
  id: input.id, productName: input.productName || '商品', quantity: input.quantity || 1, amount: input.amount, customer: input.customer,
  channel: input.channel || 'purchase', status: input.status, createdAt: input.createdAt, items: input.items
})

describe('aggregateOperationalReport', () => {
  it('filters valid statuses and includes both date boundaries', () => {
    const rows = aggregateOperationalReport([
      order({ id: 'O1', createdAt: '2026-08-01T00:01:00', status: 'pending', customer: '甲店', amount: 10 }),
      order({ id: 'O2', createdAt: '2026-08-31T23:59:00', status: 'delivered', customer: '甲店', amount: 20 }),
      order({ id: 'O3', createdAt: '2026-08-15T12:00:00', status: 'after-sale', customer: '甲店', amount: 99 })
    ], products, { from: '2026-08-01', to: '2026-08-31' }, 'day')
    expect(rows.reduce((sum, row) => sum + row.orderCount, 0)).toBe(2)
    expect(rows.reduce((sum, row) => sum + row.gmv, 0)).toBe(30)
  })

  it('allocates line GMV by supplier and category while de-duplicating order count', () => {
    const rows = aggregateOperationalReport([order({ id: 'O1', createdAt: '2026-08-10T10:00:00', status: 'paid-cancelled', customer: '甲店', amount: 999, items: [
      { productId: 'P-APPLE', skuId: 'A', name: '苹果', skuName: '箱', image: '', quantity: 2, price: 10 },
      { productId: 'P-TEA', skuId: 'T', name: '茶叶', skuName: '盒', image: '', quantity: 1, price: 20 }
    ] }), order({ id: 'O2', createdAt: '2026-08-11T10:00:00', status: 'shipping', customer: '乙店', amount: 10, items: [
      { productId: 'P-APPLE', skuId: 'A', name: '苹果', skuName: '箱', image: '', quantity: 1, price: 10 }
    ] })], products, { from: '2026-08-01', to: '2026-08-31' }, 'supplier')
    expect(rows).toEqual([{ key: 'S-XI', label: '湘西供应商', orderCount: 1, itemCount: 1, gmv: 10 }])
  })

  it('applies store, supplier and category filters together and falls back missing lines', () => {
    const rows = aggregateOperationalReport([
      order({ id: 'O1', createdAt: '2026-08-12T10:00:00', status: 'pending', customer: '甲店', amount: 8, quantity: 3 }),
      order({ id: 'O2', createdAt: '2026-08-12T10:00:00', status: 'pending', customer: '乙店', amount: 10, items: [{ productId: 'P-TEA', skuId: 'T', name: '茶叶', skuName: '盒', image: '', quantity: 1, price: 10 }] })
    ], products, { from: '2026-08-12', to: '2026-08-12', store: '甲店', supplierId: 'missing', category: '茶叶' }, 'category')
    expect(rows).toEqual([])
    const fallback = aggregateOperationalReport([order({ id: 'O1', createdAt: '2026-08-12T10:00:00', status: 'pending', customer: '甲店', amount: 8, quantity: 3 })], products, { from: '2026-08-12', to: '2026-08-12' }, 'category')
    expect(fallback).toEqual([{ key: 'uncategorized', label: '未分类', orderCount: 1, itemCount: 3, gmv: 8 }])
  })

  it('counts an order once in the summary across supplier rows', () => {
    const result = summarizeOperationalReport([
      order({ id: 'O1', createdAt: '2026-08-12T10:00:00', status: 'shipping', customer: '甲店', amount: 30, quantity: 3, items: [
        { productId: 'P-APPLE', skuId: 'A', name: '苹果', skuName: '箱', image: '', quantity: 2, price: 10 },
        { productId: 'P-TEA', skuId: 'T', name: '茶叶', skuName: '盒', image: '', quantity: 1, price: 10 }
      ] })
    ], products, { from: '2026-08-01', to: '2026-08-31' })
    expect(result).toEqual({ orderCount: 1, itemCount: 3, gmv: 30 })
  })

  it('uses explicit store identity and rejects invalid date ranges', () => {
    const explicit = order({ id: 'O-STORE', createdAt: '2026-08-12T10:00:00', status: 'delivered', customer: '收货人', amount: 5 })
    explicit.storeId = 'F001'
    explicit.storeName = '石板溪农家乐'
    expect(aggregateOperationalReport([explicit], products, { from: '2026-08-12', to: '2026-08-12', store: 'F001' }, 'store')).toMatchObject([{ key: 'F001', label: '石板溪农家乐' }])
    expect(aggregateOperationalReport([explicit], products, { from: '2026-08-13', to: '2026-08-12' }, 'day')).toEqual([])
  })

  it('matches historical store labels with the 门店 suffix', () => {
    const historical = order({ id: 'O-HISTORY', createdAt: '2026-08-12T10:00:00', status: 'pending', customer: '石板溪农家乐·门店', amount: 12 })
    expect(aggregateOperationalReport([historical], products, { from: '2026-08-12', to: '2026-08-12', store: '石板溪农家乐' }, 'store')).toHaveLength(1)
  })
})
