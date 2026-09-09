import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CatalogState } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, applyCatalogStockOperation, cloneSeed, enqueuePlatformRecovery, markCatalogTransactionStockApplied, members, migrateLegacyCatalog, prepareCatalogTransaction, preparePlatformJournal, products, readCatalogState, readCatalogTransactionJournal, readPlatformAfterSales, readPlatformBookings, readPlatformCommissionLedger, readPlatformRecoveryQueue, readPendingCatalogTransactions, readPlatformJournal, readPlatformOrders, readPlatformVoucherOrders, readShareRecords, readStoreCatalogSelectionState, readStoreCatalogSelections, readUserBindings, resolvePlatformJournal, retryPlatformRecoveryTask, runLockedPlatformCollectionTask, saveStoreCatalogSelection, tenant, upsertStoreCatalogSelection, upsertUserBinding, writeCatalogState, writePlatformBooking, writePlatformExperience, readPlatformExperiences, mergePlatformExperiences, writePlatformCommissionLedgerEntry, writePlatformJson, writePlatformOrder, writePlatformStoreAccounts, writePlatformVoucherOrder, writeShareRecord, writeUserLink, storeAccounts } from '@agritainment/shared'
import { useFarmhouseStore } from './farmhouse'
import * as farmhouseStoreModule from './farmhouse'

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

function catalogProduct(overrides: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>): CatalogProduct {
  const { id, name, ...rest } = overrides
  return {
    id,
    name,
    category: '农产品',
    supplierId: 'SUP-TEST',
    supplierName: '测试供应商',
    source: 'platform',
    status: 'active',
    image: '/static/images/rice.webp',
    images: [],
    tags: ['统一目录'],
    productType: 'goods',
    expressDelivery: true,
    channel: 'store',
    farmIds: [],
    promoterCommissionRate: 5,
    storeCommissionRate: 3,
    skus: [{ id: `${id}-SKU`, name: '默认规格', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 10, level1Amount: 10, level2Amount: 15 }],
    ...rest
  }
}

function seedCatalog(catalogProducts: CatalogProduct[], revision = 0) {
  const state: CatalogState = { schemaVersion: CATALOG_SCHEMA_VERSION, revision, products: catalogProducts }
  expect(writeCatalogState(state)).toBe(true)
  return state
}

function persistStorefrontOrderStatus(orderId: string, status: '已完成') {
  const key = 'agritainment-platform-farmhouse-commerce'
  const state = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, { orders: Array<{ id: string; status: string }> }>
  const farm = Object.values(state).find((entry) => entry.orders.some((order) => order.id === orderId))
  const order = farm?.orders.find((candidate) => candidate.id === orderId)
  expect(order).toBeTruthy()
  if (order) order.status = status
  expect(writePlatformJson(key, state)).toBe(true)
}

async function initializeWithLegacyProducts(store: ReturnType<typeof useFarmhouseStore>, legacyProducts: typeof products) {
  seedCatalog(migrateLegacyCatalog(legacyProducts, []))
  legacyProducts.forEach((product) => {
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: product.price })).toBe(true)
  })
  await store.initialize(false, 'F001')
}

function createCheckoutAddress(store: ReturnType<typeof useFarmhouseStore>, detail = '测试地址 1 号') {
  if (!store.currentUserId) store.currentUserId = 'U-FARMHOUSE-TEST'
  const address = store.upsertAddress({ receiver: '测试用户', phone: '13800000000', region: '湖南省 长沙市 岳麓区', detail, isDefault: true })
  expect(address).not.toBeNull()
  return address!
}

