import { defineStore } from 'pinia'
import type { BalanceEntry, Booking, CAddress, CatalogProduct, CatalogState, FarmStore, Member, MockScenario, Order, Product, PromotionRecord, Role, ShareRecord, StoreAccount, StoreCatalogSelection, StorefrontOrder, TenantConfig, UserBinding } from '@agritainment/shared'
import { abortCatalogTransaction, allocateStoreCatalogCommission, applyCatalogStockOperation, applyPlatformMedia, buildPortalUrl, calcCartTotal, catalogProductToProduct, catalogProductToStoreProduct, catalogProductsForAudience, cloneSeed, commitCatalogTransaction, createId, isExpressDeliverable, markCatalogTransactionStockApplied, members, mergeEntitySeeds, mergePersistedDefaults, mergePlatformStoreAccounts, prepareCatalogTransaction, readCatalogState, readPendingCatalogTransactions, readPlatformOrders, readPlatformStoreAccounts, readShareConfig, readShareRecords, readStoreCatalogSelectionState, readUserBindings, resolveShare, resolveUserIdByOpenid, resolveUserIdentity, round2, saveStoreCatalogSelection, simulateWechatLogin, storeAccounts, suppliers, updateCatalogStock, upsertUserBinding, writePlatformOrder, writePlatformStoreAccounts, writeShareRecord } from '@agritainment/shared'
import { resolveRuntimeTenant } from '../config/tenant'
import { farmhouseRepository } from '../services/repository'

interface CartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: string
  price: number
  stock: number
  quantity: number
}

interface FarmhouseTransactionPayload {
  order?: StorefrontOrder
  memberBalance?: number
  memberPoints?: number
  balanceEntry?: BalanceEntry
  platformOrder?: Order
  shareRecords?: ShareRecord[]
  userBinding?: UserBinding
}

function buildOrderShareReversals(orderId: string): ShareRecord[] {
  const records = readShareRecords() || []
  const reversals: ShareRecord[] = []
  records.filter((record) => record.orderId === orderId && record.status !== 'reversed').forEach((record) => {
    if (record.settled) {
      const correctionId = `${record.id}:reverse`
      if (!records.some((candidate) => candidate.id === correctionId)) {
        reversals.push({ ...record, id: correctionId, amount: -record.amount, status: 'pending', settled: false, createdAt: new Date().toLocaleString('zh-CN') })
      }
    } else {
      reversals.push({ ...record, status: 'reversed' })
    }
  })
  return reversals
}

function applyFarmhouseTransactionSideEffects(payload: FarmhouseTransactionPayload): boolean {
  if (payload.platformOrder && !writePlatformOrder(payload.platformOrder)) return false
  if (payload.userBinding && !upsertUserBinding(payload.userBinding)) return false
  if (payload.shareRecords && !payload.shareRecords.every((record) => writeShareRecord(record))) return false
  return true
}

function reverseOrderShares(orderId: string): boolean {
  return buildOrderShareReversals(orderId).every((record) => writeShareRecord(record))
}

function selectedProduct(product: CatalogProduct, selection?: StoreCatalogSelection): Product {
  return selection ? catalogProductToStoreProduct(product, selection) : catalogProductToProduct(product)
}

export interface Room {
  id: string
  name: string
  emoji: string
  image: string
  capacity: string
  sessions: string
  status: '可预订' | '仅余晚市'
  people: number
}

export interface FoodItem {
  id: string
  name: string
  description: string
  price: number
  originalPrice?: number
  emoji?: string
  image: string
}

const seedRooms = (): Room[] => [
  { id: 'R001', name: '观溪雅间', image: '/static/images/mountain.webp', emoji: '🪟', capacity: '8–10 人 · 临溪景观 · 最低消费 ¥600', sessions: '午市 11:00 / 晚市 17:30', status: '可预订', people: 8 },
  { id: 'R002', name: '竹林包厢', image: '/static/images/field.webp', emoji: '🏮', capacity: '6–8 人 · 竹林环绕 · 最低消费 ¥480', sessions: '午市 11:00 / 晚市 17:30', status: '可预订', people: 6 },
  { id: 'R003', name: '丰收大厅', image: '/static/images/farmhouse.webp', emoji: '🍂', capacity: '20–30 人 · 适合家宴聚会 · 最低消费 ¥1500', sessions: '晚市 17:30', status: '仅余晚市', people: 20 }
]

interface FarmhouseState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  tenant: TenantConfig | null
  farm: FarmStore | null
  member: Member
  role: Role
  products: Product[]
  selectableProducts: Product[]
  catalogRevision: number
  selectionRevision: number
  catalogSelections: StoreCatalogSelection[]
  cart: CartLine[]
  bookings: Booking[]
  orders: StorefrontOrder[]
  rooms: Room[]
  shares: number
  balanceEntries: BalanceEntry[]
  promotionRecords: PromotionRecord[]
  foods: FoodItem[]
  checkoutError: string
  auth: { isLoggedIn: boolean; openid: string }
  storeAccounts: StoreAccount[]
  loggedAccountId: string
  currentUserId: string
  pendingUserId: string
  deliveryAddress: string
  referrer: { type?: 'promoter' | 'staff'; name?: string; promoterId?: string; staffAccountId?: string; liveId?: string }
}

