import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct, CatalogState } from '@agritainment/shared'
import { CATALOG_SCHEMA_VERSION, applyCatalogStockOperation, cloneSeed, markCatalogTransactionStockApplied, members, migrateLegacyCatalog, prepareCatalogTransaction, products, readCatalogState, readPlatformBookings, readPlatformCommissionLedger, readPendingCatalogTransactions, readPlatformOrders, readPlatformVoucherOrders, readShareRecords, readStoreCatalogSelectionState, readStoreCatalogSelections, saveStoreCatalogSelection, tenant, upsertStoreCatalogSelection, writeCatalogState, writePlatformBooking, writePlatformExperience, readPlatformExperiences, mergePlatformExperiences, writePlatformCommissionLedgerEntry, writePlatformOrder, writePlatformStoreAccounts, writePlatformVoucherOrder, writeShareRecord, writeUserLink, storeAccounts } from '@agritainment/shared'
import { useFarmhouseStore } from './farmhouse'

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

async function initializeWithLegacyProducts(store: ReturnType<typeof useFarmhouseStore>, legacyProducts: typeof products) {
  seedCatalog(migrateLegacyCatalog(legacyProducts, []))
  legacyProducts.forEach((product) => {
    expect(upsertStoreCatalogSelection({ storeId: 'F001', productId: product.id, listed: true, retailPrice: product.price })).toBe(true)
  })
  await store.initialize(false, 'F001')
}

describe('farmhouse store interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('writes recharge and checkout balance entries', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ tenant: cloneSeed(tenant), member: { ...cloneSeed(members[0]), balance: 100 }, cart: [], balanceEntries: [] })
    store.recharge(100)
    store.addToCart(store.products[0])
    expect(store.checkout()).toBe(true)
    expect(store.balanceEntries.map((item) => item.type)).toEqual(['consume', 'recharge'])
    expect(store.orders[0].status).toBe('待发货')
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
    expect(store.checkout()).toBe(true)
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

  it('stores order items and supports repurchase', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(2, 3)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout()).toBe(true)
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
    expect(writePlatformBooking({ id: 'B-SHARED', farmId: 'F001', farmName: '石板溪农家乐', userId: 'U1', source: 'alliance', date: '明天', session: '晚市', people: 4, status: 'submitted', createdAt: '2026-08-25T10:00:00.000Z' })).toBe(true)
    store.bookings = [{ id: 'B-SHARED', type: 'room', name: '观溪雅间', date: '明天', session: '晚市', people: 4, status: 'reserved' }]

    expect(store.verifyBooking('B-SHARED', 488)).toBe(true)
    expect(readPlatformBookings()?.['B-SHARED']).toMatchObject({ status: 'completed', amount: 488, amountConfirmedAt: expect.any(String) })
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

  it('rejects a duplicate booking and supports cancellation', () => {
    const store = useFarmhouseStore()
    store.bookings = []
    const booking = { type: 'package' as const, name: '四人欢聚套餐', date: '明天', session: '晚市', people: 4 }
    expect(store.submitBooking(booking)).toBe(true)
    expect(store.submitBooking(booking)).toBe(false)
    expect(store.cancelBooking(store.bookings[0].id)).toBe(true)
  })
})

describe('farmhouse auth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('logs in via simulated wechat openid and logs out', async () => {
    const store = useFarmhouseStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(await store.wechatLogin()).toBe(true)
    expect(store.auth.isLoggedIn).toBe(true)
    expect(store.auth.openid).toMatch(/^mock_openid_/)
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, openid: '' })
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

  it('writes a farmhouse-courier platform order when courier is selected', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout({ deliveryMode: 'courier', address: '湖南省张家界市永定区示例路 1 号' })).toBe(true)
    const order = store.orders[0]
    expect(order.delivery?.mode).toBe('courier')
    expect(order.platformOrderId).toBe(`FH-${order.id}`)
    const platformOrder = readPlatformOrders()?.[`FH-${order.id}`]
    expect(platformOrder?.supplierOrderLink?.source).toBe('farmhouse-courier')
    expect(platformOrder?.items?.[0]?.deliveryMode).toBe('courier')
  })

  it('keeps pickup orders local without a platform link', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout({ deliveryMode: 'pickup' })).toBe(true)
    const order = store.orders[0]
    expect(order.delivery?.mode).toBe('pickup')
    expect(order.platformOrderId).toBeUndefined()
  })

  it('requires an address for courier checkout', async () => {
    const store = useFarmhouseStore()
    await initializeWithLegacyProducts(store, cloneSeed(products.slice(0, 1)))
    store.$patch({ member: { ...cloneSeed(members[0]), balance: 500 }, cart: [], orders: [], balanceEntries: [] })
    store.addToCart(store.products[0], store.products[0].skus[0].id)
    expect(store.checkout({ deliveryMode: 'courier', address: '' })).toBe(false)
    expect(store.checkoutError).toContain('收货地址')
  })
})