describe('farmhouse store interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('renders MOQ states and blocks unavailable storefront checkout in the farmhouse page', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    expect(source).toContain('minimumOrderQuantity(')
    expect(source).toContain('库存不足或购买数量未达要求')
    expect(source).toContain(':disabled="!canStartOrder(selectedSku)"')
    expect(source).toContain(':class="{ shortage: item.unavailable }"')
    expect(source).toContain(':disabled="store.cartHasUnavailable"')
  })

  it('rejects an explicit direct-purchase quantity below MOQ before adding or changing the cart', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../pages/index/index.vue'), 'utf8')
    const directPurchase = source.indexOf("const explicitQuantity = typeof query.qty")
    const explicitValidation = source.indexOf('validateCatalogSkuOrderQuantity(sku, explicitQuantity)', directPurchase)
    const addToCart = source.indexOf('store.addToCart(directProduct, sku.id)', directPurchase)
    const initialQuantity = source.indexOf('const initialQuantity = initialCatalogOrderQuantity(minimumOrderQuantity(sku))', addToCart)
    const changeCart = source.indexOf('store.changeCart(directProduct.id, sku.id', directPurchase)

    expect(directPurchase).toBeGreaterThan(-1)
    expect(explicitValidation).toBeGreaterThan(directPurchase)
    expect(explicitValidation).toBeLessThan(addToCart)
    expect(initialQuantity).toBeGreaterThan(addToCart)
    expect(initialQuantity).toBeLessThan(changeCart)
    expect(explicitValidation).toBeLessThan(changeCart)
    expect(source.slice(explicitValidation, addToCart)).toContain("validation.code === 'below_minimum_order_quantity'")
    expect(source.slice(explicitValidation, addToCart)).toContain('return')
    expect(source.slice(explicitValidation, addToCart)).toContain('if (explicitQuantityAccepted)')
  })

  it('keeps cancellation snapshots unchanged when a locked collection revision changes', async () => {
    seedCatalog([catalogProduct({ id: 'CANCEL-LOCK-CONFLICT', name: '取消冲突商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CANCEL-LOCK-CONFLICT', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products[0], 'CANCEL-LOCK-CONFLICT-SKU')
    expect(await store.checkout()).toBe(true)
    const order = store.orders[0]
    const before = { order: cloneSeed(order), member: cloneSeed(store.member), entries: cloneSeed(store.balanceEntries), catalog: cloneSeed(readCatalogState()), platformOrders: cloneSeed(readPlatformOrders()), shares: cloneSeed(readShareRecords() || []) }
    const externalShare = { id: 'SR-LOCK-CONFLICT', userId: 'U-EXTERNAL', orderId: 'SO-EXTERNAL', orderAmount: 1, role: 'promoter' as const, rate: 1, amount: 0.01, status: 'pending' as const, createdAt: '2026-08-30T10:00:00.000Z' }
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writeShareRecord(externalShare)).toBe(true)
      }
      return callback()
    } } })

    expect(await store.cancelStorefrontOrder(order.id)).toBe(false)

    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformOrders()).toEqual(before.platformOrders)
    expect(readShareRecords()).toEqual([externalShare, ...before.shares])
    expect(order).toEqual(before.order)
    expect(store.member).toEqual(before.member)
    expect(store.balanceEntries).toEqual(before.entries)
  })

  it('does not let the farmhouse portal complete its own after-sale request', async () => {
    seedCatalog([catalogProduct({ id: 'AFTER-SALE-SELF-COMPLETE', name: '售后禁用商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'AFTER-SALE-SELF-COMPLETE', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products[0], 'AFTER-SALE-SELF-COMPLETE-SKU')
    expect(await store.checkout()).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    persistStorefrontOrderStatus(order.id, '已完成')
    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(true)
    const before = { order: cloneSeed(order), member: cloneSeed(store.member), entries: cloneSeed(store.balanceEntries), afterSales: cloneSeed(readPlatformAfterSales()) }

    expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)

    expect(order).toEqual(before.order)
    expect(store.member).toEqual(before.member)
    expect(store.balanceEntries).toEqual(before.entries)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
  })

  it('writes recharge and checkout balance entries', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ tenant: cloneSeed(tenant), member: { ...cloneSeed(members[0]), balance: 100 }, cart: [], balanceEntries: [] })
    store.recharge(100)
    store.addToCart(store.products[0])
    expect(await store.checkout()).toBe(true)
    expect(store.balanceEntries.map((item) => item.type)).toEqual(['consume', 'recharge'])
    expect(store.orders[0].status).toBe('待发货')
  })

  it('lets wechat mock checkout skip balance deduction', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ tenant: cloneSeed(tenant), member: { ...cloneSeed(members[0]), balance: 1 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0])
    expect(await store.checkout({ payMethod: 'wechat' })).toBe(true)
    expect(store.member.balance).toBe(1)
    expect(store.orders[0]).toMatchObject({ status: '待发货', payMethod: 'wechat' })
    expect(store.balanceEntries).toEqual([])
    expect(store.cart).toHaveLength(0)
  })

  it('still rejects balance checkout when the member cannot cover the cart', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ tenant: cloneSeed(tenant), member: { ...cloneSeed(members[0]), balance: 1 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0])
    expect(await store.checkout({ payMethod: 'balance' })).toBe(false)
    expect(store.checkoutError).toContain('会员余额不足')
    expect(store.orders).toHaveLength(0)
  })

  it('updates one promotion record on repeated sharing', () => {
    const store = useFarmhouseStore()
    store.tenant = cloneSeed(tenant)
    store.sharePromotion()
    store.sharePromotion()
    expect(store.promotionRecords).toHaveLength(1)
    expect(store.promotionRecords[0].shareCount).toBe(2)
  })

  it('decrements stock and blocks insufficient stock', async () => {
    const store = useFarmhouseStore()
    const seeded = cloneSeed(products.slice(2, 3))
    seeded[0].stock = 1
    seeded[0].skus[0].stock = 1
    await initializeWithLegacyProducts(store, seeded)
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(await store.checkout()).toBe(true)
    expect(store.products[0]).toMatchObject({ stock: 0 })
    expect(store.addToCart(store.products[0], store.products[0].skus[0].id)).toBe('out-of-stock')
    expect(store.checkoutError).toContain('库存不足')
  })

  it('requires multi-SKU selection and blocks increments at stock limit', () => {
    const store = useFarmhouseStore()
    store.products = cloneSeed(products.slice(0, 1))
    store.products[0].skus[0].stock = 1
    expect(store.addToCart(store.products[0])).toBe('sku-required')
    expect(store.addToCart(store.products[0], 'P001-500')).toBe('added')
    expect(store.changeCart('P001', 'P001-500', 1)).toBe(false)
    expect(store.cart[0].quantity).toBe(1)
  })

  it('uses the SKU MOQ for first add and snapshots it on the storefront order item', async () => {
    const product = catalogProduct({ id: 'MOQ-FIRST', name: '起订商品', skus: [{ id: 'MOQ-FIRST-SKU', name: '整箱', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    seedCatalog([product], 1)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500

    expect(store.addToCart(store.products[0], product.skus[0].id)).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3, unavailable: false })
    expect(store.changeCart(product.id, product.skus[0].id, -1)).toBe(true)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 3, unavailable: true })
    expect(store.changeCart(product.id, product.skus[0].id, 1)).toBe(true)
    expect(await store.checkout()).toBe(true)
    expect(store.orders[0].items[0]).toMatchObject({ quantity: 3, minimumOrderQuantity: 3 })
  })

  it('starts a zero-MOQ farmhouse cart line at one item', async () => {
    const product = catalogProduct({ id: 'MOQ-ZERO', name: '无起订商品', skus: [{ id: 'MOQ-ZERO-SKU', name: '散装', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 0 }] })
    seedCatalog([product], 1)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')

    expect(store.addToCart(store.products[0], product.skus[0].id)).toBe('added')
    expect(store.cart[0]).toMatchObject({ quantity: 1, minimumOrderQuantity: 0, unavailable: false })
  })

  it('keeps a below-MOQ cart line and rejects checkout after catalog MOQ rises', async () => {
    const product = catalogProduct({ id: 'MOQ-RAISED', name: '提量商品', skus: [{ id: 'MOQ-RAISED-SKU', name: '整箱', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 8, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 2 }] })
    seedCatalog([product], 1)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    expect(store.addToCart(store.products[0], product.skus[0].id)).toBe('added')
    const latest = cloneSeed(readCatalogState()!)
    latest.revision += 1
    latest.products[0].skus[0].minimumOrderQuantity = 4
    expect(writeCatalogState(latest)).toBe(true)

    expect(await store.checkout()).toBe(false)
    expect(store.cart[0]).toMatchObject({ quantity: 2, minimumOrderQuantity: 4, unavailable: true })
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('rejects first add when stock is below the SKU MOQ', async () => {
    const product = catalogProduct({ id: 'MOQ-STOCK', name: '库存不足商品', skus: [{ id: 'MOQ-STOCK-SKU', name: '整箱', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 2, level1Amount: 10, level2Amount: 15, minimumOrderQuantity: 3 }] })
    seedCatalog([product], 1)
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')

    expect(store.addToCart(store.products[0], product.skus[0].id)).toBe('out-of-stock')
    expect(store.cart).toHaveLength(0)
    expect(store.checkoutError).toContain('库存不足或购买数量未达要求')
  })

  it('stores order items and supports repurchase', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(await store.checkout()).toBe(true)
    expect(store.orders[0].items[0]).toMatchObject({ productId: 'P003', skuId: 'P003-GIFT', quantity: 1 })
    expect(store.repeatOrder(store.orders[0].id)).toBe(true)
    expect(store.cart[0].skuId).toBe('P003-GIFT')
  })

  it('adds, edits and removes featured rooms', () => {
    const store = useFarmhouseStore()
    const before = store.rooms.length
    expect(store.addRoom({ name: '星空观景台', image: '/static/images/mountain.webp', emoji: '🌌', capacity: '4–6 人 · 露天观景 · 最低消费 ¥388', sessions: '晚市 18:00', status: '可预订', people: 6 })).toBe(true)
    expect(store.rooms).toHaveLength(before + 1)
    const room = store.rooms.find((item) => item.name === '星空观景台')!
    expect(store.updateRoom(room.id, { ...room, status: '仅余晚市' })).toBe(true)
    expect(store.rooms.find((item) => item.id === room.id)!.status).toBe('仅余晚市')
    expect(store.removeRoom(room.id)).toBe(true)
    expect(store.rooms).toHaveLength(before)
  })

  it('adds, edits and removes signature dishes', () => {
    const store = useFarmhouseStore()
    store.foods = []
    expect(store.addFood({ name: '柴火土鸡汤', description: '柴火慢炖 3 小时', price: 88, emoji: '🍲', image: '/static/images/field.webp' })).toBe(true)
    expect(store.foods).toHaveLength(1)
    expect(store.addFood({ name: '', description: '', price: 0, emoji: '', image: '/static/images/field.webp' })).toBe(false)
    const food = store.foods[0]
    expect(store.updateFood(food.id, { name: '柴火土鸡汤（大份）', description: food.description, price: 128, emoji: food.emoji, image: food.image })).toBe(true)
    expect(store.foods[0].name).toBe('柴火土鸡汤（大份）')
    expect(store.removeFood(food.id)).toBe(true)
    expect(store.foods).toHaveLength(0)
  })

  it('verifies reserved bookings and blocks others', () => {
    const store = useFarmhouseStore()
    store.bookings = [
      { id: 'B1', type: 'room', name: '观溪雅间', date: '明天', session: '晚市 17:30', people: 6, status: 'reserved' },
      { id: 'B2', type: 'service', name: '农事采摘', date: '明天', session: '到店体验', people: 2, status: 'cancelled' }
    ]
    expect(store.verifyBooking('B1', 0)).toBe(false)
    expect(store.verifyBooking('B1', 328)).toBe(true)
    expect(store.bookings[0].status).toBe('completed')
    expect(store.bookings[0].amount).toBe(328)
    expect(store.verifyBooking('B1', 328)).toBe(false)
    expect(store.verifyBooking('B2', 100)).toBe(false)
    expect(store.verifyBooking('missing', 100)).toBe(false)
  })

  it('writes the confirmed amount to the shared booking', () => {
    const store = useFarmhouseStore()
    expect(writePlatformBooking({ id: 'B-SHARED', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'farmhouse', date: '明天', session: '晚市', people: 4, status: 'submitted', createdAt: '2026-08-25T10:00:00.000Z' })).toBe(true)
    store.bookings = [{ id: 'B-SHARED', type: 'room', name: '观溪雅间', date: '明天', session: '晚市', people: 4, status: 'reserved' }]

    expect(store.verifyBooking('B-SHARED', 488)).toBe(true)
    expect(readPlatformBookings()?.['B-SHARED']).toMatchObject({ status: 'completed', amount: 488, amountConfirmedAt: expect.any(String) })
  })

  it('labels synchronized booking states without treating confirmed as completed', () => {
    const label = (farmhouseStoreModule as unknown as { farmhouseBookingStatusText?: (status: string) => string }).farmhouseBookingStatusText
    expect(['reserved', 'confirmed', 'completed', 'cancelled'].map((status) => label?.(status))).toEqual(['待确认', '已确认', '已核销', '已取消'])
  })

  it('explains why terminal bookings cannot be verified again', () => {
    const errorText = (farmhouseStoreModule as unknown as { farmhouseBookingVerificationError?: (status: string) => string | undefined }).farmhouseBookingVerificationError
    expect(errorText?.('reserved')).toBeUndefined()
    expect(errorText?.('confirmed')).toBeUndefined()
    expect(errorText?.('completed')).toBe('该预约已核销，不能重复核销')
    expect(errorText?.('cancelled')).toBe('该预约已取消，不能核销')
  })

  it('allows a confirmed shared booking to be verified locally', () => {
    const store = useFarmhouseStore()
    expect(writePlatformBooking({ id: 'B-CONFIRMED-VERIFY', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'farmhouse', date: '明天', session: '晚市', people: 4, status: 'confirmed', createdAt: '2026-08-25T10:00:00.000Z' })).toBe(true)
    store.bookings = [{ id: 'B-CONFIRMED-VERIFY', type: 'room', name: '观溪雅间', date: '明天', session: '晚市', people: 4, status: 'confirmed' }]

    expect(store.verifyBooking('B-CONFIRMED-VERIFY', 588)).toBe(true)
    expect(store.bookings[0]).toMatchObject({ status: 'completed', amount: 588 })
    expect(readPlatformBookings()?.['B-CONFIRMED-VERIFY']).toMatchObject({ status: 'completed', amount: 588 })
  })

  it('allows a confirmed shared booking to be cancelled locally', () => {
    const store = useFarmhouseStore()
    expect(writePlatformBooking({ id: 'B-CONFIRMED-CANCEL', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'farmhouse', date: '明天', session: '午市', people: 2, status: 'confirmed', createdAt: '2026-08-25T10:00:00.000Z' })).toBe(true)
    store.bookings = [{ id: 'B-CONFIRMED-CANCEL', type: 'room', name: '观溪雅间', date: '明天', session: '午市', people: 2, status: 'confirmed' }]

    expect(store.cancelBooking('B-CONFIRMED-CANCEL')).toBe(true)
    expect(store.bookings[0].status).toBe('cancelled')
    expect(readPlatformBookings()?.['B-CONFIRMED-CANCEL']?.status).toBe('cancelled')
  })

  it('refreshes existing shared bookings through confirmed completed and cancelled states without crossing tenants', async () => {
    const store = useFarmhouseStore()
    const base = { id: 'B-ADMIN-SYNC', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'farmhouse' as const, date: '2026-09-01', session: '午市', people: 4, createdAt: '2026-08-30T01:00:00.000Z' }
    expect(writePlatformBooking({ ...base, status: 'submitted' })).toBe(true)
    expect(writePlatformBooking({ ...base, id: 'B-OTHER-FARM', farmId: 'F002', farmName: '云上人家', status: 'confirmed' })).toBe(true)
    await store.initialize(false, 'F001')
    expect(store.bookings.find((item) => item.id === base.id)).toMatchObject({ status: 'reserved', date: '2026-09-01', session: '午市', people: 4 })

    expect(writePlatformBooking({ ...base, status: 'confirmed', date: '2026-09-02', session: '晚市', people: 5, amount: 288, updatedAt: '2026-08-30T02:00:00.000Z' })).toBe(true)
    await store.initialize(true, 'F001')
    expect(store.bookings.find((item) => item.id === base.id)).toMatchObject({ status: 'confirmed', date: '2026-09-02', session: '晚市', people: 5, amount: 288 })

    expect(writePlatformBooking({ ...base, status: 'completed', date: '2026-09-03', session: '全天', people: 6, amount: 688, updatedAt: '2026-08-30T03:00:00.000Z' })).toBe(true)
    await store.initialize(true, 'F001')
    expect(store.bookings.find((item) => item.id === base.id)).toMatchObject({ status: 'completed', date: '2026-09-03', session: '全天', people: 6, amount: 688 })

    expect(writePlatformBooking({ ...base, status: 'cancelled', date: '2026-09-04', session: '午市', people: 2, updatedAt: '2026-08-30T04:00:00.000Z' })).toBe(true)
    await store.initialize(true, 'F001')
    expect(store.bookings.find((item) => item.id === base.id)).toMatchObject({ status: 'cancelled', date: '2026-09-04', session: '午市', people: 2 })
    expect(store.bookings.find((item) => item.id === base.id)?.amount).toBeUndefined()
    expect(store.bookings.some((item) => item.id === 'B-OTHER-FARM')).toBe(false)
  })

  it('refreshes shared booking state without reinitializing the tenant', async () => {
    const store = useFarmhouseStore()
    const booking = { id: 'B-SHARED-REFRESH', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'farmhouse' as const, date: '2026-09-05', session: '午市', people: 3, status: 'submitted' as const, createdAt: '2026-08-30T05:00:00.000Z' }
    expect(writePlatformBooking(booking)).toBe(true)
    await store.initialize(false, 'F001')
    expect(store.bookings.find((item) => item.id === booking.id)?.status).toBe('reserved')

    expect(writePlatformBooking({ ...booking, status: 'confirmed', people: 5, amount: 388 })).toBe(true)
    await store.refreshSharedState()

    expect(store.tenant?.farmId).toBe('F001')
    expect(store.bookings.find((item) => item.id === booking.id)).toMatchObject({ status: 'confirmed', people: 5, amount: 388 })
  })

  it('exposes store work permissions by role', () => {
    const store = useFarmhouseStore()
    store.role = 'customer'
    expect(store.canOperate).toBe(false)
    store.role = 'staff'
    expect(store.canOperate).toBe(true)
    expect(store.canSelect).toBe(false)
    store.role = 'manager'
    expect(store.canOperate).toBe(true)
    expect(store.canSelect).toBe(true)
  })

  it('pays an experience with balance or wechat mock without creating a duplicate', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    store.balanceEntries = []
    store.member = { ...cloneSeed(members[0]), balance: 200 }
    const payload = { type: 'service' as const, name: '农事采摘体验', date: '明天 9月8日', session: '到店体验', people: 2, amount: 136 }
    expect(store.payExperience(payload, 'balance')).toBe(true)
    expect(store.member.balance).toBe(64)
    expect(store.balanceEntries[0]).toMatchObject({ type: 'consume', amount: -136 })
    expect(store.bookings[0]).toMatchObject({ name: '农事采摘体验', status: 'reserved', amount: 136 })
    expect(store.payExperience(payload, 'wechat')).toBe(false)
    expect(store.checkoutError).toContain('已预约')
  })

  it('rejects experience balance pay when the wallet is short and wechat pay leaves the balance untouched', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    store.balanceEntries = []
    store.member = { ...cloneSeed(members[0]), balance: 20 }
    const payload = { type: 'service' as const, name: '农事采摘体验', date: '周三 9月9日', session: '到店体验', people: 2, amount: 136 }
    expect(store.payExperience(payload, 'balance')).toBe(false)
    expect(store.checkoutError).toContain('会员余额不足')
    expect(store.bookings).toHaveLength(0)
    expect(store.payExperience(payload, 'wechat')).toBe(true)
    expect(store.member.balance).toBe(20)
    expect(store.balanceEntries).toHaveLength(0)
    expect(store.bookings[0].name).toBe('农事采摘体验')
  })

  it('rejects a duplicate booking and supports cancellation', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    const booking = { type: 'package' as const, name: '四人欢聚套餐', date: '明天', session: '晚市', people: 4 }
    expect(store.submitBooking(booking)).toBe(true)
    expect(store.submitBooking(booking)).toBe(false)
    expect(store.cancelBooking(store.bookings[0].id)).toBe(true)
    store.bookings = [{ ...booking, id: 'B-CONFIRMED-DUPLICATE', status: 'confirmed' }]
    expect(store.submitBooking(booking)).toBe(false)
  })

  it('persists submitted bookings to the shared booking store', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    const booking = { type: 'room' as const, name: '观溪雅间', date: '明天', session: '晚市', people: 4 }
    expect(store.submitBooking(booking)).toBe(true)
    const created = store.bookings[0]
    expect(readPlatformBookings()?.[created.id]).toMatchObject({
      id: created.id,
      farmId: 'F001',
      farmName: expect.any(String),
      userId: expect.any(String),
      source: 'farmhouse',
      date: booking.date,
      session: booking.session,
      people: booking.people,
      status: 'submitted'
    })
  })

  it('does not mutate local bookings when shared booking persistence fails', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-bookings') throw new Error('booking write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(store.submitBooking({ type: 'room', name: '观溪雅间', date: '明天', session: '晚市', people: 4 })).toBe(false)
    localStorage.setItem = originalSetItem
    expect(store.bookings).toHaveLength(0)
    expect(readPlatformBookings()).toBe(null)
  })
})

