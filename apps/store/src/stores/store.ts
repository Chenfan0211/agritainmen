import { defineStore } from 'pinia'
import type { AfterSale, BusinessMediaValue, CatalogState, MockScenario, Order, OrderItem, OrderStatus, PlatformPrincipal, Product, PurchaseStatus, StoreAccount, StoreRole } from '@agritainment/shared'
import { applyCatalogStockOperation, applyPlatformMedia, buildSupplierPlatformOrders, calcCartTotal, catalogProductToProduct, catalogProductsForAudience, cProducts, cloneSeed, commitCatalogTransaction, createId, ensureCatalogState, markCatalogTransactionStockApplied, mediaValueToImage, mergeEntitySeeds, mergePersistedDefaults, mergePlatformStoreAccounts, nextPurchaseStatus, prepareCatalogTransaction, purchaseSteps, readCatalogState, readPendingCatalogTransactions, readPlatformAfterSales, readPlatformMedia, readPlatformOrders, readPlatformStoreAccounts, storeAccounts, updateCatalogStock, validateSmsCode, writePlatformAfterSale, writePlatformOrder } from '@agritainment/shared'
import { storeInfo, storeInfoForFarm, storeRepository } from '../services/repository'

interface CartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: BusinessMediaValue
  price: number
  retail: number
  stock: number
  quantity: number
}

export interface LogisticsEvent {
  time: string
  title: string
  detail: string
}

export interface StoreOrder {
  id: string
  amount: number
  saved: number
  itemCount: number
  items: OrderItem[]
  status: PurchaseStatus
  createdAt: string
  trackingNo?: string
  logistics: LogisticsEvent[]
  remark?: string
  inventoryReleased?: boolean
  afterSaleType?: 'refund' | 'return'
  platformOrderIds?: string[]
  farmId?: string
}

interface StoreAuthState {
  isLoggedIn: boolean
  phone: string
  principal: PlatformPrincipal | null
  accountId: string
  farmId: string
  tenantId: string
  role: StoreRole | null
}

interface StoreTenantSession {
  cart: CartLine[]
  orders: StoreOrder[]
  overrides: Record<string, { stock?: Record<string, number>; listed?: boolean }>
}

interface StoreState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  info: typeof storeInfo
  products: Product[]
  catalogRevision: number
  cart: CartLine[]
  orders: StoreOrder[]
  checkoutError: string
  overrides: Record<string, { stock?: Record<string, number>; listed?: boolean }>
  auth: StoreAuthState
  tenantSessions: Record<string, StoreTenantSession>
}

const purchaseToOrderStatus: Record<PurchaseStatus, OrderStatus> = {
  submitted: 'pending', accepted: 'pending', shipped: 'shipping', delivering: 'shipping', received: 'delivered', completed: 'delivered', cancelled: 'unpaid-cancelled'
}

function toPlatformOrders(order: StoreOrder, products: Product[], info: typeof storeInfo, farmId: string): Order[] {
  const orders = buildSupplierPlatformOrders({
    items: order.items, products, customer: info.name, channel: 'purchase', source: 'store',
    sourceOrderId: order.id, status: purchaseToOrderStatus[order.status], createdAt: order.createdAt, customerUserId: farmId
  })
  if (orders.length) return orders
  return [{
    id: order.id, productName: '进货商品', quantity: order.itemCount, amount: order.amount,
    customer: info.name, channel: 'purchase', status: purchaseToOrderStatus[order.status],
    createdAt: order.createdAt, items: order.items,
    supplierOrderLink: { source: 'store', sourceOrderId: order.id, customerUserId: farmId }
  }]
}

function syncStorePlatformOrders(order: StoreOrder, products: Product[], info: typeof storeInfo, farmId: string): boolean {
  const ids = order.platformOrderIds?.length ? order.platformOrderIds : [order.id]
  const existing = readPlatformOrders() || {}
  return ids.every((id) => {
    const current = existing[id]
    const next = toPlatformOrders(order, products, info, farmId).find((candidate) => candidate.id === id) || current
    if (!next) return false
    return writePlatformOrder({ ...current, ...next, id, supplierFulfillment: current?.supplierFulfillment, flow: current?.flow, logistics: current?.logistics || next.logistics })
  })
}

