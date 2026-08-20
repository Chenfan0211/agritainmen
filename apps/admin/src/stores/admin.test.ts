import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { afterSales, categories, cloneSeed, farms, mergePlatformOrders, orders, pendingShareAmount, products, promoters, readPlatformCommissionSettlement, readPlatformOrders, suppliers, writePlatformOrder, writeShareRecords } from '@agritainment/shared'
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
    expect(store.refundAfterSale(processing[1].id, false)).toBe(true)
    expect(processing[1].status).toBe('refund-failed')
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

  it('derives KPIs and supports product editing and batch shipping', () => {
    const store = useAdminStore()
    store.$patch({ orders: cloneSeed(orders), products: cloneSeed(products), farms: cloneSeed(farms), suppliers: cloneSeed(suppliers) })
    expect(store.totalGmv).toBeCloseTo(20029.7, 1)
    expect(store.hotProducts[0].id).toBe('P001')
    expect(store.updateProduct('P001', { price: 66, stock: 99 })).toBe(true)
    expect(store.products[0].skus[0]).toMatchObject({ price: 66, stock: 99 })
    expect(store.batchShipOrders(store.orders.filter((item) => item.status === 'pending').map((item) => item.id))).toBe(18)
    expect(store.pendingOrders).toBe(0)
  })

  it('updates only the selected SKU and recalculates product totals', () => {
    const store = useAdminStore()
    store.products = cloneSeed(products.slice(0, 1))
    const untouched = { ...store.products[0].skus[1] }
    expect(store.updateProduct('P001', { price: 55, stock: 7, skuId: 'P001-500' })).toBe(true)
    expect(store.products[0].skus[0]).toMatchObject({ price: 55, stock: 7 })
    expect(store.products[0].skus[1]).toEqual(untouched)
    expect(store.products[0].price).toBe(Math.min(...store.products[0].skus.map((item) => item.price)))
    expect(store.products[0].stock).toBe(store.products[0].skus.reduce((sum, item) => sum + item.stock, 0))
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

  it('creates a product with spec, main image and detail images', () => {
    const store = useAdminStore()
    store.products = cloneSeed(products)
    expect(store.createProduct({
      name: '测试商品', category: '农产品', price: 10, cost: 5, stock: 100, source: 'platform', supplier: '平台自营',
      spec: '500g/袋', image: '/static/images/rice.webp', images: ['/static/images/rice.webp', '/static/images/field.webp']
    })).toBe(true)
    const item = store.products.find((p) => p.name === '测试商品')
    expect(item).toMatchObject({ spec: '500g/袋', image: '/static/images/rice.webp', images: ['/static/images/rice.webp', '/static/images/field.webp'] })
  })

  it('falls back to default main image when none uploaded', () => {
    const store = useAdminStore()
    store.products = []
    store.createProduct({ name: '无图商品', category: '农产品', price: 10, cost: 5, stock: 1, source: 'platform', supplier: '平台自营' })
    expect(store.products[0].image).toBe('/static/images/rice.webp')
  })

  it('updates product spec and images', () => {
    const store = useAdminStore()
    store.products = cloneSeed(products)
    const target = store.products[0]
    expect(store.updateProduct(target.id, {
      price: target.price, stock: target.stock, spec: '1kg/袋', image: '/static/images/tea.webp', images: ['/static/images/tea.webp']
    })).toBe(true)
    expect(store.products[0]).toMatchObject({ spec: '1kg/袋', image: '/static/images/tea.webp', images: ['/static/images/tea.webp'] })
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