describe('farmhouse auth', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('logs in via simulated wechat openid and logs out', async () => {
    const store = useFarmhouseStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(await store.wechatLogin()).toBe(true)
    expect(store.auth.isLoggedIn).toBe(true)
    expect(store.auth.openid).toMatch(/^mock_openid_/)
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, openid: '' })
  })

  it('loads an account address book with a stable isolated user id and clears it on logout', async () => {
    const firstStore = useFarmhouseStore()
    await firstStore.initialize(false, 'F001')

    expect(firstStore.loginWithAccount('13800000001', '123456')).toBe(true)
    const managerUserId = firstStore.currentUserId
    expect(managerUserId).toBeTruthy()
    const saved = firstStore.upsertAddress({ receiver: '王店长', phone: '13800000001', region: '湖南省 长沙市 岳麓区', detail: '店长收货点 1 号', isDefault: true })
    expect(saved).toMatchObject({ userId: managerUserId, receiver: '王店长' })

    firstStore.logout()
    expect(firstStore.loggedAccountId).toBe('')
    expect(firstStore.currentUserId).toBe('')
    expect(firstStore.addresses).toEqual([])

    setActivePinia(createPinia())
    const restoredStore = useFarmhouseStore()
    await restoredStore.initialize(false, 'F001')
    expect(restoredStore.loginWithAccount('13800000001', '123456')).toBe(true)
    expect(restoredStore.currentUserId).toBe(managerUserId)
    expect(restoredStore.addresses).toEqual([expect.objectContaining({ id: saved!.id, receiver: '王店长' })])

    restoredStore.logout()
    expect(restoredStore.loginWithAccount('13800000002', '123456')).toBe(true)
    expect(restoredStore.currentUserId).not.toBe(managerUserId)
    expect(restoredStore.addresses).toEqual([])
  })
})

describe('user binding and consumer share', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('locks pending binding and writes promoter share on order', () => {
    const store = useFarmhouseStore()
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'pending' } }))
    localStorage.setItem('agritainment-platform-config', JSON.stringify({ promoterRate: 5, staffRate: 3 }))
     store.currentUserId = 'U1'
    store.resolveOrderShare('SO1', 200)
    const bindings = JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')
    expect(bindings['U1']).toMatchObject({ promoterId: 'T001', status: 'bound' })
    const shares = JSON.parse(localStorage.getItem('agritainment-platform-shares') || '[]')
    expect(shares[0]).toMatchObject({ userId: 'U1', orderId: 'SO1', role: 'promoter', rate: 5, amount: 10 })
  })

  it('records staff share for bound staff binding and keeps it unchanged', () => {
    const store = useFarmhouseStore()
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', staffAccountId: 'SA002', status: 'bound', boundAt: 'x' } }))
     store.currentUserId = 'U1'
    store.resolveOrderShare('SO2', 100)
    const shares = JSON.parse(localStorage.getItem('agritainment-platform-shares') || '[]')
    expect(shares[0]).toMatchObject({ role: 'staff', rate: 3, amount: 3 })
    const bindings = JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')
    expect(bindings['U1'].staffAccountId).toBe('SA002')
  })

  it('accepts only active promoters and enabled promotion staff from the current farm', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.currentUserId = 'U1'
    store.setReferrer({ type: 'promoter', promoterId: 'T013', name: '停用推客' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})

    store.setReferrer({ type: 'promoter', promoterId: 'T001', name: '有效推客' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1']).toMatchObject({ promoterId: 'T001', status: 'pending' })

    localStorage.removeItem('agritainment-platform-bindings')
    store.setReferrer({ type: 'staff', staffAccountId: 'SA003', name: '跨店店长' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})
    store.setReferrer({ type: 'staff', staffAccountId: 'SA001', name: '未开推广店长' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})
    store.setReferrer({ type: 'staff', staffAccountId: 'SA002', name: '有效推广店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1']).toMatchObject({ staffAccountId: 'SA002', status: 'pending' })
  })

  it('rejects disabled promotion staff and never overwrites a bound owner', async () => {
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA002' ? { ...item, enabled: false } : item))
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.currentUserId = 'U1'
    store.setReferrer({ type: 'staff', staffAccountId: 'SA002', name: '停用店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})

    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'pending' } }))
    store.setReferrer({ type: 'staff', staffAccountId: 'SA002', name: '停用店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1']).toMatchObject({ promoterId: 'T001', status: 'pending' })
    localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' } }))
    store.setReferrer({ type: 'staff', staffAccountId: 'SA002', name: '停用店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')['U1'].promoterId).toBe('T001')
  })

  it('refreshes shared store accounts without resetting the current tenant', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    writePlatformStoreAccounts(storeAccounts.map((item) => item.id === 'SA002' ? { ...item, name: '刷新后的店员' } : item))

    await store.refreshSharedState()

    expect(store.tenant?.farmId).toBe('F001')
    expect(store.storeAccounts.find((item) => item.id === 'SA002')?.name).toBe('刷新后的店员')
  })
})

describe('openid identity boundaries', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('does not let a URL userId override the authorized identity', async () => {
    const store = useFarmhouseStore()
    store.pendingUserId = 'U-FROM-USER-END'
    await store.wechatLogin()
    expect(store.auth.isLoggedIn).toBe(true)
    expect(store.currentUserId).not.toBe('U-FROM-USER-END')
    const links = JSON.parse(localStorage.getItem('agritainment-platform-user-links') || '{}')
    expect(links[store.auth.openid]).toBe(store.currentUserId)
  })

  it('reuses openid-mapped userId after it is linked', async () => {
    const store = useFarmhouseStore()
    await store.wechatLogin()
    const openid = store.auth.openid
    writeUserLink(openid, 'U-EXISTING')
    store.logout()
    store.currentUserId = ''
    store.pendingUserId = ''
    await store.wechatLogin()
    expect(store.currentUserId).toBe('U-EXISTING')
  })

  it('caches promoter attribution after initialization until the first authorized identity is resolved', async () => {
    const store = useFarmhouseStore()
    writeUserLink('openid-promoter', 'U-AUTHORIZED')
    await store.initialize()

    store.setReferrer({ type: 'promoter', promoterId: 'T001', name: '推广员' })
    expect(store.currentUserId).toBe('')
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})

    expect(store.setAuthorizedIdentity('openid-promoter')).toBe('U-AUTHORIZED')
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({
      'U-AUTHORIZED': expect.objectContaining({
        userId: 'U-AUTHORIZED',
        promoterId: 'T001',
        status: 'pending'
      })
    })
  })

  it('caches staff attribution until the first authorized identity is resolved', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    writeUserLink('openid-staff', 'U-STAFF-CUSTOMER')

    store.setReferrer({ type: 'staff', staffAccountId: 'SA002', name: '李店员' })
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({})

    expect(store.setAuthorizedIdentity('openid-staff')).toBe('U-STAFF-CUSTOMER')
    expect(JSON.parse(localStorage.getItem('agritainment-platform-bindings') || '{}')).toEqual({
      'U-STAFF-CUSTOMER': expect.objectContaining({
        userId: 'U-STAFF-CUSTOMER',
        staffAccountId: 'SA002',
        status: 'pending'
      })
    })
  })

  it('loads F001 and F002 storefront data without mixing tenant branding', async () => {
    seedCatalog([
      catalogProduct({ id: 'CAT-F001', name: '石板溪选品', farmIds: ['F001'] }),
      catalogProduct({ id: 'CAT-F002', name: '云上人家选品', farmIds: ['F002'] })
    ])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-F001', listed: true, retailPrice: 118 })
    upsertStoreCatalogSelection({ storeId: 'F002', productId: 'CAT-F002', listed: true, retailPrice: 128 })
    const f002 = useFarmhouseStore()
    await f002.initialize(false, 'F002')
    expect(f002.tenant).toMatchObject({ code: 'yunshang', farmId: 'F002', name: '云上人家山景农庄' })
    expect(f002.farm?.id).toBe('F002')
    expect(f002.products.map((product) => ({ id: product.id, price: product.price }))).toEqual([{ id: 'CAT-F002', price: 128 }])

    setActivePinia(createPinia())
    const f001 = useFarmhouseStore()
    await f001.initialize(false, 'F001')
    expect(f001.tenant).toMatchObject({ code: 'shibanxi', farmId: 'F001', name: '石板溪农家乐' })
    expect(f001.farm?.id).toBe('F001')
    expect(f001.products.map((product) => ({ id: product.id, price: product.price }))).toEqual([{ id: 'CAT-F001', price: 118 }])
    expect(f001.tenant?.name).not.toBe(f002.tenant?.name)
  })

  it('updates unified inventory and persists storefront listed status', async () => {
    const store = useFarmhouseStore()
    const seeded = cloneSeed(products.slice(0, 1))
    await initializeWithLegacyProducts(store, seeded)
    const p = store.products[0]
    expect(store.setSkuStock(p.id, p.skus[0].id, 2)).toBe(true)
    expect(store.products[0].skus[0].stock).toBe(2)
    expect(store.toggleListed(p.id)).toBe(true)
    expect(store.isListed(p.id)).toBe(false)
  })
})


