import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import type { CatalogProduct, GeocodeResult } from '@agritainment/shared'
import { addDictItem, afterSales, categories, cloneSeed, farms, mergePlatformOrders, orders, pendingShareAmount, products, promoters, publishPlatformDictionaries, readCatalogState, readPlatformCommissionSettlement, readPlatformDictionaries, readPlatformOrders, readPlatformSupplierAccounts, readPricingDefaults, suppliers, writeCatalogState, writePlatformOrder, writePricingDefaults, writeShareRecords } from '@agritainment/shared'
import { readPlatformEntities } from '@agritainment/shared'
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

  it('新增门店时解析地址并持久化 GCJ-02 坐标', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 112.9388, latitude: 28.2282 },
      location: { longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路' }
    })

    await expect(store.addFarm({ name: '坐标测试门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区潇湘中路', city: '长沙市' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({
      address: '湖南省长沙市岳麓区潇湘中路', locationStatus: 'resolved', location: { coordinateSystem: 'GCJ-02', longitude: 112.9388, latitude: 28.2282 }
    })
    expect(readPlatformEntities()?.farms?.[store.farms[0].id]).toMatchObject({ location: { longitude: 112.9388, latitude: 28.2282 } })
  })

  it('按县区和详细地址构建并保存结构化门店地址', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 112.9388, latitude: 28.2282 },
      location: { longitude: 112.9388, latitude: 28.2282, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430104', province: '湖南省', city: '长沙市', district: '岳麓区', formattedAddress: '湖南省长沙市岳麓区潇湘中路123号' }
    })

    await expect(store.addFarm({ name: '结构化地址门店', districtCode: '430104', detail: '潇湘中路123号' }, geocode)).resolves.toBe(true)
    expect(geocode).toHaveBeenCalledWith({ address: '湖南省长沙市岳麓区潇湘中路123号', city: '长沙市' })
    expect(store.farms[0]).toMatchObject({
      address: '湖南省长沙市岳麓区潇湘中路123号', city: '长沙市', region: '岳麓区', regionCode: '430104',
      structuredAddress: { province: '湖南省', city: '长沙市', district: '岳麓区', districtCode: '430104', detail: '潇湘中路123号' }
    })
  })

  it('地理编码县区与所选县区不一致时清空坐标并标记 REGION_MISMATCH', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'amap', coordinate: { longitude: 113.05, latitude: 28.25 },
      location: { longitude: 113.05, latitude: 28.25, coordinateSystem: 'GCJ-02', provider: 'amap', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '430105', province: '湖南省', city: '长沙市', district: '开福区', formattedAddress: '湖南省长沙市开福区测试路' }
    })

    await expect(store.addFarm({ name: '县区不匹配门店', districtCode: '430104', detail: '测试路1号' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({ locationStatus: 'failed', locationError: 'REGION_MISMATCH', regionCode: '430104' })
    expect(store.farms[0].location).toBeUndefined()
  })

  it('编辑门店地址解析失败时保留地址并清除旧坐标', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })

    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '湖南省湘西州永顺县新的石板溪地址' }, geocode)).resolves.toBe(true)
    expect(store.farms[0]).toMatchObject({ address: '湖南省湘西州永顺县新的石板溪地址', locationStatus: 'failed' })
    expect(store.farms[0].location).toBeUndefined()
  })

  it('同一地址失败后可强制重新定位并恢复坐标', async () => {
    const store = useAdminStore()
    store.farms = [{ ...cloneSeed(farms[0]), locationStatus: 'failed', location: undefined, locationError: 'GEOCODE_FAILED' }]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({
      status: 'resolved', provider: 'tencent', coordinate: { longitude: 109.8561, latitude: 29.0816 },
      location: { longitude: 109.8561, latitude: 29.0816, coordinateSystem: 'GCJ-02', provider: 'tencent', geocodedAt: '2026-08-25T00:00:00.000Z', adCode: '433127', province: '湖南省', city: '湘西州', district: '永顺县', formattedAddress: farms[0].address }
    })

    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: farms[0].address, forceGeocode: true }, geocode)).resolves.toBe(true)
    expect(geocode).toHaveBeenCalledWith({ address: farms[0].address, city: farms[0].city })
    expect(store.farms[0]).toMatchObject({ locationStatus: 'resolved', location: { provider: 'tencent', longitude: 109.8561, latitude: 29.0816 } })
  })

  it('同一结构化地址已有有效坐标时复用定位结果', async () => {
    const store = useAdminStore()
    store.farms = [{ ...cloneSeed(farms[0]), address: '湖南省湘西州永顺县石板溪村', regionCode: '433127', structuredAddress: { provinceCode: '43', province: '湖南省', cityCode: '4331', city: '湘西州', districtCode: '433127', district: '永顺县', detail: '石板溪村' } }]
    const geocode = vi.fn<() => Promise<GeocodeResult>>()

    await expect(store.updateFarm('F001', { name: farms[0].name, districtCode: '433127', detail: '石板溪村' }, geocode)).resolves.toBe(true)
    expect(geocode).not.toHaveBeenCalled()
    expect(store.farms[0].locationStatus).toBe('resolved')
  })

  it('地理编码请求期间清除旧坐标并显示定位中', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    let resolveGeocode!: (result: GeocodeResult) => void
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockImplementation(() => new Promise((resolve) => { resolveGeocode = resolve }))

    const updating = store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '湖南省湘西州永顺县新地址' }, geocode)
    expect(store.farms[0]).toMatchObject({ address: '湖南省湘西州永顺县新地址', locationStatus: 'pending' })
    expect(store.farms[0].location).toBeUndefined()

    resolveGeocode({ status: 'failed' })
    await updating
    expect(store.farms[0].locationStatus).toBe('failed')
  })

  it('新增和编辑门店时拒绝空详细地址', async () => {
    const store = useAdminStore()
    store.farms = [cloneSeed(farms[0])]
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })

    await expect(store.addFarm({ name: '无地址门店', region: '长沙市岳麓区', address: '   ' }, geocode)).resolves.toBe(false)
    await expect(store.updateFarm('F001', { name: farms[0].name, region: farms[0].region, address: '' }, geocode)).resolves.toBe(false)
    expect(geocode).not.toHaveBeenCalled()
    expect(store.farms).toHaveLength(1)
    expect(store.farms[0].address).toBe(farms[0].address)
  })

  it('门店新增和编辑在保存边界规范化图片引用', async () => {
    const store = useAdminStore()
    const geocode = vi.fn<() => Promise<GeocodeResult>>().mockResolvedValue({ status: 'failed' })
    await expect(store.addFarm({
      name: '图片规范化门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区测试路1号',
      image: 'https://cdn.example.com/farm.jpg'
    }, geocode)).resolves.toBe(true)
    expect(store.farms[0].image).toEqual({ source: 'legacy', url: 'https://cdn.example.com/farm.jpg' })

    await expect(store.updateFarm(store.farms[0].id, {
      name: '图片规范化门店', region: '长沙市岳麓区', address: '湖南省长沙市岳麓区测试路1号',
      image: '/static/images/farmhouse.webp'
    }, geocode)).resolves.toBe(true)
    expect(store.farms[0].image).toEqual({ source: 'builtin', path: '/static/images/farmhouse.webp' })
  })

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
      source: 'platform', status: 'active', image: { source: 'builtin', path: '/static/images/product.webp' }, images: [], tags: ['演示'], productType: 'goods', expressDelivery: true,
      channel: 'all', farmIds: [], promoterCommissionRate: 5, storeCommissionRate: 3,
      skus: [{ id: 'CAT-ADMIN-1-SKU', name: '默认规格', image: { source: 'builtin', path: '/static/images/product.webp' }, retailPrice: 60, cost: 30, stock: 10, level1Amount: 10, level2Amount: 15 }]
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

  it('creates a default phone account when inviting a supplier', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(store.inviteSupplier({ name: '测试鲜果供应商', category: '生鲜农产', contactPhone: '13900009991', coop: true })).toEqual({ ok: true })
    const supplier = store.suppliers.find((item) => item.name === '测试鲜果供应商')!
    expect(readPlatformSupplierAccounts()?.find((item) => item.supplierId === supplier.id)).toMatchObject({
      account: '13900009991',
      password: '13900009991'
    })
  })

  it('rejects a supplier phone already bound to another supplier', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(store.inviteSupplier({ name: '重复手机号供应商', category: '综合品类', contactPhone: '13787366688' })).toEqual({
      ok: false,
      error: '该手机号已绑定其他供应商'
    })
  })

  it('requires a valid phone before creating a supplier account', async () => {
    const store = useAdminStore()
    await store.initialize()

    expect(store.inviteSupplier({ name: '无手机号供应商', category: '综合品类' })).toEqual({ ok: false, error: '请填写联系人手机号' })
    expect(store.inviteSupplier({ name: '错号供应商', category: '综合品类', contactPhone: '123' })).toEqual({ ok: false, error: '请输入正确的11位手机号' })
    expect(store.suppliers.some((item) => item.name === '无手机号供应商' || item.name === '错号供应商')).toBe(false)
  })

  it('changes the login account with the supplier phone while preserving its password', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!

    expect(store.updateSupplier(supplier.id, { ...supplier, contactPhone: '13900009992', password: 'custom123' })).toEqual({ ok: true })
    expect(store.updateSupplier(supplier.id, { ...supplier, contactPhone: '13900009993' })).toEqual({ ok: true })
    expect(readPlatformSupplierAccounts()?.find((item) => item.supplierId === supplier.id)).toMatchObject({
      account: '13900009993',
      password: 'custom123'
    })
  })

  it('rejects an invalid replacement password without changing credentials', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!

    expect(store.updateSupplier(supplier.id, { ...supplier, password: '123' })).toEqual({ ok: false, error: '密码需6-20位' })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.password).toBe('13787366688')
  })

  it('keeps the credential version when only supplier profile fields change', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const before = store.supplierAccounts.find((item) => item.supplierId === supplier.id)!.updatedAt

    expect(store.updateSupplier(supplier.id, { ...supplier, region: '湘西州新地址' })).toEqual({ ok: true })
    expect(store.supplierAccounts.find((item) => item.supplierId === supplier.id)?.updatedAt).toBe(before)
  })

  it('显式清空营业执照图片时不恢复旧图，未传许可证图片时保留旧图', async () => {
    const store = useAdminStore()
    await store.initialize()
    const supplier = store.suppliers.find((item) => item.id === 'S002')!
    const businessLicense = { source: 'asset' as const, assetId: 'media-business-license' }
    const permit = { source: 'asset' as const, assetId: 'media-permit' }
    supplier.qualification.attachments = [
      { typeCode: 'businessLicense', number: 'BL-001', image: businessLicense },
      { typeCode: 'permit', number: 'PERMIT-001', image: permit }
    ]

    expect(store.updateSupplier(supplier.id, {
      name: supplier.name,
      category: supplier.category,
      contactPhone: supplier.contactPhone,
      businessLicense: null
    })).toEqual({ ok: true })

    const attachments = supplier.qualification.attachments!
    expect(attachments.find((item) => item.typeCode === 'businessLicense')?.image).not.toEqual(businessLicense)
    expect(attachments.find((item) => item.typeCode === 'permit')?.image).toEqual(permit)
  })
})

