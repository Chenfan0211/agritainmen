import { defineStore } from 'pinia'
import type { AfterSale, MockScenario, Order, OrderItem, OrderStatus, Product, PurchaseStatus } from '@agritainment/shared'
import { DEMO_PASSWORD, DEMO_SMS_CODE, applyPlatformMedia, calcCartTotal, cloneSeed, createId, mergeEntitySeeds, mergePlatformEntities, mergePersistedDefaults, nextPurchaseStatus, purchaseSteps, readPlatformAfterSales, readPlatformEntities, readPlatformMedia, suppliers, validatePhone, validateSmsCode, writePlatformAfterSale, writePlatformOrder } from '@agritainment/shared'
import { storeInfo, storeRepository } from '../services/repository'

interface CartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: string
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
}

interface StoreState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  info: typeof storeInfo
  products: Product[]
  cart: CartLine[]
  orders: StoreOrder[]
  checkoutError: string
  overrides: Record<string, { stock?: Record<string, number>; listed?: boolean }>
  auth: { isLoggedIn: boolean; phone: string }
}

const purchaseToOrderStatus: Record<PurchaseStatus, OrderStatus> = {
  submitted: 'pending', accepted: 'pending', shipped: 'shipping', delivering: 'shipping', received: 'delivered', completed: 'delivered', cancelled: 'unpaid-cancelled'
}

function toPlatformOrder(order: StoreOrder, products: Product[]): Order {
  const first = order.items[0]
  const product = first ? products.find((p) => p.id === first.productId) : undefined
  return {
    id: order.id, productName: first?.name || '进货商品', quantity: order.itemCount, amount: order.amount,
    customer: storeInfo.name, channel: 'purchase', status: purchaseToOrderStatus[order.status],
    createdAt: order.createdAt, items: order.items,
    supplierId: suppliers.find((s) => s.name === product?.supplier)?.id
  }
}