export const useFarmhouseStore = defineStore('storefront', {
  state: (): FarmhouseState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    tenant: null,
    farm: null,
    member: cloneSeed(members[0]),
    role: 'customer',
    products: [],
    selectableProducts: [],
    catalogRevision: 0,
    selectionRevision: 0,
    catalogSelections: [],
    cart: [],
    rooms: seedRooms(),
    bookings: [
      { id: 'B2026081001', type: 'room', name: '观溪雅间', image: '/static/images/mountain.webp', date: `今天 ${new Date().getMonth() + 1}/${new Date().getDate()}`, session: '晚市 17:30', people: 8, status: 'reserved' },
      { id: 'B2026080901', type: 'room', name: '观溪雅间', image: '/static/images/mountain.webp', date: '8/9', session: '晚市 17:30', people: 8, status: 'completed' },
      { id: 'B2026081101', type: 'service', name: '柴火土菜宴', image: '/static/images/farmhouse.webp', date: '8/11', session: '午市 11:30', people: 6, status: 'reserved', emoji: '🍲', amount: 388 },
      { id: 'B2026081201', type: 'room', name: '山景阳台房', image: '/static/images/mountain.webp', date: '8/12', session: '全天', people: 2, status: 'reserved', emoji: '🛏', amount: 268 },
      { id: 'B2026080801', type: 'package', name: '双人套餐券', image: '/static/images/farmhouse.webp', date: '8/8', session: '晚市 17:30', people: 2, status: 'completed', emoji: '🎟', amount: 128 },
      { id: 'B2026081301', type: 'room', name: '亲子包厢', image: '/static/images/field.webp', date: '8/13', session: '午市 11:30', people: 5, status: 'reserved', emoji: '🧸' },
      { id: 'B2026081401', type: 'service', name: '六人欢聚宴', image: '/static/images/farmhouse.webp', date: '8/14', session: '晚市 17:30', people: 6, status: 'reserved', emoji: '🥘', amount: 588 },
      { id: 'B2026080601', type: 'room', name: '江景大床房', image: '/static/images/mountain.webp', date: '8/6', session: '全天', people: 2, status: 'cancelled', emoji: '🛏', amount: 268 }
    ],
    orders: [
      { id: 'SO2026080918', amount: 68, itemCount: 1, status: '待收货', createdAt: '2026-08-09 18:32', items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃 5 斤礼盒', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 1, price: 68 }] },
      { id: 'SO2026081012', amount: 119.8, itemCount: 1, status: '待发货', createdAt: '2026-08-10 12:05', items: [{ productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉 500g', skuName: '500g', image: '/static/images/bacon.webp', quantity: 2, price: 59.9 }] },
      { id: 'SO2026081018', amount: 136, itemCount: 2, status: '已完成', createdAt: '2026-08-10 18:20', items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃 5 斤礼盒', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 2, price: 68 }] },
      { id: 'SO2026081110', amount: 39.9, itemCount: 1, status: '已发货', createdAt: '2026-08-11 10:40', items: [{ productId: 'P004', skuId: 'P004-2', name: '农家自制剁辣椒 2瓶', skuName: '2瓶装', image: '/static/images/chili.webp', quantity: 1, price: 39.9 }] },
      { id: 'SO2026081121', amount: 288, itemCount: 1, status: '已完成', createdAt: '2026-08-11 21:15', items: [{ productId: 'P007', skuId: 'P007-4P', name: '农家四人欢聚套餐券', skuName: '四人套餐券', image: '/static/images/farmhouse.webp', quantity: 1, price: 288 }] },
      { id: 'SO2026081209', amount: 99.8, itemCount: 1, status: '待收货', createdAt: '2026-08-12 09:28', items: [{ productId: 'P006', skuId: 'P006-5K', name: '石板溪生态富硒米 5kg', skuName: '5kg', image: '/static/images/rice.webp', quantity: 2, price: 49.9 }] }
    ],
    shares: 23,
    balanceEntries: [{ id: 'BL2026080901', type: 'recharge', amount: 300, balance: 386.5, description: '会员储值充值', createdAt: '2026-08-09 10:18' }],
    promotionRecords: [],
    foods: [],
    checkoutError: '',
    auth: { isLoggedIn: false, openid: '' },
    storeAccounts: [],
    loggedAccountId: '',
    currentUserId: '',
    pendingUserId: '',
    deliveryAddress: '',
    referrer: {}
  }),
  getters: {
    isListed: (state) => (productId: string) => state.catalogSelections.some((item) => item.productId === productId && item.listed),
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => calcCartTotal(state.cart.map(({ price, quantity }) => ({ price, quantity }))),
    balance: (state) => state.member.balance,
    points: (state) => state.member.points,
    canOperate: (state) => state.role === 'staff' || state.role === 'manager',
    canSelect: (state) => state.role === 'manager'
  },
  actions: {
    async initialize(force = false, farm?: unknown) {
      if ((!force && this.initialized) || this.loading) return
      const runtimeTenant = resolveRuntimeTenant(farm)
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.tenant?.farmId === runtimeTenant.farmId && !!this.farm
      this.loading = true
      this.error = ''
      try {
        const [storefront, catalogState] = await Promise.all([
          farmhouseRepository.loadStorefront(this.mockScenario, runtimeTenant),
          farmhouseRepository.loadCatalogState(this.mockScenario)
        ])
        this.$patch({
          tenant: hasPersistedData ? mergePersistedDefaults(storefront.tenant, this.tenant) : storefront.tenant,
          farm: hasPersistedData ? mergePersistedDefaults(storefront.farm, this.farm) : storefront.farm,
          member: hasPersistedData ? mergePersistedDefaults(storefront.member, this.member) : storefront.member,
          foods: hasPersistedData ? mergeEntitySeeds(storefront.foods, this.foods) : storefront.foods,
          initialized: true
        })
        this.applyCatalogState(catalogState)
        if (this.farm) applyPlatformMedia([this.farm], this.products)
        this.storeAccounts = mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
        this.recoverCatalogTransactions()
        if (!this.deliveryAddress) this.deliveryAddress = this.tenant?.address || ''
        if (this.auth.isLoggedIn && this.auth.openid) this.setAuthorizedIdentity(this.auth.openid)
        this.cart.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, price: sku.price, stock: sku.stock })
        })
        this.syncCourierOrders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    applyCatalogState(state: CatalogState) {
      const storeId = this.tenant?.farmId || this.farm?.id || 'F001'
      const selectionState = readStoreCatalogSelectionState()
      const selections = selectionState.selections.filter((item) => item.storeId === storeId)
      const selectionByProduct = new Map(selections.map((item) => [item.productId, item]))
      const candidates = catalogProductsForAudience(state, 'farmhouse-selection')
      this.catalogRevision = state.revision
      this.selectionRevision = selectionState.revision
      this.catalogSelections = selections
      this.selectableProducts = candidates.map((product) => selectedProduct(product))
      this.products = candidates
        .filter((product) => selectionByProduct.get(product.id)?.listed)
        .map((product) => selectedProduct(product, selectionByProduct.get(product.id)))
      applyPlatformMedia(null, this.selectableProducts)
      applyPlatformMedia(null, this.products)
      this.cart.forEach((line) => {
        const sku = this.products.find((product) => product.id === line.productId)?.skus.find((item) => item.id === line.skuId)
        if (sku) line.stock = sku.stock
      })
    },
    refreshCatalog() {
      const state = readCatalogState()
      if (!state) return false
      this.applyCatalogState(state)
      return true
    },
    recoverCatalogTransactions() {
      for (const entry of readPendingCatalogTransactions('farmhouse')) {
        const payload = entry.payload as FarmhouseTransactionPayload
        if (!payload.order || !Number.isFinite(payload.memberBalance) || !Number.isFinite(payload.memberPoints)) continue
        if (entry.status === 'prepared') {
          const catalog = readCatalogState()
          if (!catalog) continue
          const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, catalog.revision)
          if (!result || !markCatalogTransactionStockApplied(entry.id)) continue
          this.applyCatalogState(result.state)
        }
        if (!applyFarmhouseTransactionSideEffects(payload)) continue
        const existing = this.orders.find((order) => order.id === payload.order!.id)
        if (existing) Object.assign(existing, cloneSeed(payload.order))
        else this.orders.unshift(cloneSeed(payload.order))
        this.member.balance = Number(payload.memberBalance)
        this.member.points = Number(payload.memberPoints)
        if (payload.balanceEntry && !this.balanceEntries.some((item) => item.id === payload.balanceEntry!.id)) this.balanceEntries.unshift(cloneSeed(payload.balanceEntry))
        commitCatalogTransaction(entry.id)
      }
      const latest = readCatalogState()
      if (latest && latest.revision !== this.catalogRevision) this.applyCatalogState(latest)
    },
    syncCourierOrders() {
      const platformOrders = readPlatformOrders()
      if (!platformOrders) return
      this.orders.forEach((order) => {
        if (!order.platformOrderId) return
        const platformOrder = platformOrders[order.platformOrderId]
        const fulfillment = platformOrder?.supplierFulfillment
        if (!fulfillment) return
        if (fulfillment.status === 'received' || fulfillment.status === 'completed') order.status = '已完成'
        else if (fulfillment.status === 'shipped' || fulfillment.status === 'delivering') order.status = '已发货'
        else order.status = '待发货'
        order.trackingNo = fulfillment.trackingNo
        order.courier = fulfillment.shipType === 'driver' ? '司机配送' : '快递直发'
        order.logistics = platformOrder?.logistics?.length ? platformOrder.logistics : order.logistics
      })
    },
    setMockScenario(scenario: MockScenario) {
      this.mockScenario = scenario
      this.initialized = false
    },
    setRole(role: Role) {
      this.role = role
    },
    addToCart(product: Product, skuId?: string) {
      if (product.skus.length > 1 && !skuId) return 'sku-required' as const
      const sku = product.skus.find((item) => item.id === skuId) || product.skus[0]
      if (!sku || sku.stock <= 0) {
        this.checkoutError = `${product.name}库存不足`
        return 'out-of-stock' as const
      }
      const line = this.cart.find((item) => item.productId === product.id && item.skuId === sku.id)
      if (line) {
        if (line.quantity >= sku.stock) {
          this.checkoutError = `${product.name}（${sku.name}）库存不足`
          return 'out-of-stock' as const
        }
        line.quantity += 1
        line.stock = sku.stock
      } else {
        this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.price, stock: sku.stock, quantity: 1 })
      }
      this.checkoutError = ''
      return 'added' as const
    },
    changeCart(productId: string, skuId: string, delta: number) {
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      if (!line) return false
      const product = this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (delta > 0 && (!sku || line.quantity + delta > sku.stock)) {
        this.checkoutError = `${line.name}（${line.skuName}）库存不足`
        return false
      }
      line.quantity += delta
      if (line.quantity <= 0) this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId))
      else line.stock = sku?.stock || line.stock
      this.checkoutError = ''
      return true
    },
    checkout(payload: { deliveryMode?: 'pickup' | 'courier'; address?: string } = {}) {
      this.checkoutError = ''
      if (!this.cart.length) {
        this.checkoutError = '购物车为空'
        return false
      }
      const insufficient = this.cart.find((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || !sku || sku.stock < line.quantity
      })
      if (insufficient) {
        this.checkoutError = `${insufficient.name}库存不足`
        return false
      }
      const expressCart = this.cart.filter((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        return !!product && isExpressDeliverable(product)
      })
      const wantsCourier = payload.deliveryMode === 'courier' && expressCart.length > 0
      if (wantsCourier && !payload.address?.trim()) {
        this.checkoutError = '请填写收货地址'
        return false
      }
      if (readStoreCatalogSelectionState().revision !== this.selectionRevision) {
        this.refreshCatalog()
        this.checkoutError = '门店价格已更新，请确认后重试'
        return false
      }
      const total = this.cartTotal
      if (this.member.balance < total) {
        this.checkoutError = '会员余额不足'
        return false
      }
      const expectedRevision = this.catalogRevision
      const itemCount = this.cartCount
      const orderId = createId('SO')
      const pointsAwarded = Math.floor(total)
      const cartItems = this.cart.map((item) => {
        const product = this.products.find((p) => p.id === item.productId)
        const courier = wantsCourier && !!product && isExpressDeliverable(product)
        return { productId: item.productId, skuId: item.skuId, name: item.name, skuName: item.skuName, image: item.image, quantity: item.quantity, price: item.price, deliveryMode: courier ? 'courier' as const : 'pickup' as const }
      })
      const order: StorefrontOrder = {
        id: orderId, amount: total, itemCount, status: '待发货', createdAt: new Date().toLocaleString('zh-CN'),
        items: cartItems, pointsAwarded,
        delivery: wantsCourier ? { mode: 'courier', address: payload.address?.trim() } : { mode: 'pickup' },
        platformOrderId: wantsCourier ? `FH-${orderId}` : undefined
      }
      const balanceEntry: BalanceEntry = { id: `${orderId}:consume`, type: 'consume', amount: -total, balance: round2(this.member.balance - total), description: `商城订单消费 · ${itemCount} 件商品`, createdAt: new Date().toLocaleString('zh-CN') }
      const inventoryChanges = this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const operationId = `${orderId}:reserve`
      const courierItems = cartItems.filter((item) => item.deliveryMode === 'courier')
      const courierAmount = round2(courierItems.reduce((sum, item) => sum + item.price * item.quantity, 0))
      const firstCourierProduct = courierItems.length ? this.products.find((product) => product.id === courierItems[0]?.productId) : undefined
      const address: CAddress | undefined = courierItems.length
        ? { id: `${orderId}-ADDR`, userId: this.auth.openid || '', receiver: this.member.name, phone: this.member.phone || '', region: payload.address?.trim() || '', detail: '', isDefault: false, updatedAt: new Date().toISOString() }
        : undefined
      const platformOrder: Order | undefined = courierItems.length
        ? {
            id: `FH-${orderId}`, productName: courierItems[0]?.name || '特产商品', quantity: courierItems.reduce((sum, item) => sum + item.quantity, 0), amount: courierAmount,
            customer: `游客 · ${this.member.name}`, channel: 'shop', status: 'pending', createdAt: new Date().toLocaleString('zh-CN'),
            items: courierItems, supplierId: suppliers.find((supplier) => supplier.name === firstCourierProduct?.supplier)?.id,
            supplierOrderLink: { source: 'farmhouse-courier', sourceOrderId: orderId, deliveryAddress: address! }
          }
        : undefined
      const shareSideEffects = this.buildOrderShareSideEffects(orderId, cartItems)
      const transactionPayload: FarmhouseTransactionPayload & { order: StorefrontOrder; memberBalance: number; memberPoints: number; balanceEntry: BalanceEntry; cartItems: typeof cartItems } = {
        order, memberBalance: balanceEntry.balance, memberPoints: this.member.points + pointsAwarded, balanceEntry, cartItems,
        platformOrder, shareRecords: shareSideEffects.shareRecord ? [shareSideEffects.shareRecord] : undefined, userBinding: shareSideEffects.userBinding
      }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'farmhouse', action: 'reserve', inventoryChanges, payload: transactionPayload })) {
        this.checkoutError = '订单准备失败，请稍后重试'
        return false
      }
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, expectedRevision)
      if (!stockResult) {
        abortCatalogTransaction(operationId)
        const latest = readCatalogState()
        if (latest) this.applyCatalogState(latest)
        this.checkoutError = latest?.revision !== expectedRevision ? '商品库存已更新，请重试' : '商品库存不足，请调整后重试'
        return false
      }
      if (!markCatalogTransactionStockApplied(operationId)) {
        this.applyCatalogState(stockResult.state)
        this.checkoutError = '订单处理中，请刷新后重试'
        return false
      }
      const soldQuantities = new Map(this.cart.map((line) => [line.productId, line.quantity]))
      this.applyCatalogState(stockResult.state)
      this.products.forEach((product) => { product.sales += soldQuantities.get(product.id) || 0 })
      this.member.balance = transactionPayload.memberBalance
      this.member.points = transactionPayload.memberPoints
      this.orders.unshift(order)
      if (!applyFarmhouseTransactionSideEffects(transactionPayload)) { this.checkoutError = '订单处理中，请刷新后重试'; return false }
      this.balanceEntries.unshift(balanceEntry)
      if (!commitCatalogTransaction(operationId)) { this.checkoutError = '订单处理中，请刷新后重试'; return false }
      this.cart = []
      return true
    },
    cancelStorefrontOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== '待发货' || order.inventoryReleased || order.balanceRefunded) return false
      const catalog = readCatalogState()
      if (!catalog || catalog.revision !== this.catalogRevision) { this.refreshCatalog(); this.checkoutError = '商品库存已更新，请重试'; return false }
      const nextOrder = cloneSeed(order)
      nextOrder.status = '已取消'; nextOrder.inventoryReleased = true; nextOrder.balanceRefunded = true
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:release`
      const nextBalance = round2(this.member.balance + order.amount)
      const nextPoints = Math.max(0, this.member.points - (order.pointsAwarded || 0))
      const balanceEntry: BalanceEntry = { id: `${order.id}:refund`, type: 'refund', amount: order.amount, balance: nextBalance, description: `商城订单取消退款 · ${order.itemCount} 件商品`, createdAt: new Date().toLocaleString('zh-CN') }
      const platformOrder = order.platformOrderId ? readPlatformOrders()?.[order.platformOrderId] : undefined
      const transactionPayload: FarmhouseTransactionPayload = {
        order: nextOrder, memberBalance: nextBalance, memberPoints: nextPoints, balanceEntry,
        platformOrder: platformOrder ? { ...platformOrder, status: 'unpaid-cancelled' } : undefined,
        shareRecords: buildOrderShareReversals(order.id)
      }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'farmhouse', action: 'release', inventoryChanges, payload: transactionPayload })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, catalog.revision)
      if (!stockResult) { this.refreshCatalog(); this.checkoutError = '商品库存已更新，请重试'; return false }
      if (!markCatalogTransactionStockApplied(operationId) || !applyFarmhouseTransactionSideEffects(transactionPayload)) return false
      this.applyCatalogState(stockResult.state)
      Object.assign(order, nextOrder)
      this.member.balance = nextBalance; this.member.points = nextPoints
      this.balanceEntries.unshift(balanceEntry)
      return commitCatalogTransaction(operationId)
    },
    requestStorefrontAfterSale(id: string, type: 'refund' | 'return') {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== '已完成' || order.afterSaleType) return false
      order.afterSaleType = type
      order.status = type === 'refund' ? '退款中' : '退货中'
      return true
    },
    completeStorefrontAfterSale(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || (order.status !== '退款中' && order.status !== '退货中') || order.balanceRefunded) return false
      const nextBalance = round2(this.member.balance + order.amount)
      const nextPoints = Math.max(0, this.member.points - (order.pointsAwarded || 0))
      if (order.afterSaleType === 'refund') {
        if (!reverseOrderShares(order.id)) return false
        order.status = '已退款'; order.balanceRefunded = true
        this.member.balance = nextBalance; this.member.points = nextPoints
        this.balanceEntries.unshift({ id: `${order.id}:refund`, type: 'refund', amount: order.amount, balance: nextBalance, description: '商城订单退款', createdAt: new Date().toLocaleString('zh-CN') })
        return true
      }
      if (order.afterSaleType !== 'return' || order.inventoryReleased) return false
      const catalog = readCatalogState()
      if (!catalog || catalog.revision !== this.catalogRevision) { this.refreshCatalog(); return false }
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:release`
      const nextOrder = { ...cloneSeed(order), status: '已退货' as const, inventoryReleased: true, balanceRefunded: true }
      const balanceEntry: BalanceEntry = { id: `${order.id}:refund`, type: 'refund', amount: order.amount, balance: nextBalance, description: '商城退货退款', createdAt: new Date().toLocaleString('zh-CN') }
      const transactionPayload: FarmhouseTransactionPayload = { order: nextOrder, memberBalance: nextBalance, memberPoints: nextPoints, balanceEntry, shareRecords: buildOrderShareReversals(order.id) }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'farmhouse', action: 'release', inventoryChanges, payload: transactionPayload })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, catalog.revision)
      if (!stockResult || !markCatalogTransactionStockApplied(operationId) || !applyFarmhouseTransactionSideEffects(transactionPayload)) return false
      this.applyCatalogState(stockResult.state); Object.assign(order, nextOrder)
      this.member.balance = nextBalance; this.member.points = nextPoints
      this.balanceEntries.unshift(balanceEntry)
      return commitCatalogTransaction(operationId)
    },
    submitBooking(payload: Omit<Booking, 'id' | 'status'>) {
      const duplicated = this.bookings.some((item) => item.status === 'reserved' && item.type === payload.type && item.name === payload.name && item.date === payload.date && item.session === payload.session)
      if (duplicated) return false
      this.bookings.unshift({ ...payload, id: createId('B'), status: 'reserved' })
      return true
    },
    cancelBooking(id: string) {
      const item = this.bookings.find((booking) => booking.id === id)
      if (!item || item.status !== 'reserved') return false
      item.status = 'cancelled'
      return true
    },
    recharge(amount: number) {
      if (amount <= 0) return false
      this.member.balance = Math.round((this.member.balance + amount) * 100) / 100
      this.member.points += Math.floor(amount / 10)
      this.balanceEntries.unshift({ id: createId('BL'), type: 'recharge', amount, balance: this.member.balance, description: '会员储值充值', createdAt: new Date().toLocaleString('zh-CN') })
      return true
    },
    setSkuStock(productId: string, skuId: string, stock: number) {
      const product = this.selectableProducts.find((item) => item.id === productId) || this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      const nextStock = Math.max(0, Math.round(Number(stock) || 0))
      if (!product || !sku) return false
      const delta = nextStock - sku.stock
      if (!delta) return true
      const next = updateCatalogStock([{ productId, skuId, quantity: delta }], this.catalogRevision)
      if (!next) {
        this.refreshCatalog()
        this.checkoutError = '商品库存已更新，请重试'
        return false
      }
      this.applyCatalogState(next)
      return true
    },
    toggleListed(productId: string) {
      const product = this.selectableProducts.find((item) => item.id === productId)
      const selection = this.catalogSelections.find((item) => item.productId === productId)
      if (!product || !selection) return false
      const saved = saveStoreCatalogSelection({ ...selection, listed: !selection.listed }, this.selectionRevision)
      if (!saved) {
        this.refreshCatalog()
        this.checkoutError = '门店选品已更新，请重新提交'
        return false
      }
      return this.refreshCatalog()
    },
    listProduct(productId: string, retailPrice: number | Record<string, number>) {
      const source = this.selectableProducts.find((item) => item.id === productId)
      if (!source) return false
      const skuRetailPrices = typeof retailPrice === 'number'
        ? Object.fromEntries(source.skus.map((sku) => [sku.id, round2(sku.price + (retailPrice - source.price))]))
        : Object.fromEntries(Object.entries(retailPrice).map(([skuId, price]) => [skuId, round2(Number(price))]))
      if (source.skus.some((sku) => !Number.isFinite(skuRetailPrices[sku.id]) || skuRetailPrices[sku.id] <= sku.cost)) return false
      const storeId = this.tenant?.farmId || this.farm?.id || 'F001'
      if (!saveStoreCatalogSelection({ storeId, productId, listed: true, skuRetailPrices }, this.selectionRevision)) {
        this.refreshCatalog()
        this.checkoutError = '门店选品已更新，请重新提交'
        return false
      }
      return this.refreshCatalog()
    },
    addRoom(payload: Omit<Room, 'id'>) {
      if (!payload.name.trim()) return false
      this.rooms.unshift({ ...payload, id: createId('R') })
      return true
    },
    updateRoom(id: string, payload: Omit<Room, 'id'>) {
      const room = this.rooms.find((item) => item.id === id)
      if (!room || !payload.name.trim()) return false
      Object.assign(room, payload)
      return true
    },
    removeRoom(id: string) {
      const index = this.rooms.findIndex((item) => item.id === id)
      if (index < 0) return false
      this.rooms.splice(index, 1)
      return true
    },
    addFood(payload: Omit<FoodItem, 'id'>) {
      if (!payload.name.trim() || payload.price <= 0) return false
      this.foods.unshift({ ...payload, id: createId('FD') })
      return true
    },
    updateFood(id: string, payload: Omit<FoodItem, 'id'>) {
      const food = this.foods.find((item) => item.id === id)
      if (!food || !payload.name.trim() || payload.price <= 0) return false
      Object.assign(food, payload)
      return true
    },
    removeFood(id: string) {
      const index = this.foods.findIndex((item) => item.id === id)
      if (index < 0) return false
      this.foods.splice(index, 1)
      return true
    },
    verifyBooking(id: string) {
      const item = this.bookings.find((booking) => booking.id === id)
      if (!item || item.status !== 'reserved') return false
      item.status = 'completed'
      return true
    },
    repeatOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order) return false
      let added = 0
      order.items.forEach((item) => {
        const product = this.products.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        if (!product || !sku || sku.stock <= 0) return
        const quantity = Math.min(item.quantity, sku.stock)
        const line = this.cart.find((candidate) => candidate.productId === item.productId && candidate.skuId === item.skuId)
        if (line) line.quantity = Math.min(line.quantity + quantity, sku.stock)
        else this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.price, stock: sku.stock, quantity })
        added += 1
      })
      return added > 0
    },
    sharePromotion() {
      this.shares += 1
      const existing = this.promotionRecords.find((item) => item.targetId === (this.tenant?.code || 'store'))
      if (existing) {
        existing.shareCount += 1
        existing.createdAt = new Date().toLocaleString('zh-CN')
        return existing
      }
      const record: PromotionRecord = {
        id: createId('PR'), targetType: 'farm', targetId: this.tenant?.code || 'store', targetName: this.tenant?.name || '农家乐',
        link: buildPortalUrl('user', 'pages/index/index', { promoter: 'member', activity: `farm:${this.tenant?.code || 'store'}` }, import.meta.env.VITE_PORTAL_ORIGIN || ''), shareCount: 1, lockedFans: 0,
        estimatedCommission: 0, createdAt: new Date().toLocaleString('zh-CN')
      }
      this.promotionRecords.unshift(record)
      return record
    },
    shareProductPromotion(productId: string) {
      const product = this.products.find((item) => item.id === productId)
      if (!product) return
      this.shares += 1
      const existing = this.promotionRecords.find((item) => item.targetType === 'product' && item.targetId === productId)
      if (existing) {
        existing.shareCount += 1
        existing.createdAt = new Date().toLocaleString('zh-CN')
        return existing
      }
      const record: PromotionRecord = {
        id: createId('PR'), targetType: 'product', targetId: product.id, targetName: product.name,
        link: buildPortalUrl('user', 'pages/index/index', { activity: `product:${product.id}`, store: this.tenant?.code || 'store' }, import.meta.env.VITE_PORTAL_ORIGIN || ''), shareCount: 1, lockedFans: 0,
        estimatedCommission: 0, createdAt: new Date().toLocaleString('zh-CN')
      }
      this.promotionRecords.unshift(record)
      return record
    },
    async wechatLogin() {
      const { openid } = await simulateWechatLogin()
      this.auth = { isLoggedIn: true, openid }
      this.setAuthorizedIdentity(openid)
      return true
    },
    setAuthorizedIdentity(openid: string) {
      if (!openid.trim()) return null
      const linked = resolveUserIdByOpenid(openid)
      this.currentUserId = linked || resolveUserIdentity(openid)
      this.pendingUserId = ''
      if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', this.currentUserId)
      this.applyReferrerBinding()
      return this.currentUserId
    },
    loginWithAccount(account: string, password: string) {
      const match = this.storeAccounts.find((item) => item.farmId === this.tenant?.farmId && item.account === account && item.password === password && item.enabled)
      if (!match) return false
      this.auth = { isLoggedIn: true, openid: `mock_account_${account}` }
      this.role = match.role === 'owner' ? 'manager' : 'staff'
      this.loggedAccountId = match.id
      return true
    },
    buildOrderShareSideEffects(orderId: string, itemsOrAmount: number | Array<{ productId: string; quantity: number; price: number }>): { userBinding?: UserBinding; shareRecord?: ShareRecord } {
      const bindings = readUserBindings() ?? {}
      const binding = bindings[this.currentUserId]
      const boundBinding = binding ? { ...binding, status: 'bound' as const, boundAt: binding.boundAt || new Date().toLocaleString('zh-CN') } : null
      if (typeof itemsOrAmount === 'number') {
        const share = resolveShare(boundBinding, readShareConfig(), itemsOrAmount)
        if (!share) return { userBinding: boundBinding || undefined }
        const beneficiary = boundBinding?.promoterId ? { promoterId: boundBinding.promoterId } : boundBinding?.staffAccountId ? { staffAccountId: boundBinding.staffAccountId } : {}
        return { userBinding: boundBinding || undefined, shareRecord: { id: `SR-${orderId}`, userId: this.currentUserId, orderId, orderAmount: itemsOrAmount, role: share.role, ...beneficiary, rate: share.rate, amount: share.amount, status: 'pending', createdAt: new Date().toLocaleString('zh-CN') } }
      }
      const orderAmount = round2(itemsOrAmount.reduce((sum, item) => sum + item.price * item.quantity, 0))
      if (orderAmount <= 0) return { userBinding: boundBinding || undefined }
      const promoterId = boundBinding?.promoterId
      const staffAccountId = boundBinding?.staffAccountId || (!promoterId
        ? this.storeAccounts.find((account) => account.farmId === (this.tenant?.farmId || this.farm?.id || 'F001') && account.role === 'owner' && account.enabled)?.id
        : undefined)
      const allocation = allocateStoreCatalogCommission(itemsOrAmount.map((item) => {
        const product = this.products.find((candidate) => candidate.id === item.productId)
        return {
          unitPrice: item.price,
          quantity: item.quantity,
          promoterCommissionRate: product?.promoterCommissionRate ?? product?.commissionRate ?? 0,
          storeCommissionRate: product?.storeCommissionRate ?? product?.staffCommissionRate ?? 0
        }
      }), promoterId ? { type: 'promoter', beneficiaryId: promoterId } : staffAccountId && boundBinding?.staffAccountId ? { type: 'staff', beneficiaryId: staffAccountId } : null, staffAccountId || '')
      if (!allocation || allocation.amount <= 0) return { userBinding: boundBinding || undefined }
      return { userBinding: boundBinding || undefined, shareRecord: {
        id: `SR-${orderId}`, userId: this.currentUserId, orderId, orderAmount,
        role: allocation.beneficiaryType === 'promoter' ? 'promoter' : 'staff',
        ...(allocation.beneficiaryType === 'promoter' ? { promoterId: allocation.beneficiaryId } : { staffAccountId: allocation.beneficiaryId }),
        rate: round2(allocation.amount / orderAmount * 100), amount: allocation.amount, status: 'pending',
        createdAt: new Date().toLocaleString('zh-CN')
      } }
    },
    resolveOrderShare(orderId: string, itemsOrAmount: number | Array<{ productId: string; quantity: number; price: number }>): boolean {
      const sideEffects = this.buildOrderShareSideEffects(orderId, itemsOrAmount)
      return applyFarmhouseTransactionSideEffects({ userBinding: sideEffects.userBinding, shareRecords: sideEffects.shareRecord ? [sideEffects.shareRecord] : undefined })
    },
    setReferrer(referrer: { type?: 'promoter' | 'staff'; name?: string; promoterId?: string; staffAccountId?: string; liveId?: string }) {
      this.referrer = referrer || {}
      this.applyReferrerBinding()
    },
    applyReferrerBinding() {
      if (!this.currentUserId) return
      const bindings = readUserBindings() ?? {}
      const existing = bindings[this.currentUserId]
      if (existing && existing.status === 'bound') return
      if (this.referrer.promoterId) {
        upsertUserBinding({ userId: this.currentUserId, promoterId: this.referrer.promoterId, status: 'pending' })
      } else if (this.referrer.staffAccountId) {
        upsertUserBinding({ userId: this.currentUserId, staffAccountId: this.referrer.staffAccountId, status: 'pending' })
      }
    },
    addStoreAccount(payload: { name: string; account: string; password: string; role: StoreAccount['role']; promoEnabled?: boolean }) {
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      if (!payload.name.trim() || !payload.account.trim() || !payload.password.trim()) return false
      if (this.storeAccounts.some((item) => item.farmId === farmId && item.account === payload.account)) return false
      this.storeAccounts.unshift({ id: createId('SA'), farmId, name: payload.name.trim(), account: payload.account.trim(), password: payload.password.trim(), role: payload.role, enabled: true, promoEnabled: payload.promoEnabled ?? false, createdAt: new Date().toLocaleString('zh-CN') })
      writePlatformStoreAccounts(this.storeAccounts)
      return true
    },
    updateStoreAccount(id: string, payload: { name?: string; account?: string; password?: string; role?: StoreAccount['role']; enabled?: boolean; promoEnabled?: boolean }) {
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      if (!item) return false
      if (payload.name !== undefined && payload.name.trim()) item.name = payload.name.trim()
      if (payload.account !== undefined && payload.account.trim()) item.account = payload.account.trim()
      if (payload.password !== undefined && payload.password.trim()) item.password = payload.password.trim()
      if (payload.role !== undefined) item.role = payload.role
      if (payload.enabled !== undefined) item.enabled = payload.enabled
      if (payload.promoEnabled !== undefined) item.promoEnabled = payload.promoEnabled
      writePlatformStoreAccounts(this.storeAccounts)
      return true
    },
    toggleStoreAccount(id: string) {
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      if (!item) return false
      item.enabled = !item.enabled
      writePlatformStoreAccounts(this.storeAccounts)
      return true
    },
    setDeliveryAddress(address: string) {
      this.deliveryAddress = address.trim()
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, openid: '' }
      this.currentUserId = ''
      this.pendingUserId = ''
      this.role = 'customer'
    }
  }
})