describe('admin auth', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

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

  it('优先初始化共享字典且不恢复 city 字典', async () => {
    const initial = readPlatformDictionaries()
    const customized = addDictItem(initial, { id: 'DI-ADMIN-INIT', type: 'productTag', code: 'fresh', label: '共享标签', enabled: true, sort: 0 })!
    expect(await publishPlatformDictionaries(customized, initial.revision)).not.toBeNull()
    const store = useAdminStore()
    await store.initialize()
    expect(store.dictItems).toContainEqual(expect.objectContaining({ code: 'fresh', label: '共享标签' }))
    expect(store.dictGroups.some((group) => group.type === 'city')).toBe(false)
  })

  it('两个后台发布同一 revision 时后者刷新胜者状态', async () => {
    const first = useAdminStore()
    await first.initialize()
    setActivePinia(createPinia())
    const stale = useAdminStore()
    await stale.initialize()

    expect(await first.addDictItem({ type: 'productTag', code: 'winner', label: '胜者', enabled: true, sort: 0 })).toBe(true)
    expect(await stale.addDictItem({ type: 'productTag', code: 'stale', label: '旧发布者', enabled: true, sort: 0 })).toBe(false)
    expect(stale.dictItems).toContainEqual(expect.objectContaining({ code: 'winner', label: '胜者' }))
    expect(stale.dictItems.some((item) => item.code === 'stale')).toBe(false)
    expect(stale.error).toBe('字典数据已更新，请重试')
  })

  it('manages dictionary items with code uniqueness', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.addDictItem({ type: 'productTag', code: 'fresh', label: '新鲜直供' })).toBe(true)
    expect(await store.addDictItem({ type: 'productTag', code: 'fresh', label: '重复' })).toBe(false)
    const item = store.dictItems.find((candidate) => candidate.type === 'productTag' && candidate.code === 'fresh')!
    expect(await store.updateDictItem(item.id, { label: '每日新鲜直供' })).toBe(true)
    expect(store.dictItems.find((i) => i.id === item.id)?.label).toBe('每日新鲜直供')
    expect(await store.removeDictItem(item.id)).toBe(true)
    expect(store.dictItems.some((candidate) => candidate.id === item.id)).toBe(false)
  })

  it('manages dictionary groups and blocks deleting non-empty ones', async () => {
    const store = useAdminStore()
    await store.initialize()
    expect(await store.addDictGroup({ type: 'industryDemo', name: '行业类型' })).toBe(true)
    expect(await store.addDictGroup({ type: 'industryDemo', name: '重复类型' })).toBe(false)
    const industry = store.dictGroups.find((g) => g.type === 'industryDemo')!
    expect(await store.updateDictGroup(industry.id, { name: '农旅行业' })).toBe(true)
    expect(await store.addDictItem({ type: 'industryDemo', code: 'agritourism', label: '农旅融合' })).toBe(true)
    expect(await store.removeDictGroup(industry.id)).toBe(false)
    expect(store.error).toBe('该分组下还有字典项，请先清空')
  })

  it('locks system dictionary identity while allowing labels', async () => {
    const store = useAdminStore()
    await store.initialize()
    const group = store.dictGroups.find((candidate) => candidate.type === 'orderStatus')!
    const item = store.dictItems.find((candidate) => candidate.type === 'orderStatus')!
    expect(await store.updateDictGroup(group.id, { type: 'renamedStatus' })).toBe(false)
    expect(await store.addDictItem({ type: 'orderStatus', code: 'custom', label: '自定义' })).toBe(false)
    expect(await store.updateDictItem(item.id, { code: 'renamed', label: '新文案' })).toBe(false)
    expect(await store.updateDictItem(item.id, { label: '新文案' })).toBe(true)
    expect(await store.removeDictItem(item.id)).toBe(false)
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
