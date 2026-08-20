import { beforeEach, describe, expect, it } from 'vitest'
import type { Order, OrderItem, OrderStatus, PlatformMedia, SupplierFulfillment } from './index'

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
import { PERSISTENCE_VERSION, afterSales, calcCartTotal, calcMargin, derivePlatformMetrics, farms, markShareSettled, mergeEntitySeeds, migratePersistedState, nextPurchaseStatus, orders, pendingShareAmount, pendingShareTotal, readPlatformAfterSaleStatus, readShareConfig, resolveShare, getOrCreateUserId, resolveUserIdentity, resolveUserIdByOpenid, simulateWechatLogin, writePlatformAfterSale, writeShareRecords, writeUserLink, persistedEnvelope, products, promoters, selectPersistedState, applyPlatformMedia, emptyPlatformMedia, mergePersistedDefaults, mergePlatformLives, mergePlatformStoreAccounts, upsertPlatformFarm, upsertPlatformFarmPopularity, upsertPlatformProduct, suppliers, toCsv, validateAccountPassword, validatePhone, validatePricePolicy, validateSmsCode , acceptSupplierOrder, assignSupplierDriver, computeShortage, confirmCourierDelivered, demoDrivers, deriveSupplierMetrics, driverActiveTaskCounts, ensureSupplierFulfillment, findActiveDriver, findDriverByAccount, handoverSupplierIn, handoverSupplierOut, mergePlatformDrivers, readPlatformDrivers, reassignSupplierDriver, shipSupplierCourier, validateSupplierAccount, writePlatformDrivers } from './index'

describe('shared business helpers', () => {
  it('calculates cart totals without floating point drift', () => {
    expect(calcCartTotal([{ price: 59.9, quantity: 2 }, { price: 39.9, quantity: 1 }])).toBe(159.7)
  })

  it('calculates retail margin', () => {
    expect(calcMargin(42, 59.9)).toEqual({ amount: 17.9, rate: 29.9 })
  })

  it('advances purchase status and stops when complete', () => {
    expect(nextPurchaseStatus('submitted')).toBe('accepted')
    expect(nextPurchaseStatus('completed')).toBe('completed')
  })

  it('serializes export rows as UTF-8 CSV', () => {
    expect(toCsv([['名称', '说明'], ['石板溪', '含"引号"']])).toBe('\ufeff"名称","说明"\n"石板溪","含""引号"""')
  })

  it('migrates legacy and versioned local state without dropping user values', () => {
    const defaults = { balance: 0, versionedField: 'new', rows: [{ id: 'A', count: 0, enabled: true }] }
    const legacy = migratePersistedState({ balance: 88, rows: [{ id: 'A', count: 3 }] }, defaults)
    expect(legacy).toEqual({ balance: 88, versionedField: 'new', rows: [{ id: 'A', count: 3, enabled: true }] })
    expect(migratePersistedState(persistedEnvelope(legacy), defaults)).toEqual(legacy)
  })

  it('runs versioned member migration and excludes transient state', () => {
    const defaults = { member: { id: 'M1', name: '会员', level: 'gold', phone: '1', balance: 0, points: 0 }, loading: false, error: '', initialized: false, mockScenario: 'normal', rows: [] }
    const migrated = migratePersistedState({ version: 1, state: { balance: 88, points: 9, loading: true, error: '旧错误', initialized: true } }, defaults)
    expect(migrated.member).toMatchObject({ id: 'M1', balance: 88, points: 9 })
    expect(migrated).toMatchObject({ loading: false, error: '', initialized: false })
    const envelope = persistedEnvelope({ ...defaults, loading: true, error: '失败', initialized: true })
    expect(envelope.version).toBe(PERSISTENCE_VERSION)
    expect(envelope.state).not.toHaveProperty('loading')
    expect(selectPersistedState(defaults)).not.toHaveProperty('mockScenario')
  })

  it('persists only explicitly whitelisted business fields', () => {
    const state = { rows: [{ id: 'A' }], city: '湘西州', loading: true, openSheet: 'detail' }
    expect(persistedEnvelope(state, ['rows', 'city'] as const).state).toEqual({ rows: [{ id: 'A' }], city: '湘西州' })
  })

  it('migrates legacy purchase and settlement details into version 6', () => {
    const defaults = {
      purchaseOrders: [] as Array<{ id: string; items: Array<{ productId: string; skuId: string; skuName: string; image: string }> }>,
      supplierSettlementRecords: [] as Array<{ id: string; supplierIds: string[]; orderIds: string[]; amount: number; items: unknown[] }>,
      commissionSettlementRecords: [] as Array<{ id: string; promoterIds: string[]; amount: number; items: unknown[] }>
    }
    const migrated = migratePersistedState({ version: 5, state: {
      purchaseOrders: [{ id: 'PO1', items: [{ productId: 'P1' }] }],
      supplierSettlementRecords: [{ id: 'SS1', supplierIds: ['S1'], orderIds: ['O1'], amount: 88 }],
      commissionSettlementRecords: [{ id: 'CS1', promoterIds: ['T1'], amount: 10 }]
    } }, defaults)
    expect(migrated.purchaseOrders[0].items[0]).toMatchObject({ skuId: 'P1-DEFAULT', skuName: '默认规格' })
    expect(migrated.supplierSettlementRecords[0].items[0]).toMatchObject({ supplierId: 'S1', orderIds: ['O1'], amount: 88 })
    expect(migrated.commissionSettlementRecords[0].items[0]).toMatchObject({ promoterId: 'T1', amount: 10 })
  })

  it('merges new seed entities with persisted values and custom rows', () => {
    const defaults = [{ id: 'A', count: 0, enabled: true }, { id: 'B', count: 2, enabled: true }]
    const saved = [{ id: 'A', count: 5 } as (typeof defaults)[number], { id: 'X', count: 1, enabled: false }]
    expect(mergeEntitySeeds(defaults, saved)).toEqual([
      { id: 'A', count: 5, enabled: true },
      { id: 'B', count: 2, enabled: true },
      { id: 'X', count: 1, enabled: false }
    ])
  })

  it('removes generated SKU, placeholder qualification and redundant withdrawal state', () => {
    const defaults = { products: [] as Array<{ id: string; skus?: Array<{ id: string }> }>, suppliers: [] as Array<{ id: string; qualification?: object }> }
    const migrated = migratePersistedState({ version: 3, state: { products: [{ id: 'P1', skus: [{ id: 'P1-DEFAULT' }] }], suppliers: [{ id: 'S1', qualification: { businessLicense: '待补充', reviewNote: '旧版演示数据' } }], withdrawalRecords: [{ amount: 10 }] } }, defaults)
    expect(migrated.products).toEqual([{ id: 'P1' }])
    expect(migrated.suppliers).toEqual([{ id: 'S1' }])
    expect(migrated).not.toHaveProperty('withdrawalRecords')
  })
})

