import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CatalogProduct } from '@agritainment/shared'
import { afterSales, categories, cloneSeed, farms, mergePlatformOrders, orders, pendingShareAmount, products, promoters, readCatalogState, readPlatformCommissionSettlement, readPlatformOrders, readPricingDefaults, suppliers, writeCatalogState, writePlatformOrder, writePricingDefaults, writeShareRecords } from '@agritainment/shared'
import { useAdminStore } from './admin'

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


describe('admin store interactions', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('initializes the unified catalog revision and projects all-channel products to both lists', async () => {
    const store = useAdminStore()
    await store.initialize()

    const catalog = readCatalogState()!
    expect(store.catalogRevision).toBe(catalog.revision)
    expect(store.catalogProducts).toEqual(catalog.products)
    for (const product of catalog.products.filter((item) => item.channel === 'all')) {
      expect(store.products.some((item) => item.id === product.id)).toBe(true)
      expect(store.cProducts.some((item) => item.id === product.id)).toBe(true)
    }
  })

  it('saves one catalog product and keeps its SKU price fields in both projections', async () => {
    const store = useAdminStore()
    await store.initialize()
    const product: CatalogProduct = {
      id: 'CAT-ADMIN-1', name: '统一商品', category: '土特产', supplierId: store.suppliers[0].id, supplierName: store.suppliers[0].name,
      source: 'platform', status: 'active', image: '', images: [], tags: ['演示'], productType: 'goods', expressDelivery: true,
      channel: 'all', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: 'CAT-ADMIN-1-SKU', name: '默认规格', image: '', retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 }]
    }

    expect(store.saveCatalogProduct(product)).toEqual({ ok: true })
    expect(store.catalogProducts[0]).toEqual(product)
    expect(store.products.find((item) => item.id === product.id)?.skus[0]).toMatchObject({ price: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 })
    expect(store.cProducts.find((item) => item.id === product.id)?.skus[0]).toMatchObject({ basePrice: 35, level1Commission: 10, level2Commission: 15 })
  })

  it('rejects invalid catalog products without changing the catalog', async () => {
    const store = useAdminStore()
    await store.initialize()
    const before = readCatalogState()!
    const invalid: CatalogProduct = {
      ...before.products[0], id: 'CAT-INVALID', channel: 'live', productType: 'goods', expressDelivery: false,
      skus: [{ ...before.products[0].skus[0], retailPrice: 20, level1Amount: 10, level2Amount: 15 }]
    }

    expect(store.saveCatalogProduct(invalid)).toEqual({ ok: false, error: '商品配置非法，请检查渠道、快递、佣金和 SKU 价格' })
    expect(readCatalogState()).toEqual(before)
  })

  it('refreshes catalog state when a save hits a revision conflict', async () => {
    const store = useAdminStore()
    await store.initialize()
    const current = readCatalogState()!
    const externallyUpdated = { ...current, revision: current.revision + 1, products: current.products.map((item, index) => index === 0 ? { ...item, name: `${item.name} 外部更新` } : item) }
    expect(writeCatalogState(externallyUpdated, current.revision)).toBe(true)

    const localEdit = { ...current.products[0], name: `${current.products[0].name} 本地更新` }
    expect(store.saveCatalogProduct(localEdit)).toEqual({ ok: false, error: '商品数据已更新，请刷新后重试' })
    expect(store.catalogRevision).toBe(externallyUpdated.revision)
    expect(store.catalogProducts[0].name).toBe(externallyUpdated.products[0].name)
  })

  it('loads and persists pricing defaults for subsequent products', async () => {
    expect(writePricingDefaults({ promoterCommissionRate: 6, storeCommissionRate: 4, level1Amount: 12, level2Amount: 18 })).toBe(true)
    const store = useAdminStore()
    await store.initialize()
    expect(store.pricingDefaults).toEqual({ promoterCommissionRate: 6, storeCommissionRate: 4, level1Amount: 12, level2Amount: 18 })

    expect(store.updatePricingDefaults({ promoterCommissionRate: 7, storeCommissionRate: 5, level1Amount: 8, level2Amount: 11 })).toBe(true)
    expect(readPricingDefaults()).toEqual({ promoterCommissionRate: 7, storeCommissionRate: 5, level1Amount: 8, level2Amount: 11 })
  })

  it('ships directly with driver dispatch and confirms receipt', () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    expect(store.shipOrder(store.orders[0].id)).toBe(true)
    expect(store.orders[0].status).toBe('shipping')
    expect(store.orders[0].trackingNo).toBeUndefined()
    const shipFlow = store.orders[0].flow
    expect(shipFlow?.[shipFlow.length - 1]).toMatchObject({ action: '已发货 · 已安排司机配送', operator: '运营管理员' })
    expect(store.confirmOrder(store.orders[0].id)).toBe(true)
    expect(store.orders[0].status).toBe('delivered')
    const doneFlow = store.orders[0].flow
    expect(doneFlow?.[doneFlow.length - 1]).toMatchObject({ action: '已确认收货', operator: '运营管理员' })
    expect(store.shipOrder(store.orders[0].id)).toBe(false)
    expect(store.confirmOrder(store.orders[0].id)).toBe(false)
  })

  it('merges store-submitted orders and writes back fulfillment status', () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    writePlatformOrder({ id: 'SO-TEST01', productName: '湘西烟熏柴火腊肉', quantity: 2, amount: 76, customer: '石板溪农家乐·门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-18 10:00' })
    store.orders = mergePlatformOrders(store.orders, readPlatformOrders())
    expect(store.orders.some((item) => item.id === 'SO-TEST01')).toBe(true)
    expect(store.shipOrder('SO-TEST01')).toBe(true)
    expect(readPlatformOrders()?.['SO-TEST01']?.status).toBe('shipping')
    expect(store.confirmOrder('SO-TEST01')).toBe(true)
    expect(readPlatformOrders()?.['SO-TEST01']?.status).toBe('delivered')
  })

  it('records an after-sale refund flow and exports', () => {
    const store = useAdminStore()
    store.afterSales = cloneSeed(afterSales)
    const processing = store.afterSales.find((item) => item.status === 'processing')!
    expect(store.approveAfterSaleRefund(processing.id)).toBe(true)
    expect(processing.status).toBe('refund-pending')
    expect(store.refundAfterSale(processing.id, true)).toBe(true)
    expect(processing.status).toBe('refunded')
    store.recordExport('订单履约', 4)
    expect(processing.history?.[0].operator).toBe('运营管理员')
    expect(store.exportRecords[0]).toMatchObject({ module: '订单履约', count: 4 })
  })

  it('moves after-sales through reject/return/refund-failed and guards terminal states', () => {
    const store = useAdminStore()
    store.afterSales = cloneSeed(afterSales)
    const processing = store.afterSales.filter((item) => item.status === 'processing')
    expect(store.rejectAfterSale(processing[0].id)).toBe(true)
    expect(processing[0].status).toBe('rejected')
    expect(store.approveAfterSaleRefund(processing[0].id)).toBe(false)
    expect(store.approveAfterSaleReturn(processing[1].id)).toBe(true)
    expect(processing[1].status).toBe('return-pending')
    expect(store.refundAfterSale(processing[1].id, false)).toBe(false)
    expect(processing[1].status).toBe('return-pending')
    expect(store.refundAfterSale(processing[0].id, true)).toBe(false)
  })

  it('initiates after-sale only for delivered orders without existing records', () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    store.afterSales = cloneSeed(afterSales)
    const delivered = store.orders.find((o) => o.status === 'delivered' && !store.afterSales.some((a) => a.orderId === o.id))!
    const pending = store.orders.find((o) => o.status === 'pending')!
    expect(store.initiateAfterSale(delivered.id, 'refund', '质量问题')).toBe(true)
    expect(store.initiateAfterSale(delivered.id, 'refund', '质量问题')).toBe(false)
    expect(store.initiateAfterSale(pending.id, 'refund', '质量问题')).toBe(false)
    expect(store.afterSales[0].status).toBe('processing')
  })

  it('derives KPIs and supports batch shipping', () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), products: cloneSeed(products), farms: cloneSeed(farms), suppliers: cloneSeed(suppliers) })
    expect(store.totalGmv).toBeCloseTo(20029.7, 1)
    expect(store.hotProducts[0].id).toBe('P001')
    expect(store.batchShipOrders(store.orders.filter((item) => item.status === 'pending').map((item) => item.id))).toBe(18)
    expect(store.pendingOrders).toBe(0)
  })

  it('settles supplier orders and commissions only once', () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), suppliers: cloneSeed(suppliers), promoters: [{ id: 'T1', name: '推客', level: 'V1', fans: 1, orders: 1, gmv: 100, commission: 10, status: 'active' }] })
    expect(store.settleSuppliers(['S006'])).toBe(true)
    expect(store.settleSuppliers(['S006'])).toBe(false)
    expect(store.supplierSettlementRecords[0]).toMatchObject({ orderIds: ['NJ202608110842', 'NJ202607291457', 'NJ202607301917'], amount: 616 })
    expect(store.supplierSettlementRecords[0].items[0]).toMatchObject({ supplierId: 'S006', orderIds: ['NJ202608110842', 'NJ202607291457', 'NJ202607301917'], amount: 616 })
    writeShareRecords([{ id: 'SR-T', userId: 'u', orderId: 'o', orderAmount: 200, role: 'promoter', promoterId: 'T1', rate: 5, amount: 10, createdAt: 'x' }])
    expect(store.settleCommissions()).toBe(true)
    expect(store.settleCommissions()).toBe(false)
    expect(store.commissionSettlementRecords[0].amount).toBe(10)
    expect(store.commissionSettlementRecords[0].items[0]).toMatchObject({ promoterId: 'T1', promoterName: '推客', amount: 10 })
  })

  it('excludes reversed commissions and settles pending negative corrections', () => {
    const store = useAdminStore()
    store.promoters = [{ id: 'T1', name: '推客', level: 'V1', fans: 1, orders: 1, gmv: 100, commission: 10, status: 'active' }]
    writeShareRecords([
      { id: 'SR-REVERSED', userId: 'u', orderId: 'cancelled', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: 5, status: 'reversed', createdAt: 'x' },
      { id: 'SR-EARNED', userId: 'u', orderId: 'paid', orderAmount: 200, role: 'promoter', promoterId: 'T1', rate: 5, amount: 10, status: 'pending', createdAt: 'x' },
      { id: 'SR-CORRECTION', userId: 'u', orderId: 'returned', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: -5, status: 'pending', createdAt: 'x' }
    ])

    expect(store.settleCommissions()).toBe(true)
    expect(store.commissionSettlementRecords[0].amount).toBe(5)
  })

  it('groups dashboard trend by actual order date', () => {
    const store = useAdminStore()
    store.orders = cloneSeed(orders)
    const last = store.dailyTrend.at(-1)
    expect(last).toMatchObject({ key: '2026-08-12', count: 11 })
    expect(last!.amount).toBeCloseTo(4589.5, 1)
  })

  it('manages categories with dedupe and in-use delete protection', () => {
    const store = useAdminStore()
    store.categories = cloneSeed(categories)
    store.products = cloneSeed(products)
    store.suppliers = cloneSeed(suppliers)
    expect(store.addCategory('有机杂粮', 'product')).toBe(true)
    expect(store.categories[0]).toMatchObject({ name: '有机杂粮', type: 'product' })
    expect(store.addCategory('有机杂粮', 'supplier')).toBe(false)
    expect(store.updateCategory(store.categories[0].id, '有机杂粮礼盒', 'general')).toBe(true)
    expect(store.removeCategory('C007')).toBe(false)
    expect(store.removeCategory('C018')).toBe(true)
    expect(store.categories.some((item) => item.id === 'C018')).toBe(false)
  })
})

