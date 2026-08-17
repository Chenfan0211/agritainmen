import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { cloneSeed } from '@agritainment/shared'
import { deriveStoreMetrics, storeCatalog } from '../services/repository'
import { useStoreStore } from './store'

describe('store ordering store interactions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('adds single-SKU products directly and requires SKU selection for multi-SKU', () => {
    const store = useStoreStore()
    store.$patch({ products: cloneSeed(storeCatalog), cart: [], checkoutError: '' })
    const tea = store.products.find((item) => item.id === 'P003')!
    const bacon = store.products.find((item) => item.id === 'P001')!
    expect(store.addToCart(tea)).toBe('added')
    expect(store.addToCart(bacon)).toBe('sku-required')
    expect(store.cartCount).toBe(1)
    expect(store.cartTotal).toBe(tea.skus[0].cost)
    expect(store.cart[0].retail).toBe(tea.price)
  })

  it('blocks increments at the stock limit', () => {
    const store = useStoreStore()
    const seeded = cloneSeed(storeCatalog).filter((item) => item.id === 'P003')
    seeded[0].skus[0].stock = 1
    seeded[0].stock = 1
    store.$patch({ products: seeded, cart: [], checkoutError: '' })
    expect(store.addToCart(seeded[0])).toBe('added')
    expect(store.addToCart(seeded[0])).toBe('out-of-stock')
    expect(store.checkoutError).toContain('库存不足')
  })

  it('submits a multi-item order, deducts stock and computes savings', () => {
    const store = useStoreStore()
    const seeded = cloneSeed(storeCatalog)
    const tea = seeded.find((item) => item.id === 'P003')!
    const box = seeded.find((item) => item.id === 'PP03')!
    const teaStockBefore = tea.skus[0].stock
    store.$patch({ products: seeded, cart: [], orders: [], checkoutError: '' })
    store.addToCart(tea)
    store.addToCart(box)
    store.changeCart(box.id, box.skus[0].id, 1)
    expect(store.cartCount).toBe(3)
    expect(store.submitOrder('请周三前送达')).toBe(true)
    expect(store.orders[0]).toMatchObject({ status: 'submitted', amount: 87.2, saved: 43.2, itemCount: 3, remark: '请周三前送达' })
    expect(store.orders[0].items).toHaveLength(2)
    expect(store.cart).toHaveLength(0)
    expect(tea.skus[0].stock).toBe(teaStockBefore - 1)
    expect(box.skus[0].stock).toBe(20000 - 2)
    expect(store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('进货单为空')
  })

  it('advances order status step by step and confirms receipt only when delivering', () => {
    const store = useStoreStore()
    store.$patch({ orders: [{
      id: 'SO-TEST', amount: 10, saved: 0, itemCount: 1,
      items: [], status: 'submitted', createdAt: '2026-08-15 10:00', logistics: []
    }] })
    expect(store.confirmReceipt('SO-TEST')).toBe(false)
    expect(store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('accepted')
    expect(store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('shipped')
    expect(store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('delivering')
    expect(store.confirmReceipt('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('received')
    expect(store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('completed')
    expect(store.advanceOrder('SO-TEST')).toBe(false)
    expect(store.orders[0].logistics).toHaveLength(5)
  })

  it('re-adds order items into the cart on repeat', () => {
    const store = useStoreStore()
    store.$patch({ products: cloneSeed(storeCatalog), cart: [], orders: [], checkoutError: '' })
    const tea = store.products.find((item) => item.id === 'P003')!
    store.addToCart(tea)
    store.submitOrder()
    const orderId = store.orders[0].id
    expect(store.repeatOrder(orderId)).toBe(true)
    expect(store.cartCount).toBe(1)
    expect(store.cart[0].productId).toBe('P003')
  })

  it('computes month metrics from current month orders', () => {
    const store = useStoreStore()
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    store.$patch({ orders: [
      { id: 'A', amount: 100, saved: 20, itemCount: 1, items: [], status: 'delivering', createdAt: `${month}-10 09:00`, logistics: [] },
      { id: 'B', amount: 50, saved: 10, itemCount: 1, items: [], status: 'received', createdAt: `${month}-01 09:00`, logistics: [] },
      { id: 'C', amount: 200, saved: 30, itemCount: 1, items: [], status: 'completed', createdAt: '2025-01-01 09:00', logistics: [] }
    ] })
    expect(store.orderMetrics.monthAmount).toBe(150)
    expect(store.orderMetrics.orderCount).toBe(3)
    expect(store.orderMetrics.pendingReceipt).toBe(1)
    expect(store.orderMetrics.savedAmount).toBe(60)
  })
})

describe('store auth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('logs in with demo phone and password', () => {
    const store = useStoreStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.loginWithPassword('13800000000', 'wrong')).toBe(false)
    expect(store.loginWithPassword('12800000000', '123456')).toBe(false)
    expect(store.loginWithPassword('13800000000', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ isLoggedIn: true, phone: '13800000000' })
  })

  it('logs in with demo phone and sms code, then logs out', () => {
    const store = useStoreStore()
    expect(store.loginWithCode('13800000000', '000000')).toBe(false)
    expect(store.loginWithCode('13800000000', '123456')).toBe(true)
    expect(store.auth.isLoggedIn).toBe(true)
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, phone: '' })
  })

describe('deriveStoreMetrics', () => {
  it('derives in-sale count, savings and hot orders from the real catalog', () => {
    const m = deriveStoreMetrics(storeCatalog)
    expect(m.activeCount).toBe(storeCatalog.filter((p) => p.status === 'active').length)
    expect(m.savedTotal).toBe(Math.round(storeCatalog.reduce((s, p) => s + (p.price - p.cost) * p.sales, 0) * 100) / 100)
    expect(m.hotOrders).toHaveLength(3)
    expect(m.hotOrders[0].times).toBe(Math.max(...storeCatalog.map((p) => p.sales)))
    expect(m.hotOrders[0].amount).toBe(Math.round(m.hotOrders[0].times * storeCatalog.find((p) => p.id === m.hotOrders[0].id)!.price))
  })
})
})