describe('auth demo helpers', () => {
  it('validates the fixed demo account and password', () => {
    expect(validateAccountPassword('admin', '123456')).toBe(true)
    expect(validateAccountPassword(' admin ', '123456')).toBe(true)
    expect(validateAccountPassword('admin', 'wrong')).toBe(false)
    expect(validateAccountPassword('root', '123456')).toBe(false)
  })

  it('validates mainland mobile phone numbers', () => {
    expect(validatePhone('13800000000')).toBe(true)
    expect(validatePhone(' 13800000000 ')).toBe(true)
    expect(validatePhone('12800000000')).toBe(false)
    expect(validatePhone('1380000000')).toBe(false)
    expect(validatePhone('23800000000')).toBe(false)
  })

  it('validates the fixed sms code', () => {
    expect(validateSmsCode('123456')).toBe(true)
    expect(validateSmsCode('1234567')).toBe(false)
  })

  it('simulates a wechat openid login without a backend', async () => {
    const { openid } = await simulateWechatLogin()
    expect(openid).toMatch(/^mock_openid_/)
    const second = await simulateWechatLogin()
    expect(second.openid).toMatch(/^mock_openid_/)
  })

describe('validatePricePolicy', () => {
  it('accepts a valid ladder policy with contiguous tiers', () => {
    expect(validatePricePolicy({ name: '腊味阶梯采购', type: 'ladder', discount: 24, tiers: [
      { minQty: 1, maxQty: 49, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 199, price: 39, discountOff: 35 },
      { minQty: 500, maxQty: null, price: 35, discountOff: 42 }
    ] })).toEqual([])
  })

  it('rejects missing name and out-of-range discount', () => {
    const errors = validatePricePolicy({ name: '', type: 'group', discount: 120 })
    expect(errors).toContain('请填写策略名称')
    expect(errors).toContain('优惠比例需在 1-100 之间')
  })

  it('requires at least one tier for ladder type', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [] })).toContain('阶梯价至少需要 1 个档位')
  })

  it('rejects overlapping tier ranges', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 1, maxQty: 100, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 200, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('区间不能重叠'))).toBe(true)
  })

  it('rejects tiers out of ascending order', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 50, maxQty: 100, price: 42, discountOff: 30 },
      { minQty: 1, maxQty: 49, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('区间不能重叠'))).toBe(true)
  })

  it('rejects non-positive unit price', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 1, maxQty: null, price: 0, discountOff: 30 }] }).some((e) => e.includes('集采单价需大于 0'))).toBe(true)
  })

  it('rejects discount off outside 0-100', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 1, maxQty: null, price: 42, discountOff: 120 }] }).some((e) => e.includes('让利比例需在 0-100 之间'))).toBe(true)
  })

  it('rejects an unbounded tier that is not last', () => {
    const errors = validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [
      { minQty: 1, maxQty: null, price: 42, discountOff: 30 },
      { minQty: 50, maxQty: 100, price: 39, discountOff: 35 }
    ] })
    expect(errors.some((e) => e.includes('必须排在最后'))).toBe(true)
  })

  it('rejects invalid maxQty below minQty', () => {
    expect(validatePricePolicy({ name: '阶梯价', type: 'ladder', discount: 20, tiers: [{ minQty: 100, maxQty: 50, price: 42, discountOff: 30 }] }).some((e) => e.includes('上限数量需为 ≥ 起始数量的整数'))).toBe(true)
  })
})