describe('farmhouse courier fulfillment', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('persists a farmhouse-only address book with exactly one default address', () => {
    const store = useFarmhouseStore()
    store.currentUserId = 'U-FARMHOUSE-ADDRESS'

    const first = store.upsertAddress({ receiver: '张女士', phone: '13800000001', region: '湖南省 长沙市 岳麓区', detail: '梅溪湖路 1 号', isDefault: false })
    const second = store.upsertAddress({ receiver: '李先生', phone: '13900000002', region: '湖南省 湘西州 永顺县', detail: '石板溪村 2 号', isDefault: false })

    expect(first).toMatchObject({ receiver: '张女士', isDefault: true, userId: 'U-FARMHOUSE-ADDRESS' })
    expect(second).toMatchObject({ receiver: '李先生', isDefault: false, userId: 'U-FARMHOUSE-ADDRESS' })
    expect(store.setDefaultAddress(second!.id)).toBe(true)
    expect(store.addresses.filter((address) => address.isDefault)).toEqual([
      expect.objectContaining({ id: second!.id, receiver: '李先生' })
    ])
    expect(store.removeAddress(second!.id)).toBe(true)
    expect(store.addresses).toEqual([
      expect.objectContaining({ id: first!.id, receiver: '张女士', isDefault: true })
    ])
    expect(store.upsertAddress({ receiver: '手机号错误', phone: '123', region: '湖南省 长沙市 岳麓区', detail: '错误地址', isDefault: false })).toBeNull()

    const persisted = JSON.parse(localStorage.getItem('agritainment-farmhouse-addresses') || '{}')
    expect(persisted[first!.id]).toMatchObject({ receiver: '张女士', isDefault: true })
    expect(localStorage.getItem('agritainment-platform-c-addresses')).toBeNull()
  })

  it('reuses farmhouse addresses across tenants while isolating different users', async () => {
    const firstStore = useFarmhouseStore()
    await firstStore.initialize(false, 'F001')
    const userId = firstStore.setAuthorizedIdentity('openid-farmhouse-address')!
    const saved = firstStore.upsertAddress({ receiver: '跨店用户', phone: '13700000003', region: '湖南省 张家界市 永定区', detail: '天门山路 3 号', isDefault: true })!

    setActivePinia(createPinia())
    const secondStore = useFarmhouseStore()
    await secondStore.initialize(false, 'F002')
    expect(secondStore.setAuthorizedIdentity('openid-farmhouse-address')).toBe(userId)
    expect(secondStore.addresses).toEqual([expect.objectContaining({ id: saved.id, receiver: '跨店用户' })])

    setActivePinia(createPinia())
    const otherUserStore = useFarmhouseStore()
    await otherUserStore.initialize(false, 'F001')
    otherUserStore.setAuthorizedIdentity('openid-other-address-user')
    expect(otherUserStore.addresses).toEqual([])
  })

  it('checks out with an owned address id and keeps an immutable supplier address snapshot', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ currentUserId: 'U-FARMHOUSE-CHECKOUT', member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    const address = store.upsertAddress({ receiver: '收货人', phone: '13600000004', region: '湖南省 长沙市 岳麓区', detail: '枫林路 4 号', isDefault: true })!
    store.addToCart(store.products[0], store.products[0].skus[0].id)

    expect(await store.checkout({ deliveryMode: 'courier', addressId: address.id })).toBe(true)
    const order = store.orders[0]
    expect(order.delivery).toEqual({ mode: 'courier', address: '收货人 13600000004 · 湖南省 长沙市 岳麓区 枫林路 4 号' })
    const platformOrder = readPlatformOrders()?.[`FH-${order.id}`]
    expect(platformOrder?.supplierOrderLink?.deliveryAddress).toMatchObject({
      userId: 'U-FARMHOUSE-CHECKOUT', receiver: '收货人', phone: '13600000004', region: '湖南省 长沙市 岳麓区', detail: '枫林路 4 号'
    })

    expect(store.upsertAddress({ ...address, detail: '修改后的地址', isDefault: true })).not.toBeNull()
    expect(readPlatformOrders()?.[`FH-${order.id}`]?.supplierOrderLink?.deliveryAddress?.detail).toBe('枫林路 4 号')
    expect(store.orders[0].delivery?.address).toBe('收货人 13600000004 · 湖南省 长沙市 岳麓区 枫林路 4 号')
  })

  it('writes a farmhouse-courier platform order when courier is selected', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store, '张家界市永定区示例路 1 号').id })).toBe(true)
    const order = store.orders[0]
    expect(order.delivery?.mode).toBe('courier')
    expect(order.platformOrderId).toBe(`FH-${order.id}`)
    const platformOrder = readPlatformOrders()?.[`FH-${order.id}`]
    expect(platformOrder?.supplierOrderLink?.source).toBe('farmhouse-courier')
    expect(platformOrder?.channel).toBe('purchase')
    expect(platformOrder?.items?.[0]?.deliveryMode).toBe('courier')
  })

  it('keeps pickup-only items local while publishing courier items from one mixed checkout', async () => {
    const courierProduct = catalogProduct({ id: 'MIXED-COURIER', name: '快递商品', expressDelivery: true })
    const pickupProduct = catalogProduct({ id: 'MIXED-PICKUP', name: '自提商品', expressDelivery: false })
    seedCatalog([courierProduct, pickupProduct])
    for (const product of [courierProduct, pickupProduct]) {
      expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: product.skus[0].retailPrice })).toBe(true)
    }
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.$patch({ currentUserId: 'U-MIXED-DELIVERY', member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    const address = createCheckoutAddress(store, '混合配送地址 8 号')
    expect(store.addToCart(store.products.find((item) => item.id === courierProduct.id)!)).toBe('added')
    expect(store.addToCart(store.products.find((item) => item.id === pickupProduct.id)!)).toBe('added')

    expect(await store.checkout({ deliveryMode: 'courier', addressId: address.id })).toBe(true)

    expect(store.orders[0].items.map((item) => ({ productId: item.productId, deliveryMode: item.deliveryMode }))).toEqual([
      { productId: courierProduct.id, deliveryMode: 'courier' },
      { productId: pickupProduct.id, deliveryMode: 'pickup' }
    ])
    const supplierOrders = Object.values(readPlatformOrders() || {})
    expect(supplierOrders).toHaveLength(1)
    expect(supplierOrders[0].items?.map((item) => item.productId)).toEqual([courierProduct.id])
  })

  it('keeps pickup orders local without a platform link', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(await store.checkout({ deliveryMode: 'pickup' })).toBe(true)
    const order = store.orders[0]
    expect(order.delivery?.mode).toBe('pickup')
    expect(order.platformOrderId).toBeUndefined()
  })

  it('requires an address for courier checkout', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(await store.checkout({ deliveryMode: 'courier' })).toBe(false)
    expect(store.checkoutError).toContain('收货地址')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: 'ADDR-NOT-OWNED' })).toBe(false)
    expect(store.checkoutError).toContain('收货地址')
  })
})

describe('unified farmhouse catalog', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('initializes assigned catalog products when the current farmhouse has no selections', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-DEFAULT', name: '默认上架商品', farmIds: ['F001'] })])
    const store = useFarmhouseStore()

    await store.initialize(false, 'F001')

    expect(store.products).toEqual([expect.objectContaining({ id: 'CAT-DEFAULT', price: 100 })])
    expect(readStoreCatalogSelections('F001')).toEqual([
      expect.objectContaining({ storeId: 'F001', productId: 'CAT-DEFAULT', listed: true, skuRetailPrices: { 'CAT-DEFAULT-SKU': 100 } })
    ])
  })

  it('loads only store-channel products into the selection pool and only listed products into the storefront', async () => {
    seedCatalog([
      catalogProduct({ id: 'CAT-STORE', name: '门店目录商品' }),
      catalogProduct({ id: 'CAT-ALL', name: '全渠道商品', channel: 'all' }),
      catalogProduct({ id: 'CAT-LIVE', name: '直播商品', channel: 'live' })
    ])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-STORE', listed: true, retailPrice: 128 })).toBe(true)
    expect(upsertStoreCatalogSelection({ storeId: 'F002', productId: 'CAT-ALL', listed: true, retailPrice: 138 })).toBe(true)

    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')

    expect(store.selectableProducts.map((item) => item.id)).toEqual(['CAT-STORE', 'CAT-ALL'])
    expect(store.products.map((item) => item.id)).toEqual(['CAT-STORE'])
    expect(store.products[0].price).toBe(128)
    expect(store.products[0].skus[0].price).toBe(128)
  })

  it('persists list price and listed status for the current store', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-LIST', name: '待选商品' })])
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')

    expect(store.products).toHaveLength(0)
    expect(store.listProduct('CAT-LIST', 126)).toBe(true)
    expect(store.products[0]).toMatchObject({ id: 'CAT-LIST', price: 126 })
    expect(readStoreCatalogSelections('F001')).toEqual([
      expect.objectContaining({ storeId: 'F001', productId: 'CAT-LIST', listed: true, skuRetailPrices: { 'CAT-LIST-SKU': 126 } })
    ])

    expect(store.toggleListed('CAT-LIST')).toBe(true)
    expect(store.products).toHaveLength(0)
    expect(readStoreCatalogSelections('F001')[0]).toMatchObject({ listed: false, skuRetailPrices: { 'CAT-LIST-SKU': 126 } })
  })

  it('persists independent retail prices for every active SKU', async () => {
    seedCatalog([catalogProduct({
      id: 'CAT-MULTI', name: '多规格商品',
      skus: [
        { id: 'CAT-MULTI-S', name: '小份', image: '/static/images/rice.webp', retailPrice: 80, cost: 40, stock: 5, level1Amount: 10, level2Amount: 15 },
        { id: 'CAT-MULTI-L', name: '大份', image: '/static/images/rice.webp', retailPrice: 120, cost: 70, stock: 5, level1Amount: 10, level2Amount: 15 }
      ]
    })])
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')

    expect(store.listProduct('CAT-MULTI', { 'CAT-MULTI-S': 99, 'CAT-MULTI-L': 159 })).toBe(true)

    expect(store.products[0].skus.map((sku) => ({ id: sku.id, price: sku.price }))).toEqual([
      { id: 'CAT-MULTI-S', price: 99 },
      { id: 'CAT-MULTI-L', price: 159 }
    ])
    expect(readStoreCatalogSelections('F001')[0].skuRetailPrices).toEqual({ 'CAT-MULTI-S': 99, 'CAT-MULTI-L': 159 })
  })

  it('rejects stale store selection writes and refreshes the latest selection revision', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-CAS', name: '并发选品' })])
    const first = useFarmhouseStore()
    await first.initialize(false, 'F001')
    setActivePinia(createPinia())
    const stale = useFarmhouseStore()
    await stale.initialize(false, 'F001')

    expect(first.listProduct('CAT-CAS', { 'CAT-CAS-SKU': 126 })).toBe(true)
    expect(stale.listProduct('CAT-CAS', { 'CAT-CAS-SKU': 136 })).toBe(false)
    expect(stale.checkoutError).toContain('选品已更新')
    expect(stale.products[0].skus[0].price).toBe(126)
  })

  it('rejects checkout when another tab changes the selected SKU price', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-PRICE-CAS', name: '价格冲突商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-PRICE-CAS', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products[0], 'CAT-PRICE-CAS-SKU')
    const selection = readStoreCatalogSelectionState()
    expect(saveStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-PRICE-CAS', listed: true, skuRetailPrices: { 'CAT-PRICE-CAS-SKU': 130 } }, selection.revision)).toBeTruthy()

    expect(await store.checkout()).toBe(false)
    expect(store.checkoutError).toContain('门店价格已更新')
    expect(store.orders.some((order) => order.items.some((item) => item.productId === 'CAT-PRICE-CAS'))).toBe(false)
    expect(store.cart).toHaveLength(1)
  })

  it('reserves shared SKU stock before creating the order', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-STOCK', name: '共享库存商品', skus: [{ id: 'CAT-STOCK-SKU', name: '默认规格', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 2, level1Amount: 10, level2Amount: 15 }] })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-STOCK', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.orders = []
    store.addToCart(store.products[0], 'CAT-STOCK-SKU')

    expect(await store.checkout()).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(1)
    expect(store.products[0].skus[0].stock).toBe(1)
    expect(store.orders).toHaveLength(1)
  })

  it('refreshes products and keeps checkout side effects untouched on a catalog revision conflict', async () => {
    const initial = seedCatalog([catalogProduct({ id: 'CAT-CONFLICT', name: '冲突商品', skus: [{ id: 'CAT-CONFLICT-SKU', name: '默认规格', image: '/static/images/rice.webp', retailPrice: 100, cost: 60, stock: 2, level1Amount: 10, level2Amount: 15 }] })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-CONFLICT', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.orders = []
    store.addToCart(store.products[0], 'CAT-CONFLICT-SKU')
    const changed = cloneSeed(initial)
    changed.revision = 1
    changed.products[0].skus[0].stock = 1
    expect(writeCatalogState(changed)).toBe(true)

    expect(await store.checkout()).toBe(false)
    expect(store.checkoutError).toContain('库存已更新')
    expect(store.member.balance).toBe(500)
    expect(store.orders).toHaveLength(0)
    expect(store.cart).toHaveLength(1)
    expect(store.products[0].skus[0].stock).toBe(1)
  })

  it('cancels an unfulfilled order once and restores inventory, balance and points', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-CANCEL', name: '可取消商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-CANCEL', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.$patch({ member: { ...store.member, balance: 500, points: 100 }, orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], 'CAT-CANCEL-SKU')
    expect(await store.checkout()).toBe(true)
    const order = store.orders[0]
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)

    expect(await store.cancelStorefrontOrder(order.id)).toBe(true)
    expect(await store.cancelStorefrontOrder(order.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(10)
    expect(store.member).toMatchObject({ balance: 500, points: 100 })
    expect(store.orders.find((item) => item.id === order.id)).toMatchObject({ status: '已取消', inventoryReleased: true, balanceRefunded: true })
  })

  it('keeps refund and return requests pending for the platform even when the farmhouse manager calls the legacy completion action', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-AFTER', name: '售后商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-AFTER', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.$patch({ member: { ...store.member, balance: 500, points: 100 }, orders: [], balanceEntries: [] })

    store.addToCart(store.products[0], 'CAT-AFTER-SKU')
    expect(await store.checkout()).toBe(true)
    const refundOrder = store.orders[0]
    refundOrder.status = '已完成'
    persistStorefrontOrderStatus(refundOrder.id, '已完成')
    expect(await store.requestStorefrontAfterSale(refundOrder.id, 'refund')).toBe(true)
    store.role = 'manager'
    expect(await store.completeStorefrontAfterSale(refundOrder.id)).toBe(false)
    expect(store.orders.find((item) => item.id === refundOrder.id)).toMatchObject({ status: '退款中' })
    expect(store.orders.find((item) => item.id === refundOrder.id)?.balanceRefunded).not.toBe(true)
    expect(Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === refundOrder.id)).toMatchObject({ status: 'processing' })
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)

    store.addToCart(store.products[0], 'CAT-AFTER-SKU')
    expect(await store.checkout()).toBe(true)
    const returnOrder = store.orders[0]
    returnOrder.status = '已完成'
    persistStorefrontOrderStatus(returnOrder.id, '已完成')
    expect(await store.requestStorefrontAfterSale(returnOrder.id, 'return')).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(await store.completeStorefrontAfterSale(returnOrder.id)).toBe(false)
    expect(store.orders.find((item) => item.id === returnOrder.id)).toMatchObject({ status: '退货中' })
    expect(store.orders.find((item) => item.id === returnOrder.id)?.inventoryReleased).not.toBe(true)
    expect(store.orders.find((item) => item.id === returnOrder.id)?.balanceRefunded).not.toBe(true)
    expect(Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === returnOrder.id)).toMatchObject({ status: 'processing' })
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
  })

  it('recovers a farmhouse order after stock was applied before local state persisted', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-RECOVER', name: '恢复商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-RECOVER', listed: true, retailPrice: 100 })
    const order = {
      id: 'SO-RECOVER', amount: 100, itemCount: 1, status: '待发货' as const, createdAt: '2026-08-24 12:00', pointsAwarded: 100,
      items: [{ productId: 'CAT-RECOVER', skuId: 'CAT-RECOVER-SKU', name: '恢复商品', skuName: '默认规格', image: '', quantity: 1, price: 100 }]
    }
    const inventoryChanges = [{ productId: 'CAT-RECOVER', skuId: 'CAT-RECOVER-SKU', quantity: -1 }]
    const balanceEntry = { id: 'SO-RECOVER:consume', type: 'consume' as const, amount: -100, balance: 400, description: '恢复订单消费', createdAt: '2026-08-24 12:00' }
    expect(prepareCatalogTransaction({ id: 'SO-RECOVER:reserve', channel: 'farmhouse', action: 'reserve', inventoryChanges, payload: { order, memberBalance: 400, memberPoints: 200, balanceEntry, cartItems: order.items } })).toBe(true)
    expect(applyCatalogStockOperation('SO-RECOVER:reserve', inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied('SO-RECOVER:reserve')).toBe(true)

    const store = useFarmhouseStore()
    store.$patch({ orders: [], member: { ...store.member, balance: 500, points: 100 }, balanceEntries: [] })
    await store.initialize(false, 'F001')

    expect(store.orders).toEqual([expect.objectContaining({ id: 'SO-RECOVER', status: '待发货' })])
    expect(store.member).toMatchObject({ balance: 400, points: 200 })
    expect(store.balanceEntries).toEqual([expect.objectContaining({ id: 'SO-RECOVER:consume' })])
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)
    expect(readPendingCatalogTransactions('farmhouse')).toEqual([])
  })

  it('replays cancellation refund, commission reversal and platform order snapshots during recovery', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-CANCEL-RECOVER', name: '取消恢复商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-CANCEL-RECOVER', listed: true, retailPrice: 100 })
    const order = {
      id: 'SO-CANCEL-RECOVER', amount: 100, itemCount: 1, status: '已取消' as const, createdAt: '2026-08-24 12:00',
      inventoryReleased: true, balanceRefunded: true, pointsAwarded: 100, platformOrderId: 'FH-SO-CANCEL-RECOVER',
      items: [{ productId: 'CAT-CANCEL-RECOVER', skuId: 'CAT-CANCEL-RECOVER-SKU', name: '取消恢复商品', skuName: '默认规格', image: '', quantity: 1, price: 100 }]
    }
    const platformOrder = {
      id: order.platformOrderId, productName: order.items[0].name, quantity: 1, amount: 100,
      customer: '游客', channel: 'shop' as const, status: 'unpaid-cancelled' as const, createdAt: order.createdAt, items: order.items
    }
    const shareRecord = {
      id: `SR-${order.id}`, userId: 'U1', orderId: order.id, orderAmount: 100, role: 'promoter' as const,
      promoterId: 'T001', rate: 5, amount: 5, status: 'reversed' as const, createdAt: order.createdAt
    }
    const balanceEntry = { id: `${order.id}:refund`, type: 'refund' as const, amount: 100, balance: 500, description: '商城订单取消退款', createdAt: order.createdAt }
    expect(writePlatformOrder({ ...platformOrder, status: 'pending' })).toBe(true)
    expect(writeShareRecord({ ...shareRecord, status: 'pending' })).toBe(true)
    const inventoryChanges = [{ productId: 'CAT-CANCEL-RECOVER', skuId: 'CAT-CANCEL-RECOVER-SKU', quantity: 1 }]
    expect(prepareCatalogTransaction({
      id: `${order.id}:release`, channel: 'farmhouse', action: 'release', inventoryChanges,
      payload: { order, memberBalance: 500, memberPoints: 100, balanceEntry, platformOrder, shareRecords: [shareRecord] }
    })).toBe(true)
    expect(applyCatalogStockOperation(`${order.id}:release`, inventoryChanges, 0)).toBeTruthy()
    expect(markCatalogTransactionStockApplied(`${order.id}:release`)).toBe(true)
    const store = useFarmhouseStore()
    store.$patch({ orders: [], member: { ...store.member, balance: 400, points: 200 }, balanceEntries: [] })

    await store.initialize(false, 'F001')

    expect(store.orders).toEqual([expect.objectContaining({ id: order.id, status: '已取消' })])
    expect(store.balanceEntries).toEqual([expect.objectContaining({ id: balanceEntry.id, type: 'refund' })])
    expect(readPlatformOrders()?.[platformOrder.id]?.status).toBe('unpaid-cancelled')
    expect(readShareRecords()?.find((record) => record.id === shareRecord.id)?.status).toBe('reversed')
    expect(readPendingCatalogTransactions('farmhouse')).toEqual([])
  })
})