describe('admin auth', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('logs in with the demo account and logs out', () => {
    const store = useAdminStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.login('admin', 'wrong')).toBe(false)
    expect(store.login('root', '123456')).toBe(false)
    expect(store.login('admin', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ isLoggedIn: true, account: 'admin' })
    store.logout()
    expect(store.auth).toEqual({ isLoggedIn: false, account: '' })
  })

  it('manages dictionary items with code uniqueness', () => {
    const store = useAdminStore()
    store.dictItems = []
    expect(store.addDictItem({ type: 'city', code: '永州市', label: '永州市' })).toBe(true)
    expect(store.addDictItem({ type: 'city', code: '永州市', label: '永州' })).toBe(false)
    expect(store.addDictItem({ type: 'afterSaleReason', code: 'late', label: '配送延误' })).toBe(true)
    const item = store.dictItems[0]
    expect(store.updateDictItem(item.id, { label: '配送超时' })).toBe(true)
    expect(store.dictItems.find((i) => i.id === item.id)?.label).toBe('配送超时')
    expect(store.removeDictItem(item.id)).toBe(true)
    expect(store.dictItems).toHaveLength(1)
  })

  it('manages dictionary groups and blocks deleting non-empty ones', () => {
    const store = useAdminStore()
    store.dictGroups = []
    store.dictItems = []
    expect(store.addDictGroup({ type: 'city', name: '城市信息' })).toBe(true)
    expect(store.addDictGroup({ type: 'city', name: '城市信息' })).toBe(false)
    expect(store.addDictGroup({ type: 'status', name: '城市信息' })).toBe(false)
    expect(store.addDictGroup({ type: 'industry', name: '行业类型' })).toBe(true)
    const city = store.dictGroups.find((g) => g.type === 'city')!
    const industry = store.dictGroups.find((g) => g.type === 'industry')!
    expect(store.updateDictGroup(city.id, { name: '省市信息' })).toBe(true)
    expect(store.dictGroups.find((g) => g.id === city.id)?.name).toBe('省市信息')
    store.addDictItem({ type: 'industry', code: '农旅', label: '农旅融合' })
    expect(store.removeDictGroup(industry.id)).toBe(false)
    expect(store.removeDictGroup(city.id)).toBe(true)
    expect(store.dictGroups).toHaveLength(1)
  })

  it('renames a group type and migrates its items', () => {
    const store = useAdminStore()
    store.dictGroups = []
    store.dictItems = []
    expect(store.addDictGroup({ type: 'city', name: '城市信息' })).toBe(true)
    expect(store.addDictGroup({ type: 'status', name: '数据状态' })).toBe(true)
    expect(store.addDictItem({ type: 'city', code: '湘西州', label: '湘西州' })).toBe(true)
    const group = store.dictGroups.find((g) => g.type === 'city')!
    expect(store.updateDictGroup(group.id, { type: 'status' })).toBe(false)
    expect(store.updateDictGroup(group.id, { type: 'region' })).toBe(true)
    expect(store.dictGroups.find((g) => g.id === group.id)?.type).toBe('region')
    expect(store.dictItems[0].type).toBe('region')
  })

  it('manages store login accounts', () => {
    const store = useAdminStore()
    store.storeAccounts = []
    expect(store.addStoreAccount({ farmId: 'F001', name: '测试店员', account: '13900000000', password: '123456', role: 'staff' })).toBe(true)
    expect(store.addStoreAccount({ farmId: 'F001', name: '重复账号', account: '13900000000', password: '123456', role: 'staff' })).toBe(false)
    const item = store.storeAccounts[0]
    expect(store.updateStoreAccount(item.id, { role: 'owner' })).toBe(true)
    expect(store.storeAccounts[0].role).toBe('owner')
    expect(store.toggleStoreAccount(item.id)).toBe(true)
    expect(store.storeAccounts[0].enabled).toBe(false)
  })
  it('writes commission settlement to the platform channel', () => {
    const store = useAdminStore()
    store.promoters = cloneSeed(promoters)
    writeShareRecords([
      { id: 'SR-S1', userId: 'U1', orderId: 'O1', orderAmount: 100, role: 'promoter', promoterId: 'T001', rate: 5, amount: 5, createdAt: '2026-08-19 10:00' },
      { id: 'SR-S2', userId: 'U2', orderId: 'O2', orderAmount: 100, role: 'promoter', promoterId: 'T001', rate: 3, amount: 3, createdAt: '2026-08-19 10:01' }
    ])
    expect(store.settleCommissions()).toBe(true)
    expect(readPlatformCommissionSettlement('T001')?.settled).toBe(true)
    expect(readPlatformCommissionSettlement('T001')?.commission).toBe(8)
    expect(pendingShareAmount('T001')).toBe(0)
  })
})
