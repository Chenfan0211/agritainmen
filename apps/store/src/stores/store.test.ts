import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CatalogState } from '@agritainment/shared'
import { applyCatalogStockOperation, catalogProductToProduct, cloneSeed, enqueuePlatformRecovery, markCatalogTransactionStockApplied, prepareCatalogTransaction, readCatalogState, readPendingCatalogTransactions, readPlatformAfterSales, readPlatformEntities, readPlatformOrders, readPlatformRecoveryQueue, retryPlatformRecoveryTask, storeAccounts, suppliers, updateCatalogStock, upsertPlatformEntity, upsertStoreCatalogSelection, writeCatalogState, writePlatformOrder, writePlatformStoreAccounts } from '@agritainment/shared'
import { promoterRepository } from '../../../promoter/src/services/repository'
import { deriveStoreMetrics, storeCatalog } from '../services/repository'
import { useStoreStore } from './store'
import * as shared from '@agritainment/shared'

const catalogProduct = (input: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'channel'>): CatalogProduct => ({
  id: input.id,
  name: input.name || input.id,
  category: input.category || '测试分类',
  supplierId: input.supplierId || 'S-TEST',
  supplierName: input.supplierName || '测试供应商',
  source: 'platform',
  status: input.status || 'active',
  image: '/static/images/field.webp',
  images: [],
  tags: [],
  productType: input.productType || 'goods',
  expressDelivery: input.expressDelivery ?? input.channel !== 'store',
  channel: input.channel,
  farmIds: [],
  promoterCommissionRate: 5,
  storeCommissionRate: 3,
  skus: input.skus || [{ id: `${input.id}-SKU`, name: '默认规格', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15 }]
})

const writeCatalog = (products: CatalogProduct[], revision = 0) => {
  const state: CatalogState = { schemaVersion: 1, revision, products }
  expect(writeCatalogState(state)).toBe(true)
  return state
}

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}