describe('unified farmhouse catalog', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
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

    expect(store.checkout()).toBe(false)
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

    expect(store.checkout()).toBe(true)
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

    expect(store.checkout()).toBe(false)
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
    expect(store.checkout()).toBe(true)
    const order = store.orders[0]
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)

    expect(store.cancelStorefrontOrder(order.id)).toBe(true)
    expect(store.cancelStorefrontOrder(order.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(10)
    expect(store.member).toMatchObject({ balance: 500, points: 100 })
    expect(order).toMatchObject({ status: '已取消', inventoryReleased: true, balanceRefunded: true })
  })

  it('refunds without inventory release and releases inventory only after a return is completed', async () => {
    seedCatalog([catalogProduct({ id: 'CAT-AFTER', name: '售后商品' })])
    upsertStoreCatalogSelection({ storeId: 'F001', productId: 'CAT-AFTER', listed: true, retailPrice: 100 })
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    store.$patch({ member: { ...store.member, balance: 500, points: 100 }, orders: [], balanceEntries: [] })

    store.addToCart(store.products[0], 'CAT-AFTER-SKU')
    expect(store.checkout()).toBe(true)
    const refundOrder = store.orders[0]
    refundOrder.status = '已完成'
    expect(store.requestStorefrontAfterSale(refundOrder.id, 'refund')).toBe(true)
    expect(store.completeStorefrontAfterSale(refundOrder.id)).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)

    store.addToCart(store.products[0], 'CAT-AFTER-SKU')
    expect(store.checkout()).toBe(true)
    const returnOrder = store.orders[0]
    returnOrder.status = '已完成'
    expect(store.requestStorefrontAfterSale(returnOrder.id, 'return')).toBe(true)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(8)
    expect(store.completeStorefrontAfterSale(returnOrder.id)).toBe(true)
    expect(store.completeStorefrontAfterSale(returnOrder.id)).toBe(false)
    expect(readCatalogState()?.products[0].skus[0].stock).toBe(9)
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
    expect(store.checkout()).toBe(true)
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

describe('farmhouse voucher redemption', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('redeems and refunds a shared voucher order with ledger side effects', async () => {
    const store = useFarmhouseStore()
    await store.initialize(false, 'F001')
    const voucher = { id: 'V-TEST', userId: 'U1', promoterId: 'T001', liveId: 'LIVE1', farmId: 'F001', productId: 'P007', skuId: 'P007-4P', quantity: 1, amount: 288, status: 'paid' as const, createdAt: '2026-08-24 12:00' }
    expect(writePlatformVoucherOrder(voucher)).toBe(true)
    expect(writePlatformCommissionLedgerEntry({ id: 'V-TEST:commission', sourceOrderId: 'V-TEST', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 14.4, status: 'pending', createdAt: '2026-08-24 12:00' })).toBe(true)

    expect(store.redeemVoucher('V-TEST')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V-TEST']?.status).toBe('redeemed')
    expect(readPlatformCommissionLedger()?.['V-TEST:commission']?.status).toBe('available')

    expect(store.refundVoucher('V-TEST')).toBe(true)
    expect(readPlatformVoucherOrders()?.['V-TEST']?.status).toBe('refunded')
    expect(Object.values(readPlatformCommissionLedger() || {}).some((item) => item.reversalOf === 'V-TEST:commission' && item.status === 'reversed')).toBe(true)
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