const logisticsEventFor = (status: PurchaseStatus, order: StoreOrder): LogisticsEvent => {
  const now = new Date().toLocaleString('zh-CN')
  switch (status) {
    case 'submitted': return { time: now, title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' }
    case 'accepted': return { time: now, title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    case 'shipped': return { time: now, title: '商品已出库', detail: `顺丰速运 ${order.trackingNo || '待生成'} 揽收，直配到店` }
    case 'delivering': return { time: now, title: '配送中', detail: '已到达中转场，预计 1-2 天送达门店' }
    case 'received': return { time: now, title: '已签收', detail: '门店已收货并验货签收' }
    case 'completed': return { time: now, title: '订单完成', detail: '本单履约完成，期待再次合作' }
    case 'cancelled': return { time: now, title: '订单已取消', detail: '门店取消进货单，中台已停止履约' }
  }
}

const seedOrders = (farmId = 'F001'): StoreOrder[] => farmId === 'F001' ? [
  {
    id: 'SO2026081001', amount: 386, saved: 222, itemCount: 15,
    items: [
      { productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉', skuName: '500g', image: '/static/images/bacon.webp', quantity: 10, price: 38 },
      { productId: 'PP03', skuId: 'PP03-1', name: '环保打包餐盒', skuName: '300只/箱', image: '/static/images/field.webp', quantity: 5, price: 1.2 }
    ],
    status: 'delivering', createdAt: '2026-08-10 09:24', trackingNo: 'SF7788990012',
    logistics: [
      { time: '2026-08-10 09:24', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-10 11:02', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-11 08:40', title: '商品已出库', detail: '顺丰速运 SF7788990012 揽收，直配到店' },
      { time: '2026-08-12 14:20', title: '配送中', detail: '已到达湘西州中转场，预计明日送达门店' }
    ]
  },
  {
    id: 'SO2026080201', amount: 840, saved: 520, itemCount: 20,
    items: [{ productId: 'P002', skuId: 'P002-5J', name: '炎陵黄桃', skuName: '5斤礼盒', image: '/static/images/peach.webp', quantity: 20, price: 42 }],
    status: 'received', createdAt: '2026-08-02 15:08', trackingNo: 'SF7788900123',
    logistics: [
      { time: '2026-08-02 15:08', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-02 16:30', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-03 09:12', title: '商品已出库', detail: '顺丰速运 SF7788900123 揽收，直配到店' },
      { time: '2026-08-04 11:45', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-08-04 17:30', title: '已签收', detail: '门店已收货并验货签收' }
    ]
  },
  {
    id: 'SO2026081401', amount: 430, saved: 210, itemCount: 5,
    items: [{ productId: 'P003', skuId: 'P003-GIFT', name: '安化黑茶礼盒装', skuName: '雅藏礼盒', image: '/static/images/tea.webp', quantity: 5, price: 86 }],
    status: 'submitted', createdAt: '2026-08-14 16:42',
    logistics: [{ time: '2026-08-14 16:42', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' }],
    remark: '周末到货后电话联系'
  },
  {
    id: 'SO2026081301', amount: 198, saved: 126, itemCount: 3,
    items: [{ productId: 'SP02', skuId: 'SP02-2', name: '山泉土鸡汤礼盒', skuName: '2 只装', image: '/static/images/field.webp', quantity: 3, price: 66 }],
    status: 'accepted', createdAt: '2026-08-13 10:05',
    logistics: [
      { time: '2026-08-13 10:05', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-13 11:20', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081101', amount: 426, saved: 220, itemCount: 22,
    items: [
      { productId: 'SP01', skuId: 'SP01-4P', name: '中台联名·农家欢聚套餐券', skuName: '四人欢聚', image: '/static/images/farmhouse.webp', quantity: 2, price: 198 },
      { productId: 'PP02', skuId: 'PP02-1', name: '民宿一次性洗漱套装', skuName: '100 套/箱', image: '/static/images/field.webp', quantity: 20, price: 1.5 }
    ],
    status: 'shipped', createdAt: '2026-08-11 09:18', trackingNo: 'SF7788994501',
    logistics: [
      { time: '2026-08-11 09:18', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-11 10:42', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-12 08:36', title: '商品已出库', detail: '顺丰速运 SF7788994501 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026072801', amount: 1680, saved: 620, itemCount: 10,
    items: [{ productId: 'PP05', skuId: 'PP05-1', name: '生态富硒米', skuName: '25kg', image: '/static/images/rice.webp', quantity: 10, price: 168 }],
    status: 'completed', createdAt: '2026-07-28 14:30', trackingNo: 'SF7788100221',
    logistics: [
      { time: '2026-07-28 14:30', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-07-28 16:05', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-29 09:12', title: '商品已出库', detail: '顺丰速运 SF7788100221 揽收，直配到店' },
      { time: '2026-07-30 10:48', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-30 16:20', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-31 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  },
  {
    id: 'SO2026081501', amount: 640, saved: 400, itemCount: 20,
    items: [{ productId: 'SP09', skuId: 'SP09-30', name: '高山土鸡蛋', skuName: '30 枚装', image: '/static/images/field.webp', quantity: 20, price: 32 }],
    status: 'submitted', createdAt: '2026-08-15 09:12',
    logistics: [{ time: '2026-08-15 09:12', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' }]
  },
  {
    id: 'SO2026081502', amount: 417, saved: 303, itemCount: 5,
    items: [
      { productId: 'SP19', skuId: 'SP19-1', name: '安化黑茶砖', skuName: '1kg 砖', image: '/static/images/tea.webp', quantity: 2, price: 96 },
      { productId: 'SP17', skuId: 'SP17-1', name: '古丈毛尖绿茶', skuName: '250g 罐装', image: '/static/images/tea.webp', quantity: 3, price: 75 }
    ],
    status: 'submitted', createdAt: '2026-08-15 10:35',
    logistics: [{ time: '2026-08-15 10:35', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' }],
    remark: '茶叶怕压，请轻拿轻放'
  },
  {
    id: 'SO2026081402', amount: 570, saved: 335, itemCount: 15,
    items: [
      { productId: 'P001', skuId: 'P001-1000', name: '湘西烟熏柴火腊肉', skuName: '1kg家庭装', image: '/static/images/bacon.webp', quantity: 5, price: 78 },
      { productId: 'SP14', skuId: 'SP14-3', name: '手工辣椒酱', skuName: '3 瓶装', image: '/static/images/chili.webp', quantity: 10, price: 18 }
    ],
    status: 'accepted', createdAt: '2026-08-14 11:20',
    logistics: [
      { time: '2026-08-14 11:20', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-14 13:05', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081403', amount: 280, saved: 192, itemCount: 4,
    items: [{ productId: 'SP20', skuId: 'SP20-1', name: '土榨菜籽油', skuName: '5L 装', image: '/static/images/field.webp', quantity: 4, price: 70 }],
    status: 'accepted', createdAt: '2026-08-14 15:48',
    logistics: [
      { time: '2026-08-14 15:48', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-14 17:30', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081201', amount: 450, saved: 330, itemCount: 10,
    items: [{ productId: 'SP10', skuId: 'SP10-5J', name: '时令鲜果礼盒', skuName: '5 斤礼盒', image: '/static/images/peach.webp', quantity: 10, price: 45 }],
    status: 'shipped', createdAt: '2026-08-12 10:05', trackingNo: 'SF7788995502',
    logistics: [
      { time: '2026-08-12 10:05', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-12 11:40', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-13 08:50', title: '商品已出库', detail: '顺丰速运 SF7788995502 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026081202', amount: 544, saved: 320, itemCount: 8,
    items: [{ productId: 'SP11', skuId: 'SP11-2K', name: '农家土猪肉', skuName: '2kg 装', image: '/static/images/bacon.webp', quantity: 8, price: 68 }],
    status: 'delivering', createdAt: '2026-08-12 16:30', trackingNo: 'SF7788996623',
    logistics: [
      { time: '2026-08-12 16:30', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-13 09:12', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-13 15:20', title: '商品已出库', detail: '顺丰速运 SF7788996623 揽收，直配到店' },
      { time: '2026-08-14 11:45', title: '配送中', detail: '已到达湘西州中转场，预计明日送达门店' }
    ]
  },
  {
    id: 'SO2026080501', amount: 252, saved: 204, itemCount: 6,
    items: [{ productId: 'SP22', skuId: 'SP22-1', name: '杨梅果酒', skuName: '750ml 单瓶', image: '/static/images/field.webp', quantity: 6, price: 42 }],
    status: 'received', createdAt: '2026-08-05 14:22', trackingNo: 'SF7788003310',
    logistics: [
      { time: '2026-08-05 14:22', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-08-05 16:10', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-06 09:30', title: '商品已出库', detail: '顺丰速运 SF7788003310 揽收，直配到店' },
      { time: '2026-08-07 10:20', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-08-07 15:40', title: '已签收', detail: '门店已收货并验货签收' }
    ]
  },
  {
    id: 'SO2026072001', amount: 680, saved: 540, itemCount: 30,
    items: [
      { productId: 'SP23', skuId: 'SP23-1', name: '湘西苞谷酒', skuName: '2.5L 桶', image: '/static/images/field.webp', quantity: 10, price: 38 },
      { productId: 'SP26', skuId: 'SP26-1', name: '食品级保鲜袋', skuName: '500 只/箱', image: '/static/images/field.webp', quantity: 20, price: 15 }
    ],
    status: 'completed', createdAt: '2026-07-20 09:50', trackingNo: 'SF7786112201',
    logistics: [
      { time: '2026-07-20 09:50', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-07-20 11:25', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-21 08:40', title: '商品已出库', detail: '顺丰速运 SF7786112201 揽收，直配到店' },
      { time: '2026-07-22 10:15', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-22 16:30', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-23 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  },
  {
    id: 'SO2026071501', amount: 660, saved: 396, itemCount: 13,
    items: [
      { productId: 'SP24', skuId: 'SP24-1', name: '加厚浴巾三件套', skuName: '三件套', image: '/static/images/field.webp', quantity: 8, price: 45 },
      { productId: 'SP25', skuId: 'SP25-1', name: '软底防滑拖鞋', skuName: '20 双/箱', image: '/static/images/field.webp', quantity: 5, price: 60 }
    ],
    status: 'completed', createdAt: '2026-07-15 11:05', trackingNo: 'SF7785113302',
    logistics: [
      { time: '2026-07-15 11:05', title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' },
      { time: '2026-07-15 14:20', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-16 09:10', title: '商品已出库', detail: '顺丰速运 SF7785113302 揽收，直配到店' },
      { time: '2026-07-17 10:40', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-17 15:20', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-18 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  }
] : []

export const useStoreStore = defineStore('store', {
  state: (): StoreState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    info: cloneSeed(storeInfo),
    products: [],
    catalogRevision: 0,
    cart: [],
    orders: seedOrders(),
    checkoutError: '',
    overrides: {},
    auth: { isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null },
    tenantSessions: {}
  }),
  getters: {
    isListed: (state) => (productId: string) => state.overrides[productId]?.listed !== false,
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => calcCartTotal(state.cart.map(({ price, quantity }) => ({ price, quantity }))),
    orderMetrics: (state) => {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const norm = (value: string) => {
        const match = value.match(/(\d{4})[\/-](\d{1,2})/)
        return match ? `${match[1]}-${match[2].padStart(2, '0')}` : value.slice(0, 7)
      }
      const monthOrders = state.orders.filter((order) => norm(order.createdAt) === month)
      return {
        monthAmount: Math.round(monthOrders.reduce((sum, order) => sum + order.amount, 0) * 100) / 100,
        orderCount: state.orders.length,
        pendingReceipt: state.orders.filter((order) => ['submitted', 'accepted', 'shipped', 'delivering'].includes(order.status)).length,
        savedAmount: Math.round(state.orders.reduce((sum, order) => sum + (order.saved || 0), 0) * 100) / 100
      }
    }
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.products.length > 0
      this.loading = true
      this.error = ''
      try {
        const farmId = this.auth.farmId || 'F001'
        const account = this.currentStoreAccounts().find((item) => item.id === this.auth.accountId)
        const data = await storeRepository.loadStore(this.mockScenario, farmId, account)
        const catalog = ensureCatalogState(data.products, cProducts)
        this.$patch({
          info: hasPersistedData ? mergePersistedDefaults(data.info, this.info) : data.info,
          products: catalogProductsForAudience(catalog, 'ordering').map(catalogProductToProduct),
          catalogRevision: catalog.revision,
          orders: hasPersistedData ? mergeEntitySeeds(seedOrders(farmId), this.orders.filter((item) => !item.farmId || item.farmId === farmId)) : seedOrders(farmId),
          initialized: true
        })
        applyPlatformMedia(null, this.products)
        const storeMedia = readPlatformMedia()
        if (storeMedia?.farms[farmId]) this.info.image = storeMedia.farms[farmId]
        this.cart.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (product && sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, price: sku.cost, retail: product.price, stock: sku.stock })
        })
        this.orders.forEach((order) => order.items.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (product && sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, image: product.image })
        }))
        this.recoverCatalogTransactions()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    setMockScenario(scenario: MockScenario) {
      this.mockScenario = scenario
      this.initialized = false
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
        this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.cost, retail: product.price, stock: sku.stock, quantity: 1 })
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
    removeLine(productId: string, skuId: string) {
      this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId))
      this.checkoutError = ''
    },
    applyCatalogState(state: CatalogState) {
      this.catalogRevision = state.revision
      this.products = catalogProductsForAudience(state, 'ordering').map(catalogProductToProduct)
      this.cart = this.cart.filter((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        if (!product || !sku) return false
        Object.assign(line, { name: product.name, image: product.image, price: sku.cost, retail: product.price, stock: sku.stock })
        return true
      })
    },
    refreshCatalog(message = '') {
      const state = readCatalogState()
      if (!state) return false
      this.applyCatalogState(state)
      if (message) this.checkoutError = message
      return true
    },
    recoverCatalogTransactions() {
      for (const entry of readPendingCatalogTransactions('store')) {
        const payload = entry.payload as { order?: StoreOrder; afterSale?: AfterSale }
        if (!payload.order?.id) continue
        if (entry.status === 'prepared') {
          const catalog = readCatalogState()
          if (!catalog) continue
          const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, catalog.revision)
          if (!result || !markCatalogTransactionStockApplied(entry.id)) continue
          this.applyCatalogState(result.state)
        }
        const recoveredOrders = toPlatformOrders(payload.order, this.products, this.info, payload.order.farmId || this.auth.farmId || 'F001')
        if (!recoveredOrders.every((platformOrder) => writePlatformOrder(platformOrder))) continue
        payload.order.platformOrderIds = recoveredOrders.map((platformOrder) => platformOrder.id)
        if (payload.afterSale && !writePlatformAfterSale(payload.afterSale)) continue
        const existing = this.orders.find((order) => order.id === payload.order!.id)
        if (existing) Object.assign(existing, cloneSeed(payload.order))
        else this.orders.unshift(cloneSeed(payload.order))
        commitCatalogTransaction(entry.id)
      }
      const latest = readCatalogState()
      if (latest && latest.revision !== this.catalogRevision) this.applyCatalogState(latest)
    },
    applyLocalOverrides() {
      Object.entries(this.overrides).forEach(([productId, ov]) => {
        const product = this.products.find((item) => item.id === productId)
        if (!product || !ov.stock) return
        product.skus.forEach((sku) => {
          if (ov.stock![sku.id] !== undefined) sku.stock = Math.max(0, Math.round(ov.stock![sku.id]))
        })
        product.stock = product.skus.reduce((sum, item) => sum + item.stock, 0)
      })
    },
    setSkuStock(productId: string, skuId: string, stock: number) {
      const product = this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (!product || !sku) return false
      const nextStock = Math.max(0, Math.round(Number(stock) || 0))
      const quantity = nextStock - sku.stock
      if (!quantity) return true
      const next = updateCatalogStock([{ productId, skuId, quantity }], this.catalogRevision)
      if (!next) {
        this.refreshCatalog('商品库存已更新，请刷新后重试')
        return false
      }
      this.applyCatalogState(next)
      this.checkoutError = ''
      return true
    },
    toggleListed(productId: string) {
      if (!this.products.some((item) => item.id === productId)) return false
      const ov = this.overrides[productId] || (this.overrides[productId] = {})
      ov.listed = ov.listed === false ? true : false
      return true
    },
    submitOrder(remark = '') {
      this.checkoutError = ''
      if (!this.cart.length) {
        this.checkoutError = '进货单为空'
        return false
      }
      const insufficient = this.cart.find((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || !sku || sku.stock < line.quantity
      })
      if (insufficient) {
        this.checkoutError = `${insufficient.name}（${insufficient.skuName}）库存不足`
        return false
      }
      const amount = this.cartTotal
      const saved = Math.round(this.cart.reduce((sum, line) => sum + (line.retail - line.price) * line.quantity, 0) * 100) / 100
      const itemCount = this.cartCount
      const orderItems = this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, skuName: line.skuName, name: line.name, image: mediaValueToImage(line.image), quantity: line.quantity, price: line.price }))
      const now = new Date().toLocaleString('zh-CN')
      const order: StoreOrder = {
        id: createId('SO'), farmId: this.auth.farmId || 'F001', amount, saved, itemCount, items: orderItems, status: 'submitted', createdAt: now,
        trackingNo: `SF${String(Date.now()).slice(-10)}`, logistics: [{ time: now, title: '订单已提交', detail: '已提交至中选科技供应链中台，等待接单' }], remark: remark.trim() || undefined
      }
      const inventoryChanges = this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const operationId = `${order.id}:reserve`
      if (!prepareCatalogTransaction({ id: operationId, channel: 'store', action: 'reserve', inventoryChanges, payload: { order } })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, this.catalogRevision)
      if (!stockResult) {
        this.refreshCatalog('商品库存已更新，请刷新后重试')
        return false
      }
      this.applyCatalogState(stockResult.state)
      const platformOrders = toPlatformOrders(order, this.products, this.info, order.farmId || this.auth.farmId || 'F001')
      order.platformOrderIds = platformOrders.map((platformOrder) => platformOrder.id)
      if (!markCatalogTransactionStockApplied(operationId) || !platformOrders.every((platformOrder) => writePlatformOrder(platformOrder)) || !commitCatalogTransaction(operationId)) {
        this.checkoutError = '订单处理中，请刷新后重试'
        return false
      }
      this.orders.unshift(order)
      this.cart = []
      return true
    },
    advanceOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status === 'completed') return false
      order.status = nextPurchaseStatus(order.status)
      order.logistics.push(logisticsEventFor(order.status, order))
      if (!syncStorePlatformOrders(order, this.products, this.info, order.farmId || this.auth.farmId || 'F001')) return false
      return true
    },
    confirmReceipt(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'delivering') return false
      order.status = 'received'
      order.logistics.push(logisticsEventFor('received', order))
      if (!syncStorePlatformOrders(order, this.products, this.info, order.farmId || this.auth.farmId || 'F001')) return false
      return true
    },
    cancelOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || (order.status !== 'submitted' && order.status !== 'accepted')) return false
      if (order.inventoryReleased) return false
      const nextOrder = cloneSeed(order)
      nextOrder.status = 'cancelled'; nextOrder.inventoryReleased = true
      nextOrder.logistics.push({ time: new Date().toLocaleString('zh-CN'), title: '订单已取消', detail: '门店取消进货单' })
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:release`
      if (!prepareCatalogTransaction({ id: operationId, channel: 'store', action: 'release', inventoryChanges, payload: { order: nextOrder } })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, this.catalogRevision)
      if (!stockResult) {
        this.refreshCatalog('商品库存已更新，请刷新后重试')
        return false
      }
      if (!markCatalogTransactionStockApplied(operationId) || !syncStorePlatformOrders(nextOrder, this.products, this.info, nextOrder.farmId || this.auth.farmId || 'F001') || !commitCatalogTransaction(operationId)) return false
      this.applyCatalogState(stockResult.state)
      Object.assign(order, nextOrder)
      return true
    },
    initiateAfterSale(orderId: string, type: 'refund' | 'return' = 'refund') {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order || (order.status !== 'received' && order.status !== 'completed')) return false
      if (Object.values(readPlatformAfterSales() || {}).some((work) => work.orderId === orderId)) return false
      const first = order.items[0]
      if (!writePlatformAfterSale({
        id: createId('AS'), orderId, productName: first?.name || '进货商品', applicant: this.info.name,
        type, amount: order.amount, status: 'processing', issue: '进货商品质量问题，门店申请售后',
        quantity: first?.quantity || order.itemCount, image: first?.image,
        history: [{ time: new Date().toLocaleString('zh-CN'), action: '门店发起售后，平台受理中', operator: this.info.name }]
      } as AfterSale)) return false
      order.afterSaleType = type
      return true
    },
    completeReturn(orderId: string) {
      const order = this.orders.find((item) => item.id === orderId)
      const work = Object.values(readPlatformAfterSales() || {}).find((item) => item.orderId === orderId && item.type === 'return')
      if (!order || !work || order.inventoryReleased || (work.status !== 'return-pending' && work.status !== 'processing')) return false
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const operationId = `${order.id}:return-release`
      const nextOrder = { ...cloneSeed(order), inventoryReleased: true }
      const nextAfterSale: AfterSale = { ...work, status: 'refunded', history: [...(work.history || []), { time: new Date().toLocaleString('zh-CN'), action: '退货确认完成，库存已回补', operator: this.info.name }] }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'store', action: 'release', inventoryChanges, payload: { order: nextOrder, afterSale: nextAfterSale } })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, this.catalogRevision)
      if (!stockResult || !markCatalogTransactionStockApplied(operationId)) return false
      if (!writePlatformAfterSale(nextAfterSale)) return false
      if (!commitCatalogTransaction(operationId)) return false
      this.applyCatalogState(stockResult.state); Object.assign(order, nextOrder)
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
        if (line) {
          const before = line.quantity
          line.quantity = Math.min(line.quantity + quantity, sku.stock)
          if (line.quantity > before) added += 1
        } else {
          this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.cost, retail: product.price, stock: sku.stock, quantity })
          added += 1
        }
      })
      this.checkoutError = added ? '' : '订单商品当前无可进货库存'
      return added > 0
    },
    currentStoreAccounts(): StoreAccount[] {
      return mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
    },
    saveCurrentTenantSession() {
      if (!this.auth.farmId) return
      this.tenantSessions[this.auth.farmId] = cloneSeed({ cart: this.cart, orders: this.orders, overrides: this.overrides })
    },
    activateStoreAccount(account: StoreAccount) {
      const previousFarmId = this.auth.farmId
      if (previousFarmId && previousFarmId !== account.farmId) this.saveCurrentTenantSession()
      const session = this.tenantSessions[account.farmId]
      if (session) {
        this.cart = cloneSeed(session.cart)
        this.orders = cloneSeed(session.orders)
        this.overrides = cloneSeed(session.overrides)
      } else if (previousFarmId !== account.farmId && account.farmId !== 'F001') {
        this.cart = []
        this.orders = seedOrders(account.farmId)
        this.overrides = {}
      }
      const principal: PlatformPrincipal = { actorType: 'store', actorId: account.id, tenantId: account.farmId, status: 'active' }
      this.auth = {
        isLoggedIn: true,
        phone: account.account,
        principal,
        accountId: account.id,
        farmId: account.farmId,
        tenantId: account.farmId,
        role: account.role
      }
      this.info = storeInfoForFarm(account.farmId, account)
      return true
    },
    loginWithPassword(phone: string, password: string) {
      const normalized = phone.trim()
      const account = this.currentStoreAccounts().find((item) => item.account === normalized && item.password === password && item.enabled)
      return account ? this.activateStoreAccount(account) : false
    },
    loginWithCode(phone: string, code: string) {
      if (!validateSmsCode(code)) return false
      const normalized = phone.trim()
      const account = this.currentStoreAccounts().find((item) => item.account === normalized && item.enabled)
      return account ? this.activateStoreAccount(account) : false
    },
    async refreshSharedState() {
      if (!this.auth.accountId) return
      const account = this.currentStoreAccounts().find((item) => item.id === this.auth.accountId)
      if (!account?.enabled) {
        this.logout()
        return
      }
      await this.initialize(true)
    },
    logout() {
      this.saveCurrentTenantSession()
      this.auth = { isLoggedIn: false, phone: '', principal: null, accountId: '', farmId: '', tenantId: '', role: null }
    }
  }
})