describe('farmhouse per-product commission routing', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  async function checkoutMixedOrder(binding?: { promoterId?: string; staffAccountId?: string; status: 'pending' | 'bound' }) {
    seedCatalog([
      catalogProduct({ id: 'CAT-COM-1', name: '佣金商品一', promoterCommissionRate: 5, storeCommissionRate: 3 }),
      catalogProduct({
        id: 'CAT-COM-2',
        name: '佣金商品二',
        promoterCommissionRate: 10,
        storeCommissionRate: 4,
        skus: [{ id: 'CAT-COM-2-SKU', name: '默认规格', image: '/static/images/rice.webp', retailPrice: 50, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 }]
      })
    ])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-COM-1', listed: true, retailPrice: 100 })
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-COM-2', listed: true, retailPrice: 50 })
    if (binding) localStorage.setItem('agritainment-platform-bindings', JSON.stringify({ U1: { userId: 'U1', ...binding } }))
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.currentUserId = 'U1'
    store.member.balance = 500
    store.addToCart(store.products.find((item) => item.id === 'CAT-COM-1')!, 'CAT-COM-1-SKU')
    const second = store.products.find((item) => item.id === 'CAT-COM-2')!
    store.addToCart(second, 'CAT-COM-2-SKU')
    store.changeCart(second.id, 'CAT-COM-2-SKU', 1)
    expect(await store.checkout()).toBe(true)
    return JSON.parse(localStorage.getItem('agritainment-platform-shares') || '[]') as Array<Record<string, unknown>>
  }

  it('pays only the promoter commission when the customer is bound to a promoter', async () => {
    const shares = await checkoutMixedOrder({ promoterId: 'T001', status: 'pending' })
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({ role: 'promoter', promoterId: 'T001', orderAmount: 200, amount: 15, rate: 7.5 })
  })

  it('pays the product store commission to the bound promotion staff account', async () => {
    const shares = await checkoutMixedOrder({ staffAccountId: 'SA002', status: 'bound' })
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({ role: 'staff', staffAccountId: 'SA002', orderAmount: 200, amount: 7, rate: 3.5 })
  })

  it('pays the product store commission to the current store owner without a referrer', async () => {
    const shares = await checkoutMixedOrder()
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({ role: 'staff', staffAccountId: 'SA001', orderAmount: 200, amount: 7, rate: 3.5 })
  })
})

