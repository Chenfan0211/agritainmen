import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CUserLevel } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_C_ORDERS_STORAGE_KEY, acceptSupplierOrder, demoCDistributorProfiles, readCAddresses, readCCommissionRecords, readCOrders, readCUserSession, readCatalogState, readPendingCatalogTransactions, readPlatformOrders, readStoreCatalogSelectionState, readUserBindings, saveStoreCatalogSelection, shipSupplierCourier, todayString, updateCatalogStock, upsertUserBinding, writeCAddresses, writeCCommissionRecords, writeCDistributorProfiles, writeCUserSession, writeCatalogState, writePlatformLive, writePlatformOrder } from '@agritainment/shared'
import { useUserStore } from './user'

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

describe('C端商城 user store', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  const catalogProduct = (id: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
    id,
    name: `目录商品-${id}`,
    category: '农特产',
    supplierId: 'SUP-CATALOG',
    supplierName: '目录供应商',
    source: 'platform',
    status: 'active',
    image: '/static/images/field.webp',
    images: [],
    tags: ['目录'],
    productType: 'goods',
    expressDelivery: true,
    channel: 'live',
    farmIds: [],
    promoterCommissionRate: 5,
    storeCommissionRate: 3,
    skus: [{ id: `${id}-SKU`, name: '标准装', image: '/static/images/field.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15 }],
    ...overrides
  })

  const allowedStore = () => {
    const allowed = useUserStore()
    allowed.applyLaunch({ promoter: 'T002' })
    return allowed
  }

  function shipFromSupplier(store: ReturnType<typeof useUserStore>, orderId: string, subOrderId: string) {
    const key = `C-MALL-${subOrderId}`
    const supplierOrder = readPlatformOrders()?.[key]
    const accepted = supplierOrder ? acceptSupplierOrder(supplierOrder, '供应商演示') : null
    const shipped = accepted ? shipSupplierCourier(accepted, `SF-${subOrderId}`, '供应商演示') : null
    expect(shipped).toBeTruthy()
    writePlatformOrder(shipped!)
    store.refreshFulfillment()
    return store.orders.find((order) => order.id === orderId)!
  }

  it('projects only active live/all express goods from the unified catalog and keeps its revision', async () => {
    expect(writeCatalogState({
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 7,
      products: [
        catalogProduct('LIVE'),
        catalogProduct('ALL', { channel: 'all' }),
        catalogProduct('STORE', { channel: 'store' }),
        catalogProduct('PICKUP', { channel: 'store', expressDelivery: false }),
        catalogProduct('PACKAGE', { channel: 'store', productType: 'package', expressDelivery: false }),
        catalogProduct('OFFLINE', { status: 'offline' })
      ]
    })).toBe(true)
    const store = allowedStore()

    await store.initialize()

    expect(store.cProducts.map((product) => product.id)).toEqual(['LIVE', 'ALL'])
    expect(store.inventoryRevision).toBe(7)
    expect(store.cProducts[0].skus[0]).toMatchObject({ basePrice: 75, level1Commission: 10, level2Commission: 15, stock: 8 })
  })

  it('reserves and releases stock through the unified catalog transaction', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 3, products: [catalogProduct('TX')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TX', auth: { isLoggedIn: true, openid: 'openid-tx' } })
    store.applyLaunch({ promoter: 'T002' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('TX', 'TX-SKU', 2)

    expect(store.submitOrder()).toBe(true)
    expect(readCatalogState()?.revision).toBe(4)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(6)
    const orderId = store.orders[0].id
    expect(store.cancelOrder(orderId)).toBe(true)
    expect(readCatalogState()?.revision).toBe(5)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
  })

  it('refreshes the catalog snapshot when a stock revision conflicts', async () => {
    writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [catalogProduct('STALE')] })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-STALE', auth: { isLoggedIn: true, openid: 'openid-stale' } })
    store.applyLaunch({ promoter: 'T002' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart('STALE', 'STALE-SKU')
    expect(updateCatalogStock([{ productId: 'STALE', skuId: 'STALE-SKU', quantity: -1 }], 2)).toBeTruthy()

    expect(store.submitOrder()).toBe(false)
    expect(store.checkoutError).toBe('库存已更新，请刷新后重试')
    expect(store.inventoryRevision).toBe(3)
    expect(store.cProducts[0].skus[0].stock).toBe(7)
    expect(store.cart[0]).toMatchObject({ unitPrice: 100, lockedLevel: 'normal' })
  })

  it('restricts unshared new users but lets a formally bound user revisit without replacing the binding', async () => {
    const restricted = useUserStore()
    restricted.applyLaunch({})
    await restricted.initialize()
    expect(restricted.entryRestricted).toBe(true)
    expect(restricted.cProducts).toHaveLength(0)

    upsertUserBinding({ userId: 'U-BOUND', promoterId: 'T003', status: 'bound', boundAt: new Date().toISOString() })
    setActivePinia(createPinia())
    const returning = useUserStore()
    returning.$patch({ userId: 'U-BOUND', auth: { isLoggedIn: true, openid: 'openid-bound' } })
    returning.applyLaunch({ promoter: 'T002' })
    await returning.initialize()
    expect(returning.entryRestricted).toBe(false)
    expect(returning.referralPromoterId).toBe('T003')
    expect(returning.cProducts.length).toBeGreaterThan(0)
  })

  it('restricts initialize when launch handling did not provide a referral', async () => {
    const unshared = useUserStore()

    await unshared.initialize()

    expect(unshared.entryRestricted).toBe(true)
    expect(unshared.cProducts).toHaveLength(0)
  })

  it('binds a direct level2 promoter without an upstream and allocates only its level2 amount', async () => {
    writeCDistributorProfiles({
      ...demoCDistributorProfiles,
      'U-NO-PARENT': { userId: 'U-NO-PARENT', promoterId: 'T003', level: 'level2', status: 'active' }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-DIRECT', auth: { isLoggedIn: true, openid: 'openid-direct' } })
    store.applyLaunch({ promoter: 'T003' })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)

    expect(store.submitOrder()).toBe(true)
    expect(store.orders[0].commissionAllocations).toEqual([
      expect.objectContaining({ beneficiaryId: 'T003', beneficiaryLevel: 'level2', amount: product.skus[0].level2Commission })
    ])
    expect(readUserBindings()?.['U-DIRECT']).toMatchObject({ promoterId: 'T003', status: 'bound' })
  })

  it('uses formal profile prices and the direct-level2 referral chain for all buyer levels', async () => {
    const identities: Array<{ userId: string; level: CUserLevel; beneficiaries: string[] }> = [
      { userId: 'U-ROLE-NORMAL', level: 'normal', beneficiaries: ['T001', 'T002'] },
      { userId: 'U-DEMO-L2', level: 'level2', beneficiaries: ['T001'] },
      { userId: 'U-DEMO-L1', level: 'level1', beneficiaries: [] }
    ]
    writeCDistributorProfiles(demoCDistributorProfiles)

    for (const identity of identities) {
      setActivePinia(createPinia())
      const store = allowedStore()
      store.$patch({ userId: identity.userId, auth: { isLoggedIn: true, openid: `openid-${identity.level}` } })
      store.applyLaunch({ promoter: 'T002' })
      await store.initialize()
      store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
      const product = store.cProducts[0]
      const expectedPrice = store.priceFor(product.skus[0], identity.level)
      store.addToCart(product.id, product.skus[0].id)
      expect(store.cart[0]).toMatchObject({ unitPrice: expectedPrice, lockedLevel: identity.level })
      expect(store.submitOrder()).toBe(true)
      expect(store.orders[0].commissionAllocations.map((item) => item.beneficiaryId)).toEqual(identity.beneficiaries)
    }
  })

  it('loads the user projection of the catalog and derives prices from formal profiles', async () => {
    writeCDistributorProfiles(demoCDistributorProfiles)
    const store = allowedStore()
    await store.initialize()
    const product = store.cProducts[0]
    expect(readCatalogState()?.products.some((item) => item.id === product.id)).toBe(true)
    expect(store.priceFor(product.skus[0])).toBe(45)
    store.$patch({ userId: 'U-DEMO-L2' })
    expect(store.priceFor(product.skus[0])).toBe(30)
    store.$patch({ userId: 'U-DEMO-L1' })
    expect(store.priceFor(product.skus[0])).toBe(20)
  })

  it('derives formal prices from the active distributor profile and never persists a role override', async () => {
    writeCDistributorProfiles({
      ...demoCDistributorProfiles,
      'U-FORMAL-L2': { userId: 'U-FORMAL-L2', promoterId: 'T002', parentPromoterId: 'T001', level: 'level2', status: 'active' }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-FORMAL-L2', auth: { isLoggedIn: true, openid: 'openid-formal-l2' } })
    await store.initialize()

    const sku = store.cProducts[0].skus[0]
    expect(store.level).toBe('level2')
    expect(store.priceFor(sku)).toBe(30)
    store.persistSession()
    expect(JSON.stringify(readCUserSession('U-FORMAL-L2'))).not.toContain('roleOverride')
  })

  it('recovers an order after inventory was applied but order persistence failed', async () => {
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [catalogProduct('RECOVER')] })).toBe(true)
    const store = allowedStore()
    store.$patch({ userId: 'U-RECOVER', auth: { isLoggedIn: true, openid: 'openid-recover' } })
    await store.initialize()
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '恢复测试', isDefault: true })
    store.addToCart('RECOVER', 'RECOVER-SKU')
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key.includes('c-orders')) { failed = true; throw new Error('quota') }
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(store.submitOrder()).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPendingCatalogTransactions('user')).toEqual([expect.objectContaining({ status: 'stock-applied' })])

    setActivePinia(createPinia())
    const recovered = allowedStore()
    recovered.$patch({ userId: 'U-RECOVER', auth: { isLoggedIn: true, openid: 'openid-recover' } })
    await recovered.initialize(true)
    expect(recovered.orders).toHaveLength(1)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(7)
    expect(readPendingCatalogTransactions('user')).toEqual([])
  })

  it('projects live packages from current store selections and hides them after unlisting', async () => {
    const pkg = catalogProduct('LIVE-PKG', { channel: 'store', productType: 'package', expressDelivery: false })
    expect(writeCatalogState({ schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, products: [pkg] })).toBe(true)
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: pkg.id, listed: true, skuRetailPrices: { 'LIVE-PKG-SKU': 118 } }, readStoreCatalogSelectionState().revision)).toBeTruthy()
    writePlatformLive({ id: 'LIVE-VALID', title: '有效套餐直播', host: '主播', viewers: 1, productName: '', productPrice: 0, status: 'live', reminded: false, image: '', linkedFarms: [{ farmId: 'F001', packageIds: [pkg.id] }], city: '湘西州' })
    const store = allowedStore()
    store.applyLaunch({ promoter: 'T002', live: 'LIVE-VALID' })
    await store.initialize()
    expect(store.liveFarms[0]?.packages.map((item) => item.id)).toEqual([pkg.id])
    const selection = readStoreCatalogSelectionState()
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: pkg.id, listed: false, skuRetailPrices: { 'LIVE-PKG-SKU': 118 } }, selection.revision)).toBeTruthy()
    store.refreshSharedState()
    expect(store.liveFarms).toEqual([])
  })

  it('keeps a valid launch referral before the catalog seed finishes', () => {
    const store = allowedStore()
    store.applyLaunch({ promoter: 'T002' })
    expect(store.referralPromoterId).toBe('T002')
  })

  it('does not let a URL userId replace the authorized identity', () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-A', auth: { isLoggedIn: true, openid: 'openid-a' } })
    store.applyLaunch({ userId: 'U-B', promoter: 'T001' })
    expect(store.userId).toBe('U-A')
  })

  it('checks stock, splits multi-supplier checkout and records price snapshots', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const first = store.cProducts[0]
    const second = store.cProducts.find((item) => item.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id, 2)
    expect(store.cartCount).toBe(3)
    expect(store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })).toBe(true)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(order.subOrders).toHaveLength(2)
    expect(order.items[0].unitPrice).toBe(45)
    expect(order.createdAt.slice(0, 10)).toBe(todayString())
    expect(readCOrders()?.[order.id]?.subOrders).toHaveLength(2)
  })

  it('publishes paid C sub-orders to supplier fulfillment and blocks direct user shipping', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    expect(readPlatformOrders()?.[`C-MALL-${sub.id}`]).toMatchObject({ supplierOrderLink: { source: 'c-mall', sourceOrderId: order.id, sourceSubOrderId: sub.id } })
    expect(store.shipSubOrder(order.id, sub.id)).toBe(false)
    expect(store.payOrder(order.id)).toBe(false)
  })

  it('refreshes a C sub-order from supplier platform fulfillment', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    const supplierOrder = readPlatformOrders()?.[`C-MALL-${sub.id}`]!
    writePlatformOrder(shipSupplierCourier({ ...supplierOrder, supplierFulfillment: { ...supplierOrder.supplierFulfillment!, status: 'accepted' } }, 'SF-REFRESH', '供应商 A')!)
    await store.refreshFulfillment()
    expect(store.orders[0].subOrders[0]).toMatchObject({ status: 'shipped', trackingNo: 'SF-REFRESH' })
  })

  it('reloads addresses and inventory changed by another H5 page', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-OTHER', auth: { isLoggedIn: true, openid: 'openid-other' } })
    const inventory = readCatalogState()!
    const address = { id: 'ADDR-OTHER', userId: 'U-C-OTHER', receiver: '跨页用户', phone: '13800000000', region: '湖南', detail: '跨页地址', isDefault: true }
    writeCAddresses({ [address.id]: address })
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    store.refreshSharedState()
    expect(store.addresses).toEqual([expect.objectContaining({ id: address.id })])
    expect(store.inventoryRevision).toBe(inventory.revision + 1)
  })

  it('keeps confirmed receipt after refreshing the supplier fulfillment snapshot', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const subId = store.orders[0].subOrders[0].id
    expect(store.payOrder(orderId)).toBe(true)
    shipFromSupplier(store, orderId, subId)
    expect(store.confirmSubOrderReceipt(orderId, subId)).toBe(true)
    expect(store.refreshFulfillment().find((order) => order.id === orderId)?.subOrders[0].status).toBe('received')
  })

  it('keeps a sub-order in after-sale after refreshing supplier fulfillment', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = store.cProducts[0]
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '售后测试地址', isDefault: true })
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const subId = store.orders[0].subOrders[0].id
    expect(store.payOrder(orderId)).toBe(true)
    shipFromSupplier(store, orderId, subId)
    expect(store.confirmSubOrderReceipt(orderId, subId)).toBe(true)
    expect(store.requestSubOrderAfterSale(orderId, subId)).toBe(true)
    expect(readPlatformOrders()?.[`C-MALL-${subId}`]).toMatchObject({ status: 'after-sale', supplierFulfillment: { status: 'cancelled' } })
    expect(store.refreshFulfillment().find((order) => order.id === orderId)?.subOrders[0].status).toBe('after_sale')
  })

  it('pays only the upstream level1 for a level2 buyer and settles a referred order after receipt', async () => {
    const store = allowedStore()
    await store.initialize()
    writeCDistributorProfiles(demoCDistributorProfiles)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    const sku = store.cProducts[0].skus[0]
    store.addToCart(store.cProducts[0].id, sku.id)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南省湘西州', detail: '测试地址', isDefault: true })
    expect(store.submitOrder()).toBe(true)
    expect(store.orders[0].commissionAllocations).toEqual([
      expect.objectContaining({ beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: sku.level1Commission })
    ])

    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setReferral('T002')).toBe(true)
    store.setAddress({ receiver: '王女士', phone: '13900000000', region: '湖南省湘西州', detail: '另一测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, sku.id)
    expect(store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    expect(store.payOrder(orderId)).toBe(true)
    const subOrderId = store.orders[0].subOrders[0].id
    const shippedOrder = shipFromSupplier(store, orderId, subOrderId)
    expect(store.confirmSubOrderReceipt(orderId, subOrderId)).toBe(true)
    expect(shippedOrder.status).toBe('received')
    expect(shippedOrder.commissionAllocations.every((item) => item.status === 'available')).toBe(true)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    expect(store.withdrawCommission()).toBe(true)
    expect(store.availableCommission).toBe(0)
    expect(store.requestSubOrderAfterSale(orderId, subOrderId)).toBe(true)
    const afterSaleOrder = store.orders.find((item) => item.id === orderId)!
    expect(afterSaleOrder.status).toBe('after_sale')
    expect(afterSaleOrder.commissionAllocations.some((item) => item.amount === -15 && item.status === 'reversed')).toBe(true)
  })

  it('persists address defaults, inventory reservations and pending cancellation rollback', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const sku = store.cProducts[0].skus[0]
    const originalStock = sku.stock
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const firstAddress = store.addresses[0]
    expect(store.setAddress({ receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true })).toBe(true)
    expect(store.addresses.filter((item) => item.isDefault)).toHaveLength(1)
    expect(readCAddresses()).toMatchObject({ [store.addresses[0].id]: { isDefault: true } })
    store.addToCart(store.cProducts[0].id, sku.id)
    expect(store.submitOrder()).toBe(true)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock - 1)
    const orderId = store.orders[0].id
    expect(store.cancelOrder(orderId)).toBe(true)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
    expect(store.cancelOrder(orderId)).toBe(false)
    expect(store.removeAddress(firstAddress.id)).toBe(true)
    expect(readCAddresses()?.[firstAddress.id]).toBeUndefined()
    expect(readCatalogState()?.products.find((item) => item.id === store.cProducts[0].id)?.skus.find((item) => item.id === sku.id)?.stock).toBe(originalStock)
  })

  it('normalizes multiple persisted default addresses on initialization', async () => {
    writeCAddresses({
      A: { id: 'A', userId: 'U-C-TEST', receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true },
      B: { id: 'B', userId: 'U-C-TEST', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true }
    })
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.addresses.filter((item) => item.isDefault)).toHaveLength(1)
    expect(readCAddresses()).toEqual(expect.objectContaining({ B: expect.objectContaining({ isDefault: true }) }))
  })

  it('rejects non-courier products before adding them to cart', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    const product = { ...store.cProducts[0], shippingType: 'pickup' as never }
    store.cProducts = [product]
    expect(store.addToCart(product.id, product.skus[0].id)).toBe(false)
    expect(store.cart).toHaveLength(0)
  })

  it('supports paid sub-order after-sale and releases inventory once', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const product = store.cProducts[0]
    const sku = product.skus[0]
    const originalStock = sku.stock
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, sku.id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(store.payOrder(order.id)).toBe(true)
    expect(store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    expect(sub.status).toBe('after_sale')
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
    expect(store.requestSubOrderAfterSale(order.id, sub.id)).toBe(false)
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock)
  })

  it('supports shipped sub-order after-sale without restoring inventory', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const product = store.cProducts[0]
    const sku = product.skus[0]
    const originalStock = sku.stock
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(product.id, sku.id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const shippedOrder = shipFromSupplier(store, order.id, sub.id)
    const shippedSub = shippedOrder.subOrders.find((item) => item.id === sub.id)!
    expect(store.requestSubOrderAfterSale(order.id, sub.id)).toBe(true)
    expect(shippedSub.status).toBe('after_sale')
    expect(store.cProducts[0].skus[0].stock).toBe(originalStock - 1)
  })

  it('does not overwrite another users persisted addresses', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const otherAddress = { id: 'ADDR-OTHER', userId: 'U-OTHER', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: true }
    const allAddresses = readCAddresses() || {}
    allAddresses[otherAddress.id] = otherAddress
    writeCAddresses(allAddresses)
    expect(store.setDefaultAddress(store.addresses[0].id)).toBe(true)
    expect(readCAddresses()?.[otherAddress.id]).toMatchObject({ userId: 'U-OTHER' })
  })

  it('preserves a same-user address added by another tab when changing the default', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })).toBe(true)
    const firstId = store.addresses[0].id
    const all = readCAddresses() || {}
    all['ADDR-EXTERNAL'] = { id: 'ADDR-EXTERNAL', userId: 'U-C-TEST', receiver: '乙', phone: '13900000000', region: '湖南', detail: '二号', isDefault: false, updatedAt: new Date(Date.now() + 1000).toISOString() }
    writeCAddresses(all)

    expect(store.setDefaultAddress(firstId)).toBe(true)

    expect(readCAddresses()).toMatchObject({ [firstId]: { isDefault: true }, 'ADDR-EXTERNAL': { userId: 'U-C-TEST' } })
  })

  it('isolates persisted carts by user session', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-A', auth: { isLoggedIn: true, openid: 'openid-a' } })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    store.persistSession()
    store.$patch({ userId: 'U-B', cart: [] })
    store.restoreSession()
    expect(store.cart).toHaveLength(0)
    store.$patch({ userId: 'U-A' })
    store.restoreSession()
    expect(store.cart).toHaveLength(1)
    expect(readCUserSession('U-B').cart).toHaveLength(0)
  })

  it('rejects checkout when another session advances inventory revision', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    const inventory = readCatalogState()!
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    expect(store.submitOrder()).toBe(false)
    expect(store.checkoutError).toContain('库存已更新')
    expect(store.orders).toHaveLength(0)
    expect(store.cart).toHaveLength(1)
  })

  it('rejects invalid referrals and keeps a bound referral immutable', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    expect(store.setReferral('missing')).toBe(false)
    expect(store.setReferral('T002')).toBe(true)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(store.submitOrder()).toBe(true)
    expect(readUserBindings()?.['U-C-TEST']).toMatchObject({ promoterId: 'T002', status: 'bound' })
    expect(store.setReferral('T001')).toBe(false)
    expect(store.referralPromoterId).toBe('T002')
  })

  it('fulfills and reverses only the selected supplier sub-order', async () => {
    const store = allowedStore()
    await store.initialize()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.setReferral('T002')
    const first = store.cProducts[0]
    const second = store.cProducts.find((item) => item.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const firstSub = order.subOrders[0]
    const secondSub = order.subOrders[1]
    shipFromSupplier(store, order.id, firstSub.id)
    const syncedOrder = store.orders.find((item) => item.id === order.id)!
    const syncedFirstSub = syncedOrder.subOrders.find((item) => item.id === firstSub.id)!
    const syncedSecondSub = syncedOrder.subOrders.find((item) => item.id === secondSub.id)!
    expect(store.confirmSubOrderReceipt(order.id, syncedFirstSub.id)).toBe(true)
    expect(syncedFirstSub.status).toBe('received')
    expect(syncedSecondSub.status).toBe('paid')
    expect(store.requestSubOrderAfterSale(order.id, syncedFirstSub.id)).toBe(true)
    expect(syncedFirstSub.status).toBe('after_sale')
    expect(syncedSecondSub.status).toBe('paid')
    expect(store.orders[0].commissionAllocations.filter((item) => item.subOrderId === syncedFirstSub.id).every((item) => item.status === 'reversed')).toBe(true)
  })

  it('restores a logged-in users orders and addresses after reinitialization', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '李女士', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(store.submitOrder()).toBe(true)
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders).toHaveLength(1)
    expect(store.addresses).toHaveLength(1)
  })

  it('does not restore an order whose address snapshot belongs to another user', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const raw = JSON.parse(localStorage.getItem(PLATFORM_C_ORDERS_STORAGE_KEY) || '{}')
    raw[store.orders[0].id].address.userId = 'U-OTHER'
    localStorage.setItem(PLATFORM_C_ORDERS_STORAGE_KEY, JSON.stringify(raw))
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders).toHaveLength(0)
  })

  it('keeps historical price and commission snapshots after current catalog changes', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const orderId = store.orders[0].id
    const inventory = readCatalogState()!
    const changed = inventory.products.map((item) => item.id === product.id ? { ...item, skus: item.skus.map((sku) => sku.id === product.skus[0].id ? { ...sku, retailPrice: 99, level1Amount: 1, level2Amount: 1 } : sku) } : item)
    expect(writeCatalogState({ ...inventory, revision: inventory.revision + 1, products: changed }, inventory.revision)).toBe(true)
    store.$reset()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    expect(store.orders.find((order) => order.id === orderId)?.items[0]).toMatchObject({ unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15 })
  })

  it('does not cancel a pending order when a reserved SKU is missing', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const inventory = readCatalogState()!
    localStorage.setItem(PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify({ ...inventory, products: inventory.products.map((product) => product.id === store.cProducts[0].id ? { ...product, skus: [] } : product) }))
    expect(store.cancelOrder(order.id)).toBe(false)
    expect(order.status).toBe('pending_payment')
    expect(order.inventoryReleased).toBeUndefined()
  })

  it('keeps paid after-sale unchanged when inventory revision is stale', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    store.addToCart(store.cProducts[0].id, store.cProducts[0].skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    const sub = order.subOrders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const inventory = readCatalogState()!
    expect(updateCatalogStock([{ productId: store.cProducts[0].id, skuId: store.cProducts[0].skus[0].id, quantity: -1 }], inventory.revision)).toBeTruthy()
    expect(store.requestSubOrderAfterSale(order.id, sub.id)).toBe(false)
    expect(sub.status).toBe('paid')
    expect(sub.afterSale).toBeUndefined()
  })

  it('restores only valid cart session lines', async () => {
    const store = allowedStore()
    await store.initialize(true)
    const product = store.cProducts[0]
    writeCUserSession('U-C-TEST', {
      referralPromoterId: '',
      cart: [
        { productId: product.id, skuId: product.skus[0].id, name: product.name, skuName: product.skus[0].name, image: '', quantity: 0, unitPrice: 45, basePrice: 20, level1Commission: 10, level2Commission: 15, supplierId: product.supplierId, lockedLevel: 'normal' },
        { productId: 'missing', skuId: 'missing', name: '脏数据', skuName: '脏数据', image: '', quantity: 1, unitPrice: -1, basePrice: -1, level1Commission: 0, level2Commission: 0, supplierId: 'S1', lockedLevel: 'normal' }
      ]
    })
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    store.restoreSession()
    expect(store.cart).toHaveLength(0)
  })

  it('creates a negative withdrawn commission only for the selected sub-order', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const first = store.cProducts[0]
    const second = store.cProducts.find((product) => product.supplierId !== first.supplierId)!
    store.addToCart(first.id, first.skus[0].id)
    store.addToCart(second.id, second.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(store.payOrder(order.id)).toBe(true)
    for (const sub of order.subOrders) {
      shipFromSupplier(store, order.id, sub.id)
      expect(store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    }
    writeCDistributorProfiles(demoCDistributorProfiles)
    store.$patch({ userId: 'U-DEMO-L2', auth: { isLoggedIn: true, openid: 'openid-level2' } })
    expect(store.withdrawCommission()).toBe(true)
    const target = order.subOrders[0]
    const other = order.subOrders[1]
    expect(store.requestSubOrderAfterSale(order.id, target.id)).toBe(true)
    const settledOrder = store.orders.find((item) => item.id === order.id)!
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === target.id && item.amount < 0).length).toBeGreaterThan(0)
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === other.id && item.amount < 0)).toHaveLength(0)
    expect(settledOrder.commissionAllocations.filter((item) => item.subOrderId === other.id && item.beneficiaryId === 'T002').every((item) => item.status === 'withdrawn')).toBe(true)
  })

  it('preserves commission records added by another tab before a local status update', async () => {
    const store = allowedStore()
    store.$patch({ userId: 'U-C-TEST', auth: { isLoggedIn: true, openid: 'openid-test' } })
    await store.initialize(true)
    store.setReferral('T002')
    store.setAddress({ receiver: '甲', phone: '13800000000', region: '湖南', detail: '一号', isDefault: true })
    const product = store.cProducts[0]
    store.addToCart(product.id, product.skus[0].id)
    expect(store.submitOrder()).toBe(true)
    const order = store.orders[0]
    expect(store.payOrder(order.id)).toBe(true)
    const sub = order.subOrders[0]
    shipFromSupplier(store, order.id, sub.id)
    const external = { ...order.commissionAllocations[0], id: 'CC-EXTERNAL', orderId: 'CO-EXTERNAL', subOrderId: 'CSO-EXTERNAL' }
    writeCCommissionRecords([...(readCCommissionRecords() || []), external])

    expect(store.confirmSubOrderReceipt(order.id, sub.id)).toBe(true)
    expect(readCCommissionRecords()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'CC-EXTERNAL' })]))
  })
})
