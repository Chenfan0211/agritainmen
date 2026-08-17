import { defineStore } from 'pinia'
import type { BalanceEntry, Booking, FarmStore, Member, MockScenario, Product, PromotionRecord, Role, StoreAccount, StorefrontOrder, TenantConfig } from '@agritainment/shared'
import { applyPlatformMedia, calcCartTotal, cloneSeed, createId, members, mergeEntitySeeds, mergePersistedDefaults, mergePlatformStoreAccounts, readPlatformStoreAccounts, readShareConfig, readUserBindings, resolveShare, round2, simulateWechatLogin, storeAccounts, upsertUserBinding, writePlatformStoreAccounts, writeShareRecord } from '@agritainment/shared'
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
    referrer: {}
  }),
  getters: {
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => calcCartTotal(state.cart.map(({ price, quantity }) => ({ price, quantity }))),
    balance: (state) => state.member.balance,
    points: (state) => state.member.points,
    canOperate: (state) => state.role === 'staff' || state.role === 'manager',
    canSelect: (state) => state.role === 'manager'
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && !!this.tenant && this.products.length > 0
      this.loading = true
      this.error = ''
      try {
        const [storefront, selectableProducts] = await Promise.all([
          farmhouseRepository.loadStorefront(this.mockScenario),
          farmhouseRepository.loadSelectableProducts(this.mockScenario)
        ])
        this.$patch({
          tenant: hasPersistedData ? mergePersistedDefaults(storefront.tenant, this.tenant) : storefront.tenant,
          farm: hasPersistedData ? mergePersistedDefaults(storefront.farm, this.farm) : storefront.farm,
          member: hasPersistedData ? mergePersistedDefaults(storefront.member, this.member) : storefront.member,
          products: hasPersistedData ? mergeEntitySeeds(storefront.products, this.products) : storefront.products,
          foods: hasPersistedData ? mergeEntitySeeds(storefront.foods, this.foods) : storefront.foods,
          selectableProducts: hasPersistedData ? mergeEntitySeeds(selectableProducts, this.selectableProducts) : selectableProducts,
          initialized: true
        })
        if (this.farm) applyPlatformMedia([this.farm], this.products)
        applyPlatformMedia(null, this.selectableProducts)
        this.storeAccounts = mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
        if (!this.currentUserId) {
          const savedUserId = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-id') : ''
          this.currentUserId = typeof savedUserId === 'string' && savedUserId ? savedUserId : createId('U')
          if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', this.currentUserId)
        }
        this.cart.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, price: sku.price, stock: sku.stock })
        })
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
    checkout() {
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
      const total = this.cartTotal
      if (this.member.balance < total) {
        this.checkoutError = '会员余额不足'
        return false
      }
      this.cart.forEach((line) => {
        const product = this.products.find((item) => item.id === line.productId)!
        const sku = product.skus.find((item) => item.id === line.skuId)!
        sku.stock -= line.quantity
        product.stock = product.skus.reduce((sum, item) => sum + item.stock, 0)
        product.sales += line.quantity
      })
      const itemCount = this.cartCount
      this.member.balance = Math.round((this.member.balance - total) * 100) / 100
      this.member.points += Math.floor(total)
      const orderId = createId('SO')
      this.orders.unshift({ id: orderId, amount: total, itemCount, status: '待发货', createdAt: new Date().toLocaleString('zh-CN'), items: this.cart.map((item) => ({ productId: item.productId, skuId: item.skuId, name: item.name, skuName: item.skuName, image: item.image, quantity: item.quantity, price: item.price })) })
      this.resolveOrderShare(orderId, total)
      this.balanceEntries.unshift({ id: createId('BL'), type: 'consume', amount: -total, balance: this.member.balance, description: `商城订单消费 · ${itemCount} 件商品`, createdAt: new Date().toLocaleString('zh-CN') })
      this.cart = []
      return true
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
    listProduct(productId: string, retailPrice: number) {
      const source = this.selectableProducts.find((item) => item.id === productId)
      if (!source) return false
      const retail = round2(retailPrice)
      if (retail <= source.cost) return false
      const existing = this.products.find((item) => item.id === source.id)
      const target = existing || cloneSeed(source)
      const delta = retail - target.price
      target.price = retail
      target.skus.forEach((sku) => { sku.price = round2(sku.price + delta) })
      if (existing) existing.stock = existing.skus.reduce((sum, sku) => sum + sku.stock, 0)
      else this.products.unshift({ ...target, status: 'active', farmIds: [...new Set([...target.farmIds, this.farm?.id || this.tenant?.farmId || 'F001'])] })
      return true
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
        link: `https://demo.local/farm/${this.tenant?.code || 'store'}?promoter=member`, shareCount: 1, lockedFans: 0,
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
        link: `https://demo.local/product/${product.id}?farm=${this.tenant?.code || 'store'}`, shareCount: 1, lockedFans: 0,
        estimatedCommission: 0, createdAt: new Date().toLocaleString('zh-CN')
      }
      this.promotionRecords.unshift(record)
      return record
    },
    async wechatLogin() {
      const { openid } = await simulateWechatLogin()
      this.auth = { isLoggedIn: true, openid }
      return true
    },
    loginWithAccount(account: string, password: string) {
      const match = this.storeAccounts.find((item) => item.farmId === this.tenant?.farmId && item.account === account && item.password === password && item.enabled)
      if (!match) return false
      this.auth = { isLoggedIn: true, openid: `mock_account_${account}` }
      this.role = match.role === 'owner' ? 'manager' : 'staff'
      this.loggedAccountId = match.id
      return true
    },
    resolveOrderShare(orderId: string, amount: number) {
      const bindings = readUserBindings() ?? {}
      const binding = bindings[this.currentUserId]
      if (binding && binding.status === 'pending') {
        upsertUserBinding({ ...binding, status: 'bound', boundAt: new Date().toLocaleString('zh-CN') })
      }
      const boundBinding = bindings[this.currentUserId] ? { ...bindings[this.currentUserId], status: 'bound' as const, boundAt: bindings[this.currentUserId].boundAt || new Date().toLocaleString('zh-CN') } : null
      const share = resolveShare(boundBinding, readShareConfig(), amount)
      if (share) {
        const owner = boundBinding?.promoterId ? { promoterId: boundBinding.promoterId } : boundBinding?.staffAccountId ? { staffAccountId: boundBinding.staffAccountId } : {}
        writeShareRecord({ id: createId('SR'), userId: this.currentUserId, orderId, orderAmount: amount, role: share.role, ...owner, rate: share.rate, amount: share.amount, createdAt: new Date().toLocaleString('zh-CN') })
      }
    },
    setCurrentUser(userId: string) {
      if (!userId) return
      this.currentUserId = userId
      if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', userId)
    },
    setReferrer(referrer: { type?: 'promoter' | 'staff'; name?: string; promoterId?: string; staffAccountId?: string; liveId?: string }) {
      this.referrer = referrer || {}
      const bindings = readUserBindings() ?? {}
      const existing = bindings[this.currentUserId]
      if (existing && existing.status === 'bound') return
      if (referrer?.promoterId) {
        upsertUserBinding({ userId: this.currentUserId, promoterId: referrer.promoterId, status: 'pending' })
      } else if (referrer?.staffAccountId) {
        upsertUserBinding({ userId: this.currentUserId, staffAccountId: referrer.staffAccountId, status: 'pending' })
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
    logout() {
      this.auth = { isLoggedIn: false, openid: '' }
      this.role = 'customer'
    }
  }
})