const logisticsEventFor = (status: PurchaseStatus, order: StoreOrder): LogisticsEvent => {
  const now = new Date().toLocaleString('zh-CN')
  switch (status) {
    case 'submitted': return { time: now, title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' }
    case 'accepted': return { time: now, title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    case 'shipped': return { time: now, title: '商品已出库', detail: `顺丰速运 ${order.trackingNo || '待生成'} 揽收，直配到店` }
    case 'delivering': return { time: now, title: '配送中', detail: '已到达中转场，预计 1-2 天送达门店' }
    case 'received': return { time: now, title: '已签收', detail: '门店已收货并验货签收' }
    case 'completed': return { time: now, title: '订单完成', detail: '本单履约完成，期待再次合作' }
    case 'cancelled': return { time: now, title: '订单已取消', detail: '门店取消进货单，中台已停止履约' }
  }
}

const seedOrders = (): StoreOrder[] => [
  {
    id: 'SO2026081001', amount: 386, saved: 222, itemCount: 15,
    items: [
      { productId: 'P001', skuId: 'P001-500', name: '湘西烟熏柴火腊肉', skuName: '500g', image: '/static/images/bacon.webp', quantity: 10, price: 38 },
      { productId: 'PP03', skuId: 'PP03-1', name: '环保打包餐盒', skuName: '300只/箱', image: '/static/images/field.webp', quantity: 5, price: 1.2 }
    ],
    status: 'delivering', createdAt: '2026-08-10 09:24', trackingNo: 'SF7788990012',
    logistics: [
      { time: '2026-08-10 09:24', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
      { time: '2026-08-02 15:08', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
    logistics: [{ time: '2026-08-14 16:42', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' }],
    remark: '周末到货后电话联系'
  },
  {
    id: 'SO2026081301', amount: 198, saved: 126, itemCount: 3,
    items: [{ productId: 'SP02', skuId: 'SP02-2', name: '山泉土鸡汤礼盒', skuName: '2 只装', image: '/static/images/field.webp', quantity: 3, price: 66 }],
    status: 'accepted', createdAt: '2026-08-13 10:05',
    logistics: [
      { time: '2026-08-13 10:05', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
      { time: '2026-08-11 09:18', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
      { time: '2026-08-11 10:42', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-12 08:36', title: '商品已出库', detail: '顺丰速运 SF7788994501 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026072801', amount: 1680, saved: 620, itemCount: 10,
    items: [{ productId: 'PP05', skuId: 'PP05-1', name: '生态富硒米', skuName: '25kg', image: '/static/images/rice.webp', quantity: 10, price: 168 }],
    status: 'completed', createdAt: '2026-07-28 14:30', trackingNo: 'SF7788100221',
    logistics: [
      { time: '2026-07-28 14:30', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
    logistics: [{ time: '2026-08-15 09:12', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' }]
  },
  {
    id: 'SO2026081502', amount: 417, saved: 303, itemCount: 5,
    items: [
      { productId: 'SP19', skuId: 'SP19-1', name: '安化黑茶砖', skuName: '1kg 砖', image: '/static/images/tea.webp', quantity: 2, price: 96 },
      { productId: 'SP17', skuId: 'SP17-1', name: '古丈毛尖绿茶', skuName: '250g 罐装', image: '/static/images/tea.webp', quantity: 3, price: 75 }
    ],
    status: 'submitted', createdAt: '2026-08-15 10:35',
    logistics: [{ time: '2026-08-15 10:35', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' }],
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
      { time: '2026-08-14 11:20', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
      { time: '2026-08-14 13:05', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081403', amount: 280, saved: 192, itemCount: 4,
    items: [{ productId: 'SP20', skuId: 'SP20-1', name: '土榨菜籽油', skuName: '5L 装', image: '/static/images/field.webp', quantity: 4, price: 70 }],
    status: 'accepted', createdAt: '2026-08-14 15:48',
    logistics: [
      { time: '2026-08-14 15:48', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
      { time: '2026-08-14 17:30', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' }
    ]
  },
  {
    id: 'SO2026081201', amount: 450, saved: 330, itemCount: 10,
    items: [{ productId: 'SP10', skuId: 'SP10-5J', name: '时令鲜果礼盒', skuName: '5 斤礼盒', image: '/static/images/peach.webp', quantity: 10, price: 45 }],
    status: 'shipped', createdAt: '2026-08-12 10:05', trackingNo: 'SF7788995502',
    logistics: [
      { time: '2026-08-12 10:05', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
      { time: '2026-08-12 11:40', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-08-13 08:50', title: '商品已出库', detail: '顺丰速运 SF7788995502 揽收，直配到店' }
    ]
  },
  {
    id: 'SO2026081202', amount: 544, saved: 320, itemCount: 8,
    items: [{ productId: 'SP11', skuId: 'SP11-2K', name: '农家土猪肉', skuName: '2kg 装', image: '/static/images/bacon.webp', quantity: 8, price: 68 }],
    status: 'delivering', createdAt: '2026-08-12 16:30', trackingNo: 'SF7788996623',
    logistics: [
      { time: '2026-08-12 16:30', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
      { time: '2026-08-05 14:22', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
      { time: '2026-07-20 09:50', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
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
      { time: '2026-07-15 11:05', title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' },
      { time: '2026-07-15 14:20', title: '中台已接单', detail: '仓库备货中，预计 24 小时内出库' },
      { time: '2026-07-16 09:10', title: '商品已出库', detail: '顺丰速运 SF7785113302 揽收，直配到店' },
      { time: '2026-07-17 10:40', title: '配送中', detail: '已到达湘西州中转场' },
      { time: '2026-07-17 15:20', title: '已签收', detail: '门店已收货并验货签收' },
      { time: '2026-07-18 09:00', title: '订单完成', detail: '本单履约完成，期待再次合作' }
    ]
  }
]

export const useStoreStore = defineStore('store', {
  state: (): StoreState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    info: cloneSeed(storeInfo),
    products: [],
    cart: [],
    orders: seedOrders(),
    checkoutError: '',
    overrides: {},
    auth: { isLoggedIn: false, phone: '' }
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
        const data = await storeRepository.loadStore(this.mockScenario)
        this.$patch({
          info: hasPersistedData ? mergePersistedDefaults(data.info, this.info) : data.info,
          products: hasPersistedData ? mergeEntitySeeds(data.products, this.products) : data.products,
          orders: hasPersistedData ? mergeEntitySeeds(seedOrders(), this.orders) : seedOrders(),
          initialized: true
        })
        applyPlatformMedia(null, this.products)
        const entities = readPlatformEntities()
        if (entities?.products) this.products = mergePlatformEntities(this.products, entities.products)
        this.applyLocalOverrides()
        const storeMedia = readPlatformMedia()
        if (storeMedia?.farms['F001']) this.info.image = storeMedia.farms['F001']
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
      const ov = this.overrides[productId] || (this.overrides[productId] = {})
      ov.stock = ov.stock || {}
      ov.stock[skuId] = Math.max(0, Math.round(Number(stock) || 0))
      sku.stock = ov.stock[skuId]
      product.stock = product.skus.reduce((sum, item) => sum + item.stock, 0)
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
      this.cart.forEach((line) => {
        const product = this.products.find((item) => item.id === line.productId)!
        const sku = product.skus.find((item) => item.id === line.skuId)!
        sku.stock -= line.quantity
        product.stock = product.skus.reduce((sum, item) => sum + item.stock, 0)
        product.sales += line.quantity
      })
      const amount = this.cartTotal
      const saved = Math.round(this.cart.reduce((sum, line) => sum + (line.retail - line.price) * line.quantity, 0) * 100) / 100
      const itemCount = this.cartCount
      const now = new Date().toLocaleString('zh-CN')
      this.orders.unshift({
        id: createId('SO'),
        amount,
        saved,
        itemCount,
        items: this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, skuName: line.skuName, name: line.name, image: line.image, quantity: line.quantity, price: line.price })),
        status: 'submitted',
        createdAt: now,
        trackingNo: `SF${String(Date.now()).slice(-10)}`,
        logistics: [{ time: now, title: '订单已提交', detail: '已提交至甄选好物供应链中台，等待接单' }],
        remark: remark.trim() || undefined
      })
      writePlatformOrder(toPlatformOrder(this.orders[0], this.products))
      this.cart = []
      return true
    },
    advanceOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status === 'completed') return false
      order.status = nextPurchaseStatus(order.status)
      order.logistics.push(logisticsEventFor(order.status, order))
      writePlatformOrder(toPlatformOrder(order, this.products))
      return true
    },
    confirmReceipt(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'delivering') return false
      order.status = 'received'
      order.logistics.push(logisticsEventFor('received', order))
      writePlatformOrder(toPlatformOrder(order, this.products))
      return true
    },
    cancelOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || (order.status !== 'submitted' && order.status !== 'accepted')) return false
      order.status = 'cancelled'
      order.logistics.push({ time: new Date().toLocaleString('zh-CN'), title: '订单已取消', detail: '门店取消进货单' })
      writePlatformOrder(toPlatformOrder(order, this.products))
      return true
    },
    initiateAfterSale(orderId: string) {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order || (order.status !== 'received' && order.status !== 'completed')) return false
      if (Object.values(readPlatformAfterSales() || {}).some((work) => work.orderId === orderId)) return false
      const first = order.items[0]
      writePlatformAfterSale({
        id: createId('AS'), orderId, productName: first?.name || '进货商品', applicant: storeInfo.name,
        type: 'refund', amount: order.amount, status: 'processing', issue: '进货商品质量问题，门店申请售后',
        quantity: first?.quantity || order.itemCount, image: first?.image,
        history: [{ time: new Date().toLocaleString('zh-CN'), action: '门店发起售后，平台受理中', operator: storeInfo.name }]
      } as AfterSale)
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
    loginWithPassword(phone: string, password: string) {
      if (!validatePhone(phone) || password !== DEMO_PASSWORD) return false
      this.auth = { isLoggedIn: true, phone: phone.trim() }
      return true
    },
    loginWithCode(phone: string, code: string) {
      if (!validatePhone(phone) || !validateSmsCode(code)) return false
      this.auth = { isLoggedIn: true, phone: phone.trim() }
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, phone: '' }
    }
  }
})