describe('store ordering store interactions', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.unstubAllGlobals() })

  it('renders MOQ states and blocks unavailable procurement checkout in the store page', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    expect(source).toContain('minimumOrderQuantity(')
    expect(source).toContain('库存不足起订量')
    expect(source).toContain(':disabled="!canStartOrder(selectedSku)"')
    expect(source).toContain(':class="{ shortage: item.unavailable }"')
    expect(source).toContain(':disabled="store.cartHasUnavailable"')
  })

  it('keeps procurement snapshots unchanged when catalog revision changes after the lock request', async () => {
    writeCatalog([catalogProduct({ id: 'LOCK-CONFLICT', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    const beforeMemory = { cart: cloneSeed(store.cart), orders: cloneSeed(store.orders), products: cloneSeed(store.products) }
    const changed = cloneSeed(readCatalogState()!)
    changed.revision += 1
    changed.products[0].skus[0].stock = 6
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writeCatalogState(changed)).toBe(true)
      }
      return callback()
    } } })

    expect(await store.submitOrder()).toBe(false)

    expect(readCatalogState()).toEqual(changed)
    expect(readPlatformOrders()).toEqual(null)
    expect(store.cart).toEqual(beforeMemory.cart)
    expect(store.orders).toEqual(beforeMemory.orders)
    expect(store.products).toEqual(beforeMemory.products)
  })

  it('rolls back procurement storage and Pinia when platform order persistence fails', async () => {
    writeCatalog([catalogProduct({ id: 'ORDER-WRITE-FAIL', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    const before = { catalog: cloneSeed(readCatalogState()), orders: cloneSeed(readPlatformOrders()), cart: cloneSeed(store.cart), memoryOrders: cloneSeed(store.orders), products: cloneSeed(store.products) }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-orders') throw new Error('platform order unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.submitOrder()).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformOrders()).toEqual(before.orders)
    expect(store.cart).toEqual(before.cart)
    expect(store.orders).toEqual(before.memoryOrders)
    expect(store.products).toEqual(before.products)
  })

  it('initializes ordering products from active store and all catalog channels', async () => {
    writeCatalog([
      catalogProduct({ id: 'STORE', channel: 'store' }),
      catalogProduct({ id: 'ALL', channel: 'all' }),
      catalogProduct({ id: 'LIVE', channel: 'live' }),
      catalogProduct({ id: 'OFFLINE', channel: 'store', status: 'offline' })
    ], 4)
    const store = useStoreStore()

    await store.initialize()

    expect(store.products.map((item) => item.id)).toEqual(['STORE', 'ALL'])
    expect(store.catalogRevision).toBe(4)
  })

  it('submits orders through the shared catalog stock transaction', async () => {
    writeCatalog([catalogProduct({ id: 'ORDERING', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])

    expect(await store.submitOrder()).toBe(true)
    expect(readCatalogState()).toMatchObject({ revision: 1, products: [{ id: 'ORDERING', skus: [{ id: 'ORDERING-SKU', stock: 7 }] }] })
    expect(store.catalogRevision).toBe(1)
  })

  it('keeps the current store order after a forced shared-state refresh', async () => {
    writeCatalog([catalogProduct({ id: 'REFRESHED-ORDER', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id

    await store.initialize(true)

    expect(store.orders[0].id).toBe(orderId)
    expect(store.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: orderId, farmId: 'F001', status: 'submitted' })
    ]))
  })

  it('blocks store procurement when the supplier is paused', async () => {
    writeCatalog([catalogProduct({ id: 'SUPPLIER-GUARD', channel: 'store', supplierId: 'S002', supplierName: suppliers[1].name })])
    const store = useStoreStore()
    await store.initialize()
    store.addToCart(store.products[0])
    expect(upsertPlatformEntity('suppliers', 'S002', { ...suppliers[1], status: 'paused', cooperationPauseReason: '暂停接单' })).toBe(true)

    expect(await store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('湘西腊味合作社已暂停接单，请选择其他商品')
    expect(store.cart).toHaveLength(1)
  })

  it('does not replay a legacy catalog ordering journal during initialize', async () => {
    writeCatalog([catalogProduct({ id: 'ORDER-RECOVER', channel: 'store' })])
    const order = { id: 'SO-RECOVER', amount: 20, saved: 25, itemCount: 1, status: 'submitted' as const, createdAt: '2026-08-24 12:00', logistics: [], items: [{ productId: 'ORDER-RECOVER', skuId: 'ORDER-RECOVER-SKU', name: '恢复进货单', skuName: '默认规格', image: '', quantity: 1, price: 20 }] }
    const inventoryChanges = [{ productId: 'ORDER-RECOVER', skuId: 'ORDER-RECOVER-SKU', quantity: -1 }]
    expect(prepareCatalogTransaction({ id: 'SO-RECOVER:reserve', channel: 'store', action: 'reserve', inventoryChanges, payload: { order } })).toBe(true)
    expect(applyCatalogStockOperation('SO-RECOVER:reserve', inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied('SO-RECOVER:reserve')).toBe(true)
    const store = useStoreStore()
    store.orders = []

    await store.initialize()

    expect(store.orders.some((item) => item.id === order.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPendingCatalogTransactions('store')).toEqual([expect.objectContaining({ id: 'SO-RECOVER:reserve', status: 'stock-applied' })])
  })

  it('does not replay a legacy catalog return journal during initialize', async () => {
    writeCatalog([catalogProduct({ id: 'RETURN-RECOVER', channel: 'store' })])
    const order = {
      id: 'SO-RETURN-RECOVER', amount: 20, saved: 25, itemCount: 1, status: 'received' as const,
      createdAt: '2026-08-24 12:00', logistics: [], inventoryReleased: true, afterSaleType: 'return' as const,
      items: [{ productId: 'RETURN-RECOVER', skuId: 'RETURN-RECOVER-SKU', name: '恢复退货单', skuName: '默认规格', image: '', quantity: 1, price: 20 }]
    }
    const afterSale = {
      id: 'AS-RETURN-RECOVER', orderId: order.id, productName: order.items[0].name, applicant: '石板溪农庄',
      type: 'return' as const, amount: order.amount, status: 'refunded' as const,
      history: [{ time: '2026-08-24 12:30', action: '退货确认完成，库存已回补', operator: '石板溪农庄' }]
    }
    localStorage.setItem('agritainment-platform-after-sales', JSON.stringify({ [afterSale.id]: { ...afterSale, status: 'return-pending' } }))
    const inventoryChanges = [{ productId: 'RETURN-RECOVER', skuId: 'RETURN-RECOVER-SKU', quantity: 1 }]
    expect(prepareCatalogTransaction({
      id: `${order.id}:return-release`, channel: 'store', action: 'release', inventoryChanges, payload: { order, afterSale }
    })).toBe(true)
    expect(applyCatalogStockOperation(`${order.id}:return-release`, inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied(`${order.id}:return-release`)).toBe(true)
    const store = useStoreStore()
    store.orders = []

    await store.initialize()

    expect(store.orders.some((item) => item.id === order.id)).toBe(false)
    expect(readPlatformAfterSales()?.[afterSale.id]).toMatchObject({ status: 'return-pending' })
    expect(readPendingCatalogTransactions('store')).toEqual([expect.objectContaining({ id: `${order.id}:return-release`, status: 'stock-applied' })])
  })

  it('refreshes catalog products and asks for retry after a revision conflict', async () => {
    writeCatalog([catalogProduct({ id: 'CONFLICT', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()
    expect(updateCatalogStock([{ productId: 'CONFLICT', skuId: 'CONFLICT-SKU', quantity: -1 }], 0)?.revision).toBe(1)

    expect(store.setSkuStock('CONFLICT', 'CONFLICT-SKU', 4)).toBe(false)

    expect(store.catalogRevision).toBe(1)
    expect(store.products[0].skus[0].stock).toBe(7)
    expect(store.checkoutError).toContain('重试')
  })

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

  it('uses the SKU MOQ for first add and snapshots it on the procurement item', async () => {
    const product = catalogProduct({ id: 'MOQ-FIRST', channel: 'store', skus: [{ id: 'MOQ-FIRST-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()

    expect(store.addToCart(store.products[0])).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3, unavailable: false })
    expect(store.changeCart(product.id, product.skus[0].id, -1)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 3, unavailable: true })
    expect(store.changeCart(product.id, product.skus[0].id, 1)).toBe(true)
    expect(await store.submitOrder()).toBe(true)
    expect(store.orders[0].items[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3 })
  })

  it('keeps a below-MOQ cart line and rejects procurement after catalog MOQ rises', async () => {
    const product = catalogProduct({ id: 'MOQ-RAISED', channel: 'store', skus: [{ id: 'MOQ-RAISED-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()
    expect(store.addToCart(store.products[0])).toBe('added')
    const latest = cloneSeed(readCatalogState()!)
    latest.revision += 1
    latest.products[0].skus[0].minimumOrderQuantity = 4
    expect(writeCatalogState(latest)).toBe(true)

    expect(await store.submitOrder()).toBe(false)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 4, unavailable: true })
    expect(store.checkoutError).toContain('起订 4 件')
  })

  it('rejects first add when stock is below the SKU MOQ', async () => {
    const product = catalogProduct({ id: 'MOQ-STOCK', channel: 'store', skus: [{ id: 'MOQ-STOCK-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 45, cost: 20, stock: 2, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    writeCatalog([product], 1)
    const store = useStoreStore()
    await store.initialize()

    expect(store.addToCart(store.products[0])).toBe('out-of-stock')
    expect(store.cart).toHaveLength(0)
    expect(store.checkoutError).toContain('库存不足起订量')
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

  it('submits a multi-item order, deducts stock and computes savings', async () => {
    const store = useStoreStore()
    const catalog = [
      catalogProduct({ id: 'TEA', channel: 'store' }),
      catalogProduct({ id: 'BOX', channel: 'store', skus: [{ id: 'BOX-SKU', name: '整箱', image: '/static/images/field.webp', retailPrice: 30, cost: 10, stock: 20, level1Amount: 10, level2Amount: 10 }] })
    ]
    writeCatalog(catalog)
    const seeded = catalog.map(catalogProductToProduct)
    const tea = seeded[0]
    const box = seeded[1]
    const teaStockBefore = tea.skus[0].stock
    store.$patch({ products: seeded, catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(tea)
    store.addToCart(box)
    store.changeCart(box.id, box.skus[0].id, 1)
    expect(store.cartCount).toBe(3)
    expect(await store.submitOrder('请周三前送达')).toBe(true)
    expect(store.orders[0]).toMatchObject({ status: 'submitted', amount: 40, saved: 65, itemCount: 3, remark: '请周三前送达' })
    expect(store.orders[0].items).toHaveLength(2)
    expect(store.cart).toHaveLength(0)
    expect(store.products.find((item) => item.id === 'TEA')?.skus[0].stock).toBe(teaStockBefore - 1)
    expect(store.products.find((item) => item.id === 'BOX')?.skus[0].stock).toBe(18)
    expect(await store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('进货单为空')
  })

  it('advances order status step by step and confirms receipt only when delivering', async () => {
    writeCatalog([])
    const store = useStoreStore()
    const order = {
      id: 'SO-TEST', amount: 10, saved: 0, itemCount: 1,
      items: [], status: 'submitted' as const, createdAt: '2026-08-15 10:00', logistics: []
    }
    store.$patch({ orders: [cloneSeed(order)] })
    expect(writePlatformOrder({ id: order.id, productName: '进货商品', quantity: 1, amount: 10, customer: '石板溪农庄·门店', channel: 'purchase', status: 'pending', createdAt: order.createdAt })).toBe(true)
    expect(await store.confirmReceipt('SO-TEST')).toBe(false)
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('accepted')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('shipped')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('delivering')
    expect(await store.confirmReceipt('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('received')
    expect(await store.advanceOrder('SO-TEST')).toBe(true)
    expect(store.orders[0].status).toBe('completed')
    expect(await store.advanceOrder('SO-TEST')).toBe(false)
    expect(store.orders[0].logistics).toHaveLength(5)
  })

  it('does not commit local order status when shared fulfillment write fails', async () => {
    const store = useStoreStore()
    store.$patch({ orders: [{ id: 'SO-FAIL', amount: 10, saved: 0, itemCount: 1, items: [], status: 'submitted', createdAt: '2026-08-15 10:00', logistics: [] }] })
    const write = vi.spyOn(shared, 'writePlatformOrder').mockReturnValue(false)
    expect(await store.advanceOrder('SO-FAIL')).toBe(false)
    expect(store.orders[0].status).toBe('submitted')
    expect(store.orders[0].logistics).toHaveLength(0)
    write.mockRestore()
  })

  it('re-adds order items into the cart on repeat', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'REPEAT', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    const tea = store.products[0]
    store.addToCart(tea)
    await store.submitOrder()
    const orderId = store.orders[0].id
    expect(store.repeatOrder(orderId)).toBe(true)
    expect(store.cartCount).toBe(1)
    expect(store.cart[0].productId).toBe('REPEAT')
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

describe('promoter live package candidates', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('only returns listed package selections for their selected stores', async () => {
    writeCatalog([
      catalogProduct({ id: 'PACKAGE', channel: 'store', productType: 'package', expressDelivery: false }),
      catalogProduct({ id: 'UNLISTED', channel: 'store', productType: 'package', expressDelivery: false }),
      catalogProduct({ id: 'GOODS', channel: 'all', productType: 'goods', expressDelivery: true })
    ])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'PACKAGE', listed: true, retailPrice: 66 })).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'UNLISTED', listed: false, retailPrice: 77 })).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'GOODS', listed: true, retailPrice: 88 })).toBe(true)

    const dashboard = await promoterRepository.loadDashboard()

    expect(dashboard.products).toEqual([
      expect.objectContaining({ id: 'PACKAGE', farmIds: ['F001'], price: 66, productType: 'package' })
    ])
  })
})

describe('store auth', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('logs in only with an enabled platform store account and records its principal', () => {
    const store = useStoreStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.loginWithPassword('13800000001', 'wrong')).toBe(false)
    expect(store.loginWithPassword('13800000000', '123456')).toBe(false)
    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    expect(store.auth).toMatchObject({
      isLoggedIn: true,
      phone: '13800000001',
      accountId: 'SA001',
      farmId: 'F001',
      tenantId: 'F001',
      role: 'owner',
      principal: { actorType: 'store', actorId: 'SA001', tenantId: 'F001', status: 'active' }
    })
    expect(store.info.name).toContain('石板溪')
  })

  it('rejects disabled accounts for password and sms login', () => {
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA003' ? { ...item, enabled: false } : item))
    const store = useStoreStore()
    expect(store.loginWithPassword('13800000003', '123456')).toBe(false)
    expect(store.loginWithCode('13800000003', '123456')).toBe(false)
  })

  it('resolves sms login to the same enabled account and clears the principal on logout', () => {
    const store = useStoreStore()
    expect(store.loginWithCode('13800000003', '000000')).toBe(false)
    expect(store.loginWithCode('13800000000', '123456')).toBe(false)
    expect(store.loginWithCode('13800000003', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ accountId: 'SA003', farmId: 'F002', role: 'owner' })
    expect(store.info.name).toContain('云上人家')
    store.logout()
    expect(store.auth).toMatchObject({ isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null })
  })

  it('isolates cart and orders when switching between F001 and F002 accounts', async () => {
    writeCatalog([catalogProduct({ id: 'TENANT-P', channel: 'store' })])
    const store = useStoreStore()
    await store.initialize()

    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    store.addToCart(store.products[0])
    store.orders = [{ id: 'F001-ORDER', farmId: 'F001', amount: 20, saved: 0, itemCount: 1, items: [], status: 'submitted', createdAt: '2026-08-24 10:00', logistics: [] }]

    expect(store.loginWithPassword('13800000003', '123456')).toBe(true)
    expect(store.cart).toEqual([])
    expect(store.orders).toEqual([])
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const f002Order = store.orders[0]
    expect(f002Order.farmId).toBe('F002')
    expect(readPlatformOrders()?.[f002Order.id]).toMatchObject({ customer: expect.stringContaining('云上人家'), supplierOrderLink: { source: 'store', customerUserId: 'F002' } })

    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    expect(store.cart).toHaveLength(1)
    expect(store.orders.map((item) => item.id)).toEqual(['F001-ORDER'])
  })

  it('invalidates the current session when the shared store account is disabled', async () => {
    const store = useStoreStore()
    expect(store.loginWithPassword('13800000001', '123456')).toBe(true)
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA001' ? { ...item, enabled: false } : item))

    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(false)
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
  it('cancels pending orders and initiates store after-sale', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'CANCEL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    const tea = store.products[0]
    store.addToCart(tea)
    expect(await store.submitOrder('')).toBe(true)
    const orderId = store.orders[0].id
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPlatformOrders()?.[orderId]?.status).toBe('pending')
    expect(await store.cancelOrder(orderId)).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(store.orders[0].status).toBe('cancelled')
    expect(readPlatformOrders()?.[orderId]?.status).toBe('unpaid-cancelled')
    expect(store.initiateAfterSale(orderId)).toBe(false)
    store.orders[0].status = 'received'
    expect(store.initiateAfterSale(orderId)).toBe(true)
    const works = readPlatformAfterSales() || {}
    expect(Object.values(works)[0]?.status).toBe('processing')
  })
  it('updates shared catalog stock while keeping the existing local listing control', () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'STOCK', channel: 'store' })
    writeCatalog([catalog])
    const tea = catalogProductToProduct(catalog)
    store.$patch({ products: [tea], catalogRevision: 0, cart: [], orders: [], checkoutError: '', overrides: {} })
    expect(store.setSkuStock(tea.id, tea.skus[0].id, 3)).toBe(true)
    const product = store.products.find((item) => item.id === 'STOCK')!
    expect(product.skus[0].stock).toBe(3)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(3)
    expect(store.toggleListed(tea.id)).toBe(true)
    expect(store.isListed(tea.id)).toBe(false)
    expect(readPlatformEntities()?.products?.[tea.id]).toBeUndefined()
  })
  it('does not restore stock for a refund and restores it once when a return completes', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const refundOrder = store.orders[0]
    refundOrder.status = 'received'
    expect(store.initiateAfterSale(refundOrder.id, 'refund')).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)

    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const returnOrder = store.orders[0]
    returnOrder.status = 'received'
    expect(store.initiateAfterSale(returnOrder.id, 'return')).toBe(true)
    expect(await store.completeReturn(returnOrder.id)).toBe(true)
    expect(await store.completeReturn(returnOrder.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
  })

  it.each([
    ['agritainment-platform-after-sales', 1, '售后单'],
    ['agritainment-platform-orders', 1, '平台履约订单']
  ])('rolls back every return snapshot when %s write fails', async (failedKey, failAt) => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: `RETURN-ROLLBACK-${failedKey}`, channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const before = {
      catalog: cloneSeed(readCatalogState()),
      afterSales: cloneSeed(readPlatformAfterSales()),
      platformOrders: cloneSeed(readPlatformOrders()),
      memoryOrders: cloneSeed(store.orders),
      memoryProducts: cloneSeed(store.products),
      revision: store.catalogRevision
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let writeCount = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === failedKey && ++writeCount === failAt) {
        throw new Error(`${failedKey} write failed`)
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readPlatformOrders()).toEqual(before.platformOrders)
    expect(store.orders).toEqual(before.memoryOrders)
    expect(store.products).toEqual(before.memoryProducts)
    expect(store.catalogRevision).toBe(before.revision)
  })

  it('rolls back the locked return transaction when its first catalog write fails', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-FIRST-STEP-FAIL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const before = { catalog: cloneSeed(readCatalogState()), afterSales: cloneSeed(readPlatformAfterSales()), orders: cloneSeed(readPlatformOrders()) }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === 'agritainment-platform-catalog') {
        failed = true
        throw new Error('catalog first step failed')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    setActivePinia(createPinia())
    const reloaded = useStoreStore()
    await reloaded.initialize(true)

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readPlatformOrders()).toEqual(before.orders)
    expect(reloaded.orders.find((item) => item.id === order.id)?.inventoryReleased).toBeFalsy()
  })

  it('rejects a third-state return recovery without writing business snapshots', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-COMMIT-RECOVERY', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    expect(await store.completeReturn(order.id)).toBe(true)
    const operationId = `${order.id}:return-release`
    const thirdState = cloneSeed(readCatalogState()!)
    thirdState.products[0].name = '外部第三状态'
    expect(writeCatalogState(thirdState)).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test-third-state', reason: 'test', handlerKey: 'store-return-completion-v1' })).toBe(true)
    const recovery = readPlatformRecoveryQueue().find((task) => task.operationId === operationId)!
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let businessWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (['agritainment-platform-catalog', 'agritainment-platform-after-sales', 'agritainment-platform-orders'].includes(key)) businessWrites += 1
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await retryPlatformRecoveryTask(recovery.id, 'STORE-TEST')).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(businessWrites).toBe(0)
    expect(readCatalogState()).toEqual(thirdState)
    expect(readPlatformRecoveryQueue().find((task) => task.id === recovery.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('surfaces a fatal return recovery failure without changing Pinia snapshots', async () => {
    const store = useStoreStore()
    const catalog = catalogProduct({ id: 'RETURN-FATAL', channel: 'store' })
    writeCatalog([catalog])
    store.$patch({ products: [catalogProductToProduct(catalog)], catalogRevision: 0, cart: [], orders: [], checkoutError: '' })
    store.addToCart(store.products[0])
    expect(await store.submitOrder()).toBe(true)
    const order = store.orders[0]
    order.status = 'received'
    expect(store.initiateAfterSale(order.id, 'return')).toBe(true)
    const beforeOrders = cloneSeed(store.orders)
    const beforeProducts = cloneSeed(store.products)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-catalog' || key === 'agritainment-platform-recovery-queue') throw new Error('fatal recovery write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeReturn(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(store.orders).toEqual(beforeOrders)
    expect(store.products).toEqual(beforeProducts)
    expect(store.error).toBe('退货事务恢复失败，请联系平台处理')
  })
})