describe('farmhouse after-sale transactions', () => {
  const localStateKey = 'agritainment-platform-farmhouse-commerce'

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  async function createAfterSale(type: 'refund' | 'return') {
    seedCatalog([catalogProduct({ id: `AFTER-${type}`, name: `售后-${type}` })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: `AFTER-${type}`, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.member.points = 100
    const product = store.products.find((item) => item.id === `AFTER-${type}`)!
    store.addToCart(product, `${product.id}-SKU`)
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    persistStorefrontOrderStatus(order.id, '已完成')
    expect(await store.requestStorefrontAfterSale(order.id, type)).toBe(true)
    store.role = 'manager'
    return { store, order }
  }

  it.each([
    ['local snapshot', localStateKey],
    ['after-sale', PLATFORM_AFTERSALES_STORAGE_KEY],
    ['shares', PLATFORM_SHARES_STORAGE_KEY],
    ['platform orders', PLATFORM_ORDERS_STORAGE_KEY]
  ])('keeps every refund snapshot unchanged when %s persistence fails', async (_label, failedKey) => {
    const { store, order } = await createAfterSale('refund')
    const before = {
      order: cloneSeed(order), member: cloneSeed(store.member), entries: cloneSeed(store.balanceEntries),
      afterSales: readPlatformAfterSales(), shares: readShareRecords(), platformOrders: readPlatformOrders(), localState: localStorage.getItem(localStateKey)
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === failedKey) throw new Error(`${failedKey} unavailable`)
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(order).toEqual(before.order)
    expect(store.member).toEqual(before.member)
    expect(store.balanceEntries).toEqual(before.entries)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readShareRecords()).toEqual(before.shares)
    expect(readPlatformOrders()).toEqual(before.platformOrders)
    expect(localStorage.getItem(localStateKey)).toBe(before.localState)
  })

  it.each([
    ['local snapshot', localStateKey],
    ['catalog', PLATFORM_CATALOG_STORAGE_KEY],
    ['after-sale', PLATFORM_AFTERSALES_STORAGE_KEY],
    ['shares', PLATFORM_SHARES_STORAGE_KEY],
    ['platform orders', PLATFORM_ORDERS_STORAGE_KEY]
  ])('keeps every return snapshot unchanged when %s persistence fails', async (_label, failedKey) => {
    const { store, order } = await createAfterSale('return')
    const before = {
      order: cloneSeed(order), member: cloneSeed(store.member), entries: cloneSeed(store.balanceEntries), catalog: readCatalogState(),
      afterSales: readPlatformAfterSales(), shares: readShareRecords(), platformOrders: readPlatformOrders(), localState: localStorage.getItem(localStateKey)
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === failedKey) throw new Error(`${failedKey} unavailable`)
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(order).toEqual(before.order)
    expect(store.member).toEqual(before.member)
    expect(store.balanceEntries).toEqual(before.entries)
    expect(readCatalogState()).toEqual(before.catalog)
    expect(readPlatformAfterSales()).toEqual(before.afterSales)
    expect(readShareRecords()).toEqual(before.shares)
    expect(readPlatformOrders()).toEqual(before.platformOrders)
    expect(localStorage.getItem(localStateKey)).toBe(before.localState)
  })

  it('does not create a local financial transaction when the legacy completion action is called', async () => {
    const { store, order } = await createAfterSale('return')
    const beforeCatalog = readCatalogState()
    const operationId = `${order.id}:after-sale-return`
    expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    expect(readCatalogState()).toEqual(beforeCatalog)
    expect(readPlatformRecoveryQueue().find((item) => item.operationId === operationId)).toBeUndefined()
    expect(readPlatformJournal()[operationId]).toBeUndefined()
    expect(readCatalogTransactionJournal()[operationId]).toBeUndefined()
  })

  it('does not touch the recovery queue when the legacy completion action is called', async () => {
    const { store, order } = await createAfterSale('refund')
    const beforeOrder = cloneSeed(order)
    const beforeMember = cloneSeed(store.member)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === localStateKey || key === PLATFORM_RECOVERY_QUEUE_STORAGE_KEY) throw new Error('recovery unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(readPlatformRecoveryQueue()).toEqual([])
    expect(order).toEqual(beforeOrder)
    expect(store.member).toEqual(beforeMember)
  })

  it('does not replay a catalog after-sale operation whose platform journal is aborted during initialize', async () => {
    seedCatalog([catalogProduct({ id: 'NO-REPLAY', name: '不重放商品' })])
    const order = { id: 'SO-NO-REPLAY', amount: 100, itemCount: 1, status: '已退货' as const, createdAt: '2026-08-24 12:00', inventoryReleased: true, balanceRefunded: true, items: [{ productId: 'NO-REPLAY', skuId: 'NO-REPLAY-SKU', name: '不重放商品', skuName: '默认规格', image: '', quantity: 1, price: 100 }] }
    const operationId = `${order.id}:after-sale-return`
    expect(prepareCatalogTransaction({ id: operationId, channel: 'farmhouse', action: 'release', inventoryChanges: [{ productId: 'NO-REPLAY', skuId: 'NO-REPLAY-SKU', quantity: 1 }], payload: { order, memberBalance: 500, memberPoints: 0 } })).toBe(true)
    const snapshot = { variant: 'after-sale-return', farmId: 'F001', localState: {}, catalog: readCatalogState(), afterSales: {}, shares: [], platformOrders: {} }
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original: snapshot, target: snapshot, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'aborted')).toBe(true)

    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(10)
    expect(readCatalogTransactionJournal()[operationId].status).toBe('prepared')
  })

  it('does not read or rewrite after-sale collections from the legacy completion action', async () => {
    const { store, order } = await createAfterSale('refund')
    const beforeOrder = cloneSeed(order)
    const beforeAfterSales = cloneSeed(readPlatformAfterSales())
    const originalGetItem = localStorage.getItem.bind(localStorage)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let injected = false
    localStorage.getItem = ((key: string) => {
      const value = originalGetItem(key)
      if (!injected && key === PLATFORM_AFTERSALES_STORAGE_KEY && value) {
        injected = true
        const concurrent = JSON.parse(value) as Record<string, { issue?: string }>
        const workId = Object.keys(concurrent)[0]
        concurrent[workId] = { ...concurrent[workId], issue: 'CONCURRENT-WRITE' }
        originalSetItem(key, JSON.stringify(concurrent))
        const revisionKey = `${key}:revision`
        originalSetItem(revisionKey, JSON.stringify(Number(originalGetItem(revisionKey) || '0') + 1))
      }
      return value
    }) as Storage['getItem']
    try {
      expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    } finally {
      localStorage.getItem = originalGetItem
    }
    expect(order).toEqual(beforeOrder)
    expect(readPlatformAfterSales()).toEqual(beforeAfterSales)
  })

  it('never retries a return from the farmhouse portal after a transient storage failure', async () => {
    const { store, order } = await createAfterSale('return')
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_ORDERS_STORAGE_KEY) { failed = true; throw new Error('transient platform order failure') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    localStorage.setItem = originalSetItem

    expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)
    expect(store.orders.find((item) => item.id === order.id)).toMatchObject({ status: '退货中' })
    expect(store.orders.find((item) => item.id === order.id)?.inventoryReleased).not.toBe(true)
    expect(store.orders.find((item) => item.id === order.id)?.balanceRefunded).not.toBe(true)
    expect(readPlatformJournal()[`${order.id}:after-sale-return`]).toBeUndefined()
    expect(readCatalogTransactionJournal()[`${order.id}:after-sale-return`]).toBeUndefined()
  })

  it('leaves a newer persisted farm shadow untouched when the legacy completion action is called', async () => {
    const { store, order } = await createAfterSale('refund')
    const externalEntry = { id: 'BL-EXTERNAL', type: 'recharge' as const, amount: 400, balance: 900, description: '其它终端充值', createdAt: '2026-08-30 12:00' }
    const requestedOrder = store.orders.find((item) => item.id === order.id)!
    const otherOrder = { ...cloneSeed(requestedOrder), id: 'SO-EXTERNAL', status: '待发货' as const, afterSaleType: undefined }
    const shadowOrder = cloneSeed(requestedOrder)
    expect(writePlatformJson(localStateKey, { F001: { orders: [otherOrder, shadowOrder], memberBalance: 900, memberPoints: 250, balanceEntries: [externalEntry] } })).toBe(true)
    const beforeMember = cloneSeed(store.member)

    expect(await store.completeStorefrontAfterSale(order.id)).toBe(false)

    const persisted = JSON.parse(localStorage.getItem(localStateKey) || '{}').F001
    expect(persisted.memberBalance).toBe(900)
    expect(persisted.memberPoints).toBe(250)
    expect(persisted.orders.map((item: { id: string }) => item.id)).toEqual(['SO-EXTERNAL', order.id])
    expect(persisted.balanceEntries).toEqual([externalEntry])
    expect(store.member).toEqual(beforeMember)
  })

  it('preserves a newer farm shadow when requesting after-sale and records an owned transaction', async () => {
    seedCatalog([catalogProduct({ id: 'REQUEST-SHADOW', name: '申请售后商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'REQUEST-SHADOW', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    const product = store.products.find((item) => item.id === 'REQUEST-SHADOW')!
    store.addToCart(product, 'REQUEST-SHADOW-SKU')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    const externalEntry = { id: 'BL-REQUEST-EXTERNAL', type: 'recharge' as const, amount: 500, balance: 900, description: '另一终端充值', createdAt: '2026-08-30 13:00' }
    const otherOrder = { ...cloneSeed(order), id: 'SO-REQUEST-OTHER', status: '待发货' as const }
    const persistedOrder = { ...cloneSeed(order), status: '已完成' as const }
    expect(writePlatformJson(localStateKey, { F001: { orders: [otherOrder, persistedOrder], memberBalance: 900, memberPoints: 321, balanceEntries: [externalEntry] } })).toBe(true)

    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(true)

    const persisted = JSON.parse(localStorage.getItem(localStateKey) || '{}').F001
    expect(persisted).toMatchObject({ memberBalance: 900, memberPoints: 321, balanceEntries: [externalEntry] })
    expect(persisted.orders.map((item: { id: string }) => item.id)).toEqual(['SO-REQUEST-OTHER', order.id])
    expect(persisted.orders[1]).toMatchObject({ status: '退款中', afterSaleType: 'refund' })
    expect(readPlatformJournal()[`${order.id}:after-sale-request-refund`]).toMatchObject({ status: 'committed', recoveryHandlerKey: 'farmhouse-commerce-recovery-v1' })
  })

  it('rejects an after-sale request when only Pinia says the order is completed', async () => {
    seedCatalog([catalogProduct({ id: 'REQUEST-PERSISTED-STATUS', name: '持久化状态商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'REQUEST-PERSISTED-STATUS', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    const product = store.products.find((item) => item.id === 'REQUEST-PERSISTED-STATUS')!
    store.addToCart(product, 'REQUEST-PERSISTED-STATUS-SKU')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    const localBefore = cloneSeed(JSON.parse(localStorage.getItem(localStateKey) || '{}'))
    const afterSalesBefore = cloneSeed(readPlatformAfterSales())
    const journalBefore = cloneSeed(readPlatformJournal())

    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(false)

    expect(JSON.parse(localStorage.getItem(localStateKey) || '{}')).toEqual(localBefore)
    expect(readPlatformAfterSales()).toEqual(afterSalesBefore)
    expect(readPlatformJournal()).toEqual(journalBefore)
  })

  it('rolls back checkout collections and leaves Pinia untouched when the local shadow write fails', async () => {
    seedCatalog([catalogProduct({ id: 'CHECKOUT-SHADOW-FAIL', name: '下单影子失败商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CHECKOUT-SHADOW-FAIL', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.currentUserId = 'U-CHECKOUT-SHADOW-FAIL'
    expect(upsertUserBinding({ userId: store.currentUserId, promoterId: 'T001', status: 'pending' })).toBe(true)
    const product = store.products.find((item) => item.id === 'CHECKOUT-SHADOW-FAIL')!
    store.addToCart(product, 'CHECKOUT-SHADOW-FAIL-SKU')
    const persistedBefore = {
      catalog: cloneSeed(readCatalogState()),
      orders: cloneSeed(readPlatformOrders()),
      shares: cloneSeed(readShareRecords()),
      bindings: cloneSeed(readUserBindings())
    }
    const piniaBefore = {
      orders: cloneSeed(store.orders), member: cloneSeed(store.member), entries: cloneSeed(store.balanceEntries), cart: cloneSeed(store.cart)
    }
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === localStateKey) throw new Error('local shadow unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.checkout()).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(readCatalogState()).toEqual(persistedBefore.catalog)
    expect(Object.values(readPlatformOrders() || {})).toHaveLength(Object.values(persistedBefore.orders || {}).length)
    expect(readShareRecords()).toEqual(persistedBefore.shares)
    expect(readUserBindings()).toEqual(persistedBefore.bindings)
    expect({ orders: store.orders, member: store.member, entries: store.balanceEntries, cart: store.cart }).toEqual(piniaBefore)
    const failedCheckoutJournal = Object.values(readPlatformJournal()).find((entry) => (entry.original as { variant?: string }).variant === 'checkout')
    expect(failedCheckoutJournal?.status).toBe('aborted')
    expect(readPlatformRecoveryQueue().some((task) => task.operationId === failedCheckoutJournal?.operationId)).toBe(false)

    expect(await store.checkout()).toBe(true)
    expect(store.orders).toHaveLength(piniaBefore.orders.length + 1)
    expect(Object.values(readPlatformOrders() || {})).toHaveLength(Object.values(persistedBefore.orders || {}).length)
    expect((readShareRecords() || []).filter((item) => item.orderId === store.orders[0].id)).toHaveLength(1)
  })

  it.each([
    ['catalog step', PLATFORM_CATALOG_STORAGE_KEY],
    ['platform-order step', PLATFORM_ORDERS_STORAGE_KEY]
  ])('removes a first-checkout farm key after the %s fails and preserves other farms', async (_label, failedKey) => {
    const productId = `FIRST-CHECKOUT-${failedKey}`
    seedCatalog([catalogProduct({ id: productId, name: '首单回滚商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId, listed: true, retailPrice: 100 })).toBe(true)
    const otherFarmState = { F002: { orders: [], memberBalance: 321, memberPoints: 45, balanceEntries: [] } }
    expect(writePlatformJson(localStateKey, otherFarmState)).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products.find((item) => item.id === productId)!, `${productId}-SKU`)
    const setItem = localStorage.setItem.bind(localStorage)
    let localStepApplied = false
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (key === localStateKey) localStepApplied = true
      if (localStepApplied && !failed && key === failedKey) {
        failed = true
        throw new Error(`${failedKey} unavailable after local step`)
      }
      setItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.checkout()).toBe(false)
    } finally {
      localStorage.setItem = setItem
    }

    expect(localStepApplied).toBe(true)
    expect(JSON.parse(localStorage.getItem(localStateKey) || '{}')).toEqual(otherFarmState)
    expect(JSON.parse(localStorage.getItem(localStateKey) || '{}')).not.toHaveProperty('F001')
  })

  it('does not prepare a catalog transaction until the catalog journal lock is acquired', async () => {
    const productId = 'CHECKOUT-CATALOG-JOURNAL-LOCK'
    seedCatalog([catalogProduct({ id: productId, name: '交错锁商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId, listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products.find((item) => item.id === productId)!, `${productId}-SKU`)
    let releaseLock!: () => void
    let signalLocked!: () => void
    const locked = new Promise<void>((resolve) => { signalLocked = resolve })
    const holder = runLockedPlatformCollectionTask({
      collections: [PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY],
      execute: async () => {
        signalLocked()
        await new Promise<void>((resolve) => { releaseLock = resolve })
        return true
      }
    })
    await locked
    const checkout = store.checkout()
    const preparedWhileLocked = Object.values(readCatalogTransactionJournal()).some((entry) => entry.channel === 'farmhouse')
    releaseLock()
    await holder
    const result = await checkout

    expect(preparedWhileLocked).toBe(false)
    expect(result).toBe(true)
    const operationId = Object.values(readPlatformJournal()).find((entry) => (entry.original as { variant?: string }).variant === 'checkout')!.operationId
    expect(readPlatformJournal()[operationId].collections).toContain(PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY)
  })

  it('retries an after-sale request directly after a transient after-sale write failure', async () => {
    seedCatalog([catalogProduct({ id: 'REQUEST-RETRY', name: '申请重试商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'REQUEST-RETRY', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    const product = store.products.find((item) => item.id === 'REQUEST-RETRY')!
    store.addToCart(product, 'REQUEST-RETRY-SKU')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    persistStorefrontOrderStatus(order.id, '已完成')
    expect(writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, {})).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_AFTERSALES_STORAGE_KEY) { failed = true; throw new Error('transient after-sale failure') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(false)
    localStorage.setItem = originalSetItem

    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(true)
    expect(readPlatformJournal()[`${order.id}:after-sale-request-refund`].status).toBe('committed')
    expect(store.orders.find((item) => item.id === order.id)).toMatchObject({ status: '退款中', afterSaleType: 'refund' })
  })

  it('queues a recoverable request rollback and does not replay its target during initialize', async () => {
    seedCatalog([catalogProduct({ id: 'REQUEST-RECOVERY', name: '申请恢复商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'REQUEST-RECOVERY', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    const product = store.products.find((item) => item.id === 'REQUEST-RECOVERY')!
    store.addToCart(product, 'REQUEST-RECOVERY-SKU')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    persistStorefrontOrderStatus(order.id, '已完成')
    expect(writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, {})).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_AFTERSALES_STORAGE_KEY) throw new Error('after-sale unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(false)
    localStorage.setItem = originalSetItem
    const operationId = `${order.id}:after-sale-request-refund`
    expect(readPlatformJournal()[operationId].status).toBe('recovery-pending')
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!

    setActivePinia(createPinia())
    const reloaded = useFarmhouseStore()
    await reloaded.initialize(false, 'F001')
    expect(reloaded.orders.find((item) => item.id === order.id)).not.toMatchObject({ status: '退款中', afterSaleType: 'refund' })
    expect(Object.values(readPlatformAfterSales() || {}).some((item) => item.orderId === order.id)).toBe(false)
    expect(readPlatformJournal()[operationId].status).toBe('recovery-pending')

    expect(await retryPlatformRecoveryTask(task.id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readPlatformJournal()[operationId].status).toBe('aborted')
  })

  it('surfaces a fatal request error when recovery queue persistence fails', async () => {
    seedCatalog([catalogProduct({ id: 'REQUEST-FATAL', name: '申请致命恢复商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'REQUEST-FATAL', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    const product = store.products.find((item) => item.id === 'REQUEST-FATAL')!
    store.addToCart(product, 'REQUEST-FATAL-SKU')
    expect(await store.checkout({ deliveryMode: 'courier', addressId: createCheckoutAddress(store).id })).toBe(true)
    const order = store.orders[0]
    order.status = '已完成'
    persistStorefrontOrderStatus(order.id, '已完成')
    expect(writePlatformJson(PLATFORM_AFTERSALES_STORAGE_KEY, {})).toBe(true)
    const before = cloneSeed(store.orders)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_AFTERSALES_STORAGE_KEY || key === PLATFORM_RECOVERY_QUEUE_STORAGE_KEY) throw new Error('recovery unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.requestStorefrontAfterSale(order.id, 'refund')).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }
    expect(store.checkoutError).toBe('售后申请事务恢复失败，请联系平台处理')
    expect(store.orders).toEqual(before)
  })

  it('rejects a voucher recovery journal with a cross-farm ledger delta', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-CROSS-LEDGER', userId: 'U1', promoterId: 'T001', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    const original = { variant: 'voucher', farmId: 'F001', vouchers: { [voucher.id]: voucher }, ledger: {} }
    const target = { variant: 'voucher', farmId: 'F001', vouchers: { [voucher.id]: { ...voucher, status: 'redeemed' as const, redeemedAt: '2026-08-30 12:00' } }, ledger: { [`${voucher.id}:commission`]: { id: `${voucher.id}:commission`, sourceOrderId: voucher.id, beneficiaryType: 'promoter' as const, beneficiaryId: 'T001', farmId: 'F002', role: 'promoter', amount: 14.4, status: 'available' as const, createdAt: voucher.createdAt } } }
    const operationId = 'FARMHOUSE-CROSS-LEDGER'
    expect(preparePlatformJournal({ operationId, collections: [PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'cross farm ledger', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects an after-sale recovery journal with a share for another order', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const order = { id: 'SO-SHARE-SCOPE', amount: 100, itemCount: 1, status: '退款中' as const, createdAt: '2026-08-24 12:00', afterSaleType: 'refund' as const, items: [{ productId: 'P007', skuId: 'P007-4P', name: '商品', skuName: '规格', image: '', quantity: 1, price: 100 }] }
    const original = { variant: 'after-sale-refund', farmId: 'F001', localState: {}, afterSales: readPlatformAfterSales(), shares: readShareRecords() || [], platformOrders: readPlatformOrders() || {} }
    const target = { ...original, localState: { F001: { orders: [order], memberBalance: 100, memberPoints: 0, balanceEntries: [] } }, afterSales: { AS: { id: 'AS', orderId: order.id, productName: '商品', applicant: '用户', type: 'refund' as const, amount: 100, status: 'refunded' as const } }, shares: [{ id: 'SR-CROSS', userId: 'U2', orderId: 'SO-OTHER', orderAmount: 100, role: 'promoter' as const, promoterId: 'T2', rate: 5, amount: 5, status: 'reversed' as const, createdAt: '2026-08-30 12:00' }] }
    const operationId = 'FARMHOUSE-CROSS-SHARE'
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'cross order share', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects an after-sale recovery journal that forges the beneficiary and amount of the same-order share', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const order = { id: 'SO-SHARE-FINANCE', amount: 100, itemCount: 1, status: '退款中' as const, createdAt: '2026-08-24 12:00', afterSaleType: 'refund' as const, items: [{ productId: 'P007', skuId: 'P007-4P', name: '商品', skuName: '规格', image: '', quantity: 1, price: 100 }] }
    const finalOrder = { ...order, status: '已退款' as const, balanceRefunded: true }
    const share = { id: 'SR-FINANCE', userId: 'U1', orderId: order.id, orderAmount: 100, role: 'promoter' as const, promoterId: 'T001', rate: 5, amount: 5, status: 'pending' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformJson(localStateKey, { F001: { orders: [order], memberBalance: 0, memberPoints: 0, balanceEntries: [] } })).toBe(true)
    expect(writeShareRecord(share)).toBe(true)
    const original = { variant: 'after-sale-refund', farmId: 'F001', localState: { F001: { orders: [order], memberBalance: 0, memberPoints: 0, balanceEntries: [] } }, afterSales: readPlatformAfterSales(), shares: readShareRecords() || [], platformOrders: readPlatformOrders() || {} }
    const target = { ...original, localState: { F001: { orders: [finalOrder], memberBalance: 100, memberPoints: 0, balanceEntries: [] } }, afterSales: { AS: { id: 'AS', orderId: order.id, productName: '商品', applicant: '用户', type: 'refund' as const, amount: 100, status: 'refunded' as const } }, shares: [{ ...share, promoterId: 'T-EVIL', amount: 999, status: 'reversed' as const }] }
    const operationId = `${order.id}:after-sale-refund`
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'forged share finance', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it.each([
    ['duplicate share ids', (share: Record<string, unknown>) => [{ ...share, status: 'reversed' }, { ...share, status: 'reversed' }]],
    ['settled pending reversal', (share: Record<string, unknown>) => [{ ...share, status: 'reversed', settled: true }]]
  ])('rejects an after-sale recovery journal with %s', async (_label, buildShares) => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const order = { id: `SO-SHARE-${_label}`, amount: 100, itemCount: 1, status: '退款中' as const, createdAt: '2026-08-24 12:00', afterSaleType: 'refund' as const, items: [{ productId: 'P007', skuId: 'P007-4P', name: '商品', skuName: '规格', image: '', quantity: 1, price: 100 }] }
    const finalOrder = { ...order, status: '已退款' as const, balanceRefunded: true }
    const share = { id: `SR-${order.id}`, userId: 'U1', orderId: order.id, orderAmount: 100, role: 'promoter' as const, promoterId: 'T001', rate: 5, amount: 5, status: 'pending' as const, settled: false, createdAt: '2026-08-24 12:00' }
    const local = { F001: { orders: [order], memberBalance: 0, memberPoints: 0, balanceEntries: [] } }
    expect(writePlatformJson(localStateKey, local)).toBe(true)
    expect(writeShareRecord(share)).toBe(true)
    const original = { variant: 'after-sale-refund', farmId: 'F001', localState: local, afterSales: { AS: { id: 'AS', orderId: order.id, productName: '商品', applicant: '用户', type: 'refund' as const, amount: 100, status: 'processing' as const } }, shares: readShareRecords() || [], platformOrders: {} }
    const target = { ...original, localState: { F001: { ...local.F001, orders: [finalOrder], memberBalance: 100 } }, afterSales: { AS: { ...original.afterSales.AS, status: 'refunded' as const } }, shares: buildShares(share) }
    const operationId = `${order.id}:after-sale-refund`
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: String(_label), handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects one return journal that changes a second order and its SKU', async () => {
    seedCatalog([catalogProduct({ id: 'ONE-ORDER', name: '订单一' }), catalogProduct({ id: 'SECOND-ORDER', name: '订单二' })])
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const makeOrder = (id: string, productId: string) => ({ id, amount: 100, itemCount: 1, status: '退货中' as const, createdAt: '2026-08-24 12:00', afterSaleType: 'return' as const, items: [{ productId, skuId: `${productId}-SKU`, name: productId, skuName: '默认规格', image: '', quantity: 1, price: 100 }] })
    const first = makeOrder('SO-ONE-ORDER', 'ONE-ORDER')
    const second = makeOrder('SO-SECOND-ORDER', 'SECOND-ORDER')
    const local = { F001: { orders: [first, second], memberBalance: 0, memberPoints: 0, balanceEntries: [] } }
    expect(writePlatformJson(localStateKey, local)).toBe(true)
    const catalog = readCatalogState()!
    const nextCatalog = cloneSeed(catalog)
    nextCatalog.products.forEach((product) => { product.skus[0].stock += 1 })
    nextCatalog.revision += 1
    const changes = [first, second].flatMap((item) => item.items.map(({ productId, skuId, quantity }) => ({ productId, skuId, quantity })))
    const operationId = `${first.id}:after-sale-return`
    nextCatalog.appliedOperations ||= {}
    nextCatalog.appliedOperations[operationId] = { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes }), changes: [], appliedAt: '2026-08-30T13:00:00.000Z' }
    const original = { variant: 'after-sale-return', farmId: 'F001', localState: local, catalog, afterSales: readPlatformAfterSales(), shares: readShareRecords() || [], platformOrders: readPlatformOrders() || {} }
    const target = { ...original, localState: { F001: { ...local.F001, orders: [first, second].map((item) => ({ ...item, status: '已退货' as const, balanceRefunded: true, inventoryReleased: true })) } }, catalog: nextCatalog, afterSales: { AS1: { id: 'AS1', orderId: first.id, productName: '订单一', applicant: '用户', type: 'return' as const, amount: 100, status: 'refunded' as const }, AS2: { id: 'AS2', orderId: second.id, productName: '订单二', applicant: '用户', type: 'return' as const, amount: 100, status: 'refunded' as const } } }
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'second order injection', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('rejects a return recovery journal whose catalog delta changes an unrelated SKU', async () => {
    seedCatalog([catalogProduct({ id: 'SCOPE-ORDER', name: '目标商品' }), catalogProduct({ id: 'SCOPE-OTHER', name: '其它商品' })])
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const order = { id: 'SO-CATALOG-SCOPE', amount: 100, itemCount: 1, status: '退货中' as const, createdAt: '2026-08-24 12:00', afterSaleType: 'return' as const, items: [{ productId: 'SCOPE-ORDER', skuId: 'SCOPE-ORDER-SKU', name: '目标商品', skuName: '默认规格', image: '', quantity: 1, price: 100 }] }
    const catalog = readCatalogState()!
    const nextCatalog = cloneSeed(catalog)
    nextCatalog.products.find((item) => item.id === 'SCOPE-OTHER')!.skus[0].stock += 1
    nextCatalog.revision += 1
    const original = { variant: 'after-sale-return', farmId: 'F001', localState: {}, catalog, afterSales: readPlatformAfterSales(), shares: readShareRecords() || [], platformOrders: readPlatformOrders() || {} }
    const target = { ...original, localState: { F001: { orders: [order], memberBalance: 100, memberPoints: 0, balanceEntries: [] } }, catalog: nextCatalog, afterSales: { AS: { id: 'AS', orderId: order.id, productName: '目标商品', applicant: '用户', type: 'return' as const, amount: 100, status: 'refunded' as const } } }
    const operationId = 'FARMHOUSE-CROSS-CATALOG'
    expect(preparePlatformJournal({ operationId, collections: [localStateKey, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY], original, target, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'cross sku catalog', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })
})

describe('farmhouse checkout recovery direction', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  async function checkoutWithOwnedJournal() {
    seedCatalog([catalogProduct({ id: 'RECOVERY-DIRECTION', name: '恢复方向商品' })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'RECOVERY-DIRECTION', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.addToCart(store.products[0], 'RECOVERY-DIRECTION-SKU')
    expect(await store.checkout()).toBe(true)
    const operationId = Object.keys(readPlatformJournal()).find((id) => id.endsWith(':checkout'))!
    expect(readPlatformJournal()[operationId]).toMatchObject({ status: 'committed', recoveryHandlerKey: 'farmhouse-commerce-recovery-v1' })
    return { operationId, orderId: store.orders[0].id }
  }

  it('retries a committed no-binding-delta checkout to its target snapshot', async () => {
    const { operationId, orderId } = await checkoutWithOwnedJournal()
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'committed retry', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)
    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readPlatformJournal()[operationId].status).toBe('committed')
    expect(JSON.parse(localStorage.getItem('agritainment-platform-farmhouse-commerce') || '{}').F001.orders[0].id).toBe(orderId)
  })

  it('retries a recovery-pending no-binding-delta checkout to its original snapshot', async () => {
    const { operationId } = await checkoutWithOwnedJournal()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({ ...readPlatformJournal(), [operationId]: { ...readPlatformJournal()[operationId], status: 'recovery-pending' } }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'pending retry', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)
    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readPlatformJournal()[operationId].status).toBe('aborted')
    expect(JSON.parse(localStorage.getItem('agritainment-platform-farmhouse-commerce') || '{}').F001).toBeUndefined()
  })

  it('rejects a committed zero-commission checkout that leaves a pending customer unbound', async () => {
    seedCatalog([catalogProduct({ id: 'RECOVERY-ZERO-COMMISSION', name: '零佣金恢复商品', promoterCommissionRate: 0, storeCommissionRate: 0 })])
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: 'RECOVERY-ZERO-COMMISSION', listed: true, retailPrice: 100 })).toBe(true)
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.member.balance = 500
    store.currentUserId = 'U-RECOVERY-ZERO-COMMISSION'
    expect(upsertUserBinding({ userId: store.currentUserId, promoterId: 'T001', status: 'pending' })).toBe(true)
    store.addToCart(store.products[0], 'RECOVERY-ZERO-COMMISSION-SKU')
    expect(await store.checkout()).toBe(true)
    expect(readUserBindings()?.[store.currentUserId]?.status).toBe('bound')
    expect(readShareRecords() || []).toHaveLength(0)
    const operationId = Object.keys(readPlatformJournal()).find((id) => id.endsWith(':checkout'))!
    const journal = cloneSeed(readPlatformJournal()[operationId])
    const target = journal.target as { bindings: Record<string, { status: string }> }
    const original = journal.original as { bindings: Record<string, { status: string }> }
    target.bindings[store.currentUserId] = cloneSeed(original.bindings[store.currentUserId])
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({ ...readPlatformJournal(), [operationId]: journal }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'test', reason: 'forged pending binding', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'committed')).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
    expect(readUserBindings()?.[store.currentUserId]?.status).toBe('bound')
  })
})

describe('farmhouse voucher redemption', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('keeps voucher and commission unchanged when ledger revision changes after locking starts', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-LOCK-CONFLICT', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: `${voucher.id}:commission`, sourceOrderId: voucher.id, beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: voucher.createdAt })).toBe(true)
    const externalEntry = { id: 'LEDGER-LOCK-CONFLICT', sourceOrderId: 'SO-EXTERNAL', beneficiaryType: 'promoter' as const, beneficiaryId: 'T-EXTERNAL', role: 'promoter' as const, amount: 1, status: 'pending' as const, createdAt: '2026-08-30T10:00:00.000Z' }
    let injected = false
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => {
      if (!injected) {
        injected = true
        expect(writePlatformCommissionLedgerEntry(externalEntry)).toBe(true)
      }
      return callback()
    } } })

    expect(await store.redeemVoucher(voucher.id)).toBe(false)

    expect(readPlatformVoucherOrders()?.[voucher.id]).toEqual(voucher)
    expect(readPlatformCommissionLedger()?.[`${voucher.id}:commission`]?.status).toBe('pending')
    expect(readPlatformCommissionLedger()?.[externalEntry.id]).toEqual(externalEntry)
  })

  it('redeems and refunds a shared voucher order with ledger side effects', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-TEST', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: 'V-TEST:commission', sourceOrderId: 'V-TEST', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: '2026-08-24 12:00' })).toBe(true)

    expect(await store.redeemVoucher('V-TEST')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V-TEST']?.status).toBe('redeemed')
    expect(readPlatformCommissionLedger()?.['V-TEST:commission']?.status).toBe('available')

    expect(await store.refundVoucher('V-TEST')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V-TEST']?.status).toBe('refunded')
    expect(Object.values(readPlatformCommissionLedger() || {}).some((item) => item.reversalOf === 'V-TEST:commission' && item.status === 'reversed')).toBe(true)
  })

  it('records owned recovery snapshots for voucher redemption and refund', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-OWNED', userId: 'U1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: 'V-OWNED:commission', sourceOrderId: 'V-OWNED', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: voucher.createdAt })).toBe(true)

    expect(await store.redeemVoucher(voucher.id)).toBe(true)
    expect(readPlatformJournal()[`farmhouse-voucher:${voucher.id}:redeem`]).toMatchObject({ status: 'committed', recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })
    expect(await store.refundVoucher(voucher.id)).toBe(true)
    expect(readPlatformJournal()[`farmhouse-voucher:${voucher.id}:refund`]).toMatchObject({ status: 'committed', recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })
  })

  it('rolls back voucher redemption when commission persistence fails', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-REDEEM-FAIL', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: 'V-REDEEM-FAIL:commission', sourceOrderId: 'V-REDEEM-FAIL', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: voucher.createdAt })).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-commission-ledger') throw new Error('ledger write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.redeemVoucher(voucher.id)).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readPlatformVoucherOrders()?.[voucher.id]).toMatchObject({ status: 'paid', createdAt: voucher.createdAt })
    expect(readPlatformCommissionLedger()?.[voucher.id + ':commission']?.status).toBe('pending')
  })

  it('rolls back voucher refund when commission reversal persistence fails', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-REFUND-FAIL', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'redeemed' as const, createdAt: '2026-08-24 12:00', redeemedAt: '2026-08-24 13:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: 'V-REFUND-FAIL:commission', sourceOrderId: 'V-REFUND-FAIL', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'available', createdAt: voucher.createdAt })).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === 'agritainment-platform-commission-ledger') throw new Error('ledger write failed')
      originalSetItem(key, value)
    }) as Storage['setItem']
    expect(await store.refundVoucher(voucher.id)).toBe(false)
    localStorage.setItem = originalSetItem
    expect(readPlatformVoucherOrders()?.[voucher.id]).toMatchObject({ status: 'redeemed', redeemedAt: voucher.redeemedAt })
    expect(readPlatformCommissionLedger()?.[voucher.id + ':commission']?.status).toBe('available')
  })

  it('keeps voucher operations idempotent for repeated redemption and refund', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-IDEMPOTENT', userId: 'U1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: voucher.id + ':commission', sourceOrderId: voucher.id, beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: voucher.createdAt })).toBe(true)
    expect(await store.redeemVoucher(voucher.id)).toBe(true)
    expect(await store.redeemVoucher(voucher.id)).toBe(false)
    expect(await store.refundVoucher(voucher.id)).toBe(true)
    expect(await store.refundVoucher(voucher.id)).toBe(false)
    expect(readPlatformVoucherOrders()?.[voucher.id]?.status).toBe('refunded')
  })

  it('rejects a voucher recovery journal whose farm scope does not match changed vouchers', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-CROSS-FARM', userId: 'U1', farmId: 'F002', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    const snapshot = { variant: 'voucher', farmId: 'F001', vouchers: { [voucher.id]: voucher }, ledger: {} }
    expect(preparePlatformJournal({ operationId: 'V-CROSS-FARM-RECOVERY', collections: [PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY], original: snapshot, target: snapshot, recoveryHandlerKey: 'farmhouse-commerce-recovery-v1', recoverySchema: 'farmhouse-commerce-snapshot-v1' })).toBe(true)
    expect(resolvePlatformJournal('V-CROSS-FARM-RECOVERY', 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId: 'V-CROSS-FARM-RECOVERY', failedStep: 'test', reason: 'cross tenant test', handlerKey: 'farmhouse-commerce-recovery-v1' })).toBe(true)
    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'handler-failed' })
  })

  it('retries voucher redemption with the original target after time advances', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-RETRY-TIME', userId: 'U1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: `${voucher.id}:commission`, sourceOrderId: voucher.id, beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: voucher.createdAt })).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let failed = false
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-30T10:00:00.000Z'))
    localStorage.setItem = ((key: string, value: string) => {
      if (!failed && key === PLATFORM_COMMISSION_LEDGER_STORAGE_KEY) { failed = true; throw new Error('transient ledger failure') }
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      expect(await store.redeemVoucher(voucher.id)).toBe(false)
      localStorage.setItem = originalSetItem
      vi.setSystemTime(new Date('2026-08-30T10:00:05.000Z'))
      expect(await store.redeemVoucher(voucher.id)).toBe(true)
    } finally {
      localStorage.setItem = originalSetItem
      vi.useRealTimers()
    }
    expect(readPlatformVoucherOrders()?.[voucher.id]?.status).toBe('redeemed')
  })
  it('adds, updates and removes experiences with platform publication', () => {
    const store = useFarmhouseStore()
    const farmId = store.tenant?.farmId || 'F001'
    expect(store.addExperience({ farmId, name: '竹筏漂流', categoryCode: 'camp', description: '临溪漂流', price: 158, status: 'active', image: '/static/images/mountain.webp', sort: 1 })).toBe(true)
    const exp = store.experiences[0]
    expect(readPlatformExperiences()?.[exp.id]?.name).toBe('竹筏漂流')
    expect(mergePlatformExperiences([]).map((item) => item.id)).toContain(exp.id)
    expect(store.updateExperience(exp.id, { farmId, name: '竹筏漂流升级', categoryCode: 'camp', description: '临溪漂流+烧烤', price: 188, status: 'active', image: '/static/images/mountain.webp', sort: 1 })).toBe(true)
    expect(readPlatformExperiences()?.[exp.id]?.name).toBe('竹筏漂流升级')
    expect(store.removeExperience(exp.id)).toBe(true)
    expect(readPlatformExperiences()?.[exp.id]).toBe(null)
  })
})