describe('derivePlatformMetrics', () => {
  it('derives counts and gmv from actual seed data', () => {
    const m = derivePlatformMetrics({ orders, products, farms, suppliers, afterSales, promoters })
    expect(m.orderCount).toBe(orders.length)
    expect(m.farmCount).toBe(farms.length)
    expect(m.supplierCount).toBe(suppliers.length)
    expect(m.gmv).toBeCloseTo(orders.reduce((sum, order) => sum + order.amount, 0), 1)
    expect(m.orderStats.total).toBe(orders.length)
    expect(m.afterSaleStats.count).toBe(afterSales.length)
    expect(m.hotProducts).toHaveLength(Math.min(5, products.length))
    expect(m.hotProducts[0].units).toBe(Math.max(...products.map((p) => p.sales)))
    expect(m.categoryShares.reduce((sum, c) => sum + c.value, 0)).toBe(products.length)
    expect(m.dailyTrend.reduce((sum, d) => sum + d.count, 0)).toBe(orders.length)
  })

  it('computes after-sale settlement and rate from refunds', () => {
    const m = derivePlatformMetrics({
      orders: [], products: [], farms: [], suppliers: [], promoters: [],
      afterSales: [
        { id: 'A1', orderId: 'O1', productName: 'X', applicant: '甲', type: 'refund' as const, amount: 100, status: 'refunded' as const, refundAmount: 50 },
        { id: 'A2', orderId: 'O2', productName: 'Y', applicant: '乙', type: 'claim' as const, amount: 200, status: 'processing' as const },
        { id: 'A3', orderId: 'O3', productName: 'Z', applicant: '丙', type: 'refund' as const, amount: 300, status: 'refunded' as const, refundAmount: 300 },
      ],
    })
    expect(m.afterSaleStats.count).toBe(3)
    expect(m.afterSaleStats.processing).toBe(1)
    expect(m.afterSaleStats.resolved).toBe(2)
    expect(m.afterSaleStats.settlement).toBe(350)
    expect(m.afterSaleStats.rate).toBe('66.7%')
  })
})
})

describe('platform media library', () => {
  it('applies uploaded farm and product images over seeds', () => {
    const farm = { ...farms[0], image: '/static/images/farmhouse.webp' }
    const product = { ...products[0], image: '/static/images/bacon.webp', images: ['/static/images/bacon.webp'] }
    const media = {
      farms: { [farm.id]: 'data:image/jpeg;base64,AAA' },
      products: { [product.id]: { image: 'data:image/jpeg;base64,BBB', images: ['data:image/jpeg;base64,CCC'] } },
      updatedAt: '2026-08-17T00:00:00.000Z'
    }
    applyPlatformMedia([farm], [product], media)
    expect(farm.image).toBe('data:image/jpeg;base64,AAA')
    expect(product.image).toBe('data:image/jpeg;base64,BBB')
    expect(product.images).toEqual(['data:image/jpeg;base64,CCC'])
  })

  it('keeps original images when media has no record', () => {
    const farm = { ...farms[0], image: '/static/images/farmhouse.webp' }
    applyPlatformMedia([farm], [], emptyPlatformMedia())
    expect(farm.image).toBe('/static/images/farmhouse.webp')
  })

  it('upserts and removes farm media records by upload state', () => {
    let media = emptyPlatformMedia()
    media = upsertPlatformFarm(media, 'F999', 'data:image/png;base64,XXX')
    expect(media.farms['F999']).toBe('data:image/png;base64,XXX')
    media = upsertPlatformFarm(media, 'F999', '/static/images/farmhouse.webp')
    expect(media.farms['F999']).toBeUndefined()
  })

  it('upserts product media only when an uploaded image exists', () => {
    let media = emptyPlatformMedia()
    media = upsertPlatformProduct(media, 'P999', '/static/images/rice.webp')
    expect(media.products['P999']).toBeUndefined()
    media = upsertPlatformProduct(media, 'P999', 'data:image/jpeg;base64,YYY', ['/static/images/field.webp'])
    expect(media.products['P999']).toEqual({ image: 'data:image/jpeg;base64,YYY', images: [] })
    media = upsertPlatformProduct(media, 'P999', 'data:image/jpeg;base64,YYY', ['data:image/jpeg;base64,ZZZ'])
    expect(media.products['P999']).toEqual({ image: 'data:image/jpeg;base64,YYY', images: ['data:image/jpeg;base64,ZZZ'] })
  })


  it('applies published farm popularity over seeds', () => {
    const farm = { ...farms[0], image: '/static/images/farmhouse.webp', livePopularity: 100 }
    const media = { farms: {}, products: {}, farmPopularity: { [farm.id]: 8888 }, updatedAt: '2026-08-17T00:00:00.000Z' }
    applyPlatformMedia([farm], [], media)
    expect(farm.livePopularity).toBe(8888)
  })

  it('keeps original popularity when media has no record', () => {
    const farm = { ...farms[0], livePopularity: 100 }
    applyPlatformMedia([farm], [], { farms: {}, products: {}, updatedAt: '' })
    expect(farm.livePopularity).toBe(100)
  })

  it('upserts farm popularity and preserves legacy image records', () => {
    let media: PlatformMedia = { farms: { F999: 'data:image/png;base64,XXX' }, products: {}, farmPopularity: {}, updatedAt: '' }
    media = upsertPlatformFarmPopularity(media, 'F999', 4321)
    expect(media.farmPopularity?.['F999']).toBe(4321)
    expect(media.farms['F999']).toBe('data:image/png;base64,XXX')
    media = upsertPlatformFarmPopularity(media, 'F999', -5)
    expect(media.farmPopularity?.['F999']).toBe(0)
  })
})

describe('platform business channels', () => {
  it('resolves consumer share by bound promoter or staff', () => {
    const config = { promoterRate: 5, staffRate: 3 }
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' }, config, 200)).toEqual({ role: 'promoter', rate: 5, amount: 10 })
    expect(resolveShare({ userId: 'U1', staffAccountId: 'SA002', status: 'bound', boundAt: 'x' }, config, 200)).toEqual({ role: 'staff', rate: 3, amount: 6 })
  })

  it('returns null for pending or unbound binding', () => {
    const config = { promoterRate: 5, staffRate: 3 }
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'pending' }, config, 200)).toBeNull()
    expect(resolveShare({ userId: 'U1', status: 'bound', boundAt: 'x' }, config, 200)).toBeNull()
    expect(resolveShare(null, config, 200)).toBeNull()
    expect(resolveShare({ userId: 'U1', promoterId: 'T001', status: 'bound', boundAt: 'x' }, config, 0)).toBeNull()
  })

  it('uses default share config when nothing published', () => {
    expect(readShareConfig()).toEqual({ promoterRate: 5, staffRate: 3 })
  })


  it('removes seed lives marked as removed', () => {
    localStorage.setItem('agritainment-platform-lives', JSON.stringify({ L001: null }))
    const seed = { id: 'L001', title: 'a', host: 'h', viewers: 0, productName: 'p', productPrice: 1, status: 'live' as const, reminded: false, image: '/i.webp', city: '湘西州' }
    expect(mergePlatformLives([seed])).toEqual([])
  })

  it('keeps published override over seeds', () => {
    localStorage.setItem('agritainment-platform-lives', JSON.stringify({ L001: { id: 'L001', title: 'new', host: 'h', viewers: 0, productName: 'p', productPrice: 1, status: 'preview' as const, reminded: false, image: '/i.webp', city: '湘西州' } }))
    const seed = { id: 'L001', title: 'old', host: 'h', viewers: 0, productName: 'p', productPrice: 1, status: 'live' as const, reminded: false, image: '/i.webp', city: '湘西州' }
    expect(mergePlatformLives([seed])[0].title).toBe('new')
  })

  it('merges published lives over seeds', () => {
    localStorage.removeItem('agritainment-platform-lives')
    const seed = { id: 'L001', title: 'a', host: 'h', viewers: 0, productName: 'p', productPrice: 1, status: 'live' as const, reminded: false, image: '/i.webp', city: '湘西州' }
    expect(mergePlatformLives([seed])).toEqual([seed])
  })

  it('merges published store accounts by id and keeps extra rows', () => {
    const defaults = [{ id: 'SA001', farmId: 'F1', name: 'A', account: 'a', password: '1', role: 'owner' as const, enabled: true }]
    const published = [
      { id: 'SA001', farmId: 'F1', name: 'A2', account: 'a', password: '1', role: 'owner' as const, enabled: true, promoEnabled: true },
      { id: 'SAX', farmId: 'F1', name: 'B', account: 'b', password: '1', role: 'staff' as const, enabled: true }
    ]
    const merged = mergePlatformStoreAccounts(defaults, published)
    expect(merged).toHaveLength(2)
    expect(merged[0].promoEnabled).toBe(true)
    expect(merged[1].id).toBe('SAX')
  })

  it('provides at least one package coupon per core farm', () => {
    const couponByFarm = new Map<string, number>()
    products.filter((item) => item.category === '套餐券').forEach((item) => (item.farmIds || []).forEach((farmId) => couponByFarm.set(farmId, (couponByFarm.get(farmId) || 0) + 1)))
    ;['F001', 'F002', 'F003', 'F004', 'F005', 'F006', 'F007', 'F009'].forEach((farmId) => expect(couponByFarm.get(farmId) || 0).toBeGreaterThanOrEqual(1))
  })
})

describe('user identity (openid anchor)', () => {
  beforeEach(() => localStorage.clear())

  it('keeps mock openid stable on same device', async () => {
    const first = await simulateWechatLogin()
    const second = await simulateWechatLogin()
    expect(second.openid).toBe(first.openid)
  })

  it('creates and reuses local anonymous userId', () => {
    const id1 = getOrCreateUserId()
    const id2 = getOrCreateUserId()
    expect(id1).toBe(id2)
    expect(id1.startsWith('U')).toBe(true)
  })

  it('links openid to userId on first resolve and reuses it later', () => {
    const userId = resolveUserIdentity('mock_openid_abc')
    expect(resolveUserIdByOpenid('mock_openid_abc')).toBe(userId)
    expect(resolveUserIdentity('mock_openid_abc')).toBe(userId)
  })

  it('keeps distinct openids mapped to the same local user until each is linked', () => {
    const a = resolveUserIdentity('openid_A')
    writeUserLink('openid_B', a)
    expect(resolveUserIdByOpenid('openid_B')).toBe(a)
  })
describe('platform after-sale status text', () => {
  beforeEach(() => localStorage.clear())

  it('maps platform after-sale work order to readable status', () => {
    writePlatformAfterSale({ id: 'AS-TEST1', orderId: 'O-TEST1', productName: '测试商品', applicant: '测试门店', type: 'refund', amount: 86, status: 'processing', issue: '质量问题', quantity: 1 })
    expect(readPlatformAfterSaleStatus('O-TEST1')).toBe('售后中')
  })
})
describe('share settlement helpers', () => {
  beforeEach(() => localStorage.clear())

  it('sums pending shares and marks them settled', () => {
    writeShareRecords([
      { id: 'SR-A', userId: 'u1', orderId: 'o1', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 5, amount: 5, createdAt: 'x' },
      { id: 'SR-B', userId: 'u2', orderId: 'o2', orderAmount: 100, role: 'promoter', promoterId: 'T1', rate: 3, amount: 3, createdAt: 'x' }
    ])
    expect(pendingShareAmount('T1')).toBe(8)
    expect(pendingShareTotal()).toBe(8)
    markShareSettled(['SR-A'])
    expect(pendingShareAmount('T1')).toBe(3)
  })
})
})

describe('supplier fulfillment helpers', () => {
  beforeEach(() => localStorage.clear())

  const item = (skuId: string, name: string, quantity: number): OrderItem => ({ productId: skuId, skuId, name, skuName: name, image: '/static/images/bacon.webp', quantity, price: 10 })

  it('computes shortage from actual quantities and clamps out-of-range inputs', () => {
    const items = [item('S1', '腊肉', 10), item('S2', '辣椒酱', 5)]
    expect(computeShortage(items, { S1: 8 })).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }])
    expect(computeShortage(items, { S1: 12, S2: 0 })).toEqual([{ skuId: 'S2', name: '辣椒酱', ordered: 5, actual: 0, shortage: 5 }])
    expect(computeShortage(items, { S1: 10, S2: 5 })).toEqual([])
    expect(computeShortage(items, { S1: -3 })).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 0, shortage: 10 }])
  })

  it('derives supplier metrics across statuses and today counts', () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const order = (id: string, status: OrderStatus, amount: number, createdAt: string, fulfillment?: Partial<SupplierFulfillment>): Order => ({ id, productName: 'x', quantity: 1, amount, customer: 's', channel: 'purchase', status, createdAt, ...(fulfillment ? { supplierFulfillment: { status: 'submitted', shortages: [], handovers: [], updatedAt: '', ...fulfillment } } : {}) })
    const orders = [
      order('A', 'pending', 10, `${today} 09:00`),
      order('B', 'pending', 20, `${today} 09:10`),
      order('C', 'pending', 30, `${today} 09:20`, { status: 'accepted' }),
      order('D', 'shipping', 40, '2026-08-01 09:00', { status: 'shipped' }),
      order('E', 'shipping', 50, '2026-08-01 09:00', { status: 'delivering', shortages: [{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }] }),
      order('F', 'delivered', 60, '2026-08-01 09:00', { status: 'received' })
    ]
    const metrics = deriveSupplierMetrics(orders)
    expect(metrics.toAcceptCount).toBe(2)
    expect(metrics.toDispatchCount).toBe(1)
    expect(metrics.toHandoverCount).toBe(1)
    expect(metrics.deliveringCount).toBe(1)
    expect(metrics.shortageOrderCount).toBe(1)
    expect(metrics.todayOrderCount).toBe(3)
    expect(metrics.todayAmount).toBe(60)
  })

  it('ensures fulfillment from order status for store-submitted orders', () => {
    const order = (status: OrderStatus): Order => ({ id: 'x', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status, createdAt: 'x' })
    expect(ensureSupplierFulfillment(order('pending')).status).toBe('submitted')
    expect(ensureSupplierFulfillment(order('shipping')).status).toBe('shipped')
    expect(ensureSupplierFulfillment(order('delivered')).status).toBe('received')
    expect(ensureSupplierFulfillment(order('unpaid-cancelled')).status).toBe('cancelled')
  })

  it('runs full accept→assign→handover-out→handover-in lifecycle and mirrors order status', () => {
    let order: Order = { id: 'O1', productName: '腊肉', quantity: 10, amount: 380, customer: '石板溪门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-20 09:00', items: [item('S1', '腊肉', 10)] }
    order = acceptSupplierOrder(order, '湘西腊味合作社')!
    expect(order.supplierFulfillment?.status).toBe('accepted')
    order = assignSupplierDriver(order, demoDrivers[0], '湘西腊味合作社')!
    expect(order.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟' })
    expect(order.status).toBe('shipping')
    order = handoverSupplierOut(order, { S1: 8 }, { id: 'sup', name: '湘西腊味合作社', role: 'supplier' })!
    expect(order.supplierFulfillment?.status).toBe('delivering')
    expect(order.supplierFulfillment?.shortages).toEqual([{ skuId: 'S1', name: '腊肉', ordered: 10, actual: 8, shortage: 2 }])
    expect(order.supplierFulfillment?.handovers).toHaveLength(1)
    order = handoverSupplierIn(order, { id: 'D001', name: '张伟', role: 'driver' })!
    expect(order.supplierFulfillment?.status).toBe('received')
    expect(order.status).toBe('delivered')
    expect(order.supplierFulfillment?.handovers).toHaveLength(2)
    expect(order.flow?.some((event) => event.action.includes('到店交接完成'))).toBe(true)
  })

  it('rejects out-of-order transitions and guards reassign', () => {
    let order: Order = { id: 'O2', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    expect(assignSupplierDriver(order, demoDrivers[0], 'sup')).toBeNull()
    order = acceptSupplierOrder(order, 'sup')!
    order = assignSupplierDriver(order, demoDrivers[0], 'sup')!
    expect(acceptSupplierOrder(order, 'sup')).toBeNull()
    expect(handoverSupplierIn(order, { id: 'D001', name: '张伟', role: 'driver' })).toBeNull()
    order = handoverSupplierOut(order, { S1: 1 }, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(handoverSupplierOut(order, { S1: 1 }, { id: 'sup', name: 'sup', role: 'supplier' })).toBeNull()
    expect(reassignSupplierDriver(order, demoDrivers[0], 'sup')).toBeNull()
    const reassigned = reassignSupplierDriver(order, demoDrivers[1], 'sup')!
    expect(reassigned.supplierFulfillment?.driverName).toBe('李强')
    expect(reassigned.flow?.some((event) => event.action.includes('改派司机'))).toBe(true)
  })

  it('ships courier with tracking number and confirms delivered', () => {
    let order: Order = { id: 'O3', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'pending', createdAt: 'x' }
    order = acceptSupplierOrder(order, 'sup')!
    expect(shipSupplierCourier(order, '', 'sup')).toBeNull()
    order = shipSupplierCourier(order, 'SF001', 'sup')!
    expect(order.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'courier', trackingNo: 'SF001' })
    expect(order.trackingNo).toBe('SF001')
    order = handoverSupplierOut(order, {}, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(order.supplierFulfillment?.status).toBe('delivering')
    order = confirmCourierDelivered(order, { id: 'sup', name: 'sup', role: 'supplier' })!
    expect(order.status).toBe('delivered')
    expect(order.supplierFulfillment?.status).toBe('received')
  })

  it('manages driver storage and active-task counts', () => {
    expect(readPlatformDrivers()).toBeNull()
    writePlatformDrivers(demoDrivers)
    expect(readPlatformDrivers()).toHaveLength(3)
    expect(mergePlatformDrivers(demoDrivers, readPlatformDrivers())).toHaveLength(3)
    expect(mergePlatformDrivers(demoDrivers, [{ ...demoDrivers[0], name: '张师傅' }])).toHaveLength(3)
    expect(mergePlatformDrivers([], readPlatformDrivers())).toHaveLength(3)
    const orders: Order[] = [
      { id: 'A', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'shipping', createdAt: 'x', supplierFulfillment: { status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } },
      { id: 'B', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'shipping', createdAt: 'x', supplierFulfillment: { status: 'delivering', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } },
      { id: 'C', productName: 'x', quantity: 1, amount: 1, customer: 's', channel: 'purchase', status: 'delivered', createdAt: 'x', supplierFulfillment: { status: 'received', shipType: 'driver', driverId: 'D001', driverName: '张伟', shortages: [], handovers: [], updatedAt: 'x' } }
    ]
    expect(driverActiveTaskCounts(orders)).toEqual({ D001: 2 })
    expect(validateSupplierAccount('supplier', '123456')).toBe(true)
    expect(validateSupplierAccount('supplier', 'bad')).toBe(false)
    expect(findActiveDriver(demoDrivers, 'driver01', '123456')?.id).toBe('D001')
    expect(findActiveDriver(demoDrivers, 'driver01', 'bad')).toBeNull()
    expect(findDriverByAccount(demoDrivers, 'driver01')?.status).toBe('active')
  })
})
