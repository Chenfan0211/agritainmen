import { defineStore } from 'pinia'
import type { AfterSale, Category, CommissionRule, CommissionSettlementRecord, DictGroup, DictItem, FarmStore, MockScenario, Order, PricePolicy, PriceTier, Product, Promoter, StoreAccount, Supplier, SupplierSettlementRecord } from '@agritainment/shared'
import { DEMO_ACCOUNT, createId, mergeEntitySeeds, readPlatformMedia, round2, upsertPlatformFarm, upsertPlatformFarmPopularity, upsertPlatformProduct, validateAccountPassword, writePlatformMedia, mergePlatformStoreAccounts, readPlatformStoreAccounts, readShareConfig, readShareRecords, writePlatformStoreAccounts, writeShareConfig } from '@agritainment/shared'
import { adminRepository } from '../services/repository'

interface AdminState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  suppliers: Supplier[]
  products: Product[]
  categories: Category[]
  orders: Order[]
  afterSales: AfterSale[]
  farms: FarmStore[]
  promoters: Promoter[]
  policies: PricePolicy[]
  commissionRules: CommissionRule[]
  lastSettledAt: string
  supplierSettlementRecords: SupplierSettlementRecord[]
  commissionSettlementRecords: CommissionSettlementRecord[]
  dictGroups: DictGroup[]
  dictItems: DictItem[]
  storeAccounts: StoreAccount[]
  exportRecords: Array<{ id: string; module: string; count: number; createdAt: string }>
  notificationsRead: boolean
  auth: { isLoggedIn: boolean; account: string }
}

export const useAdminStore = defineStore('operations', {
  state: (): AdminState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    suppliers: [],
    products: [],
    categories: [],
    orders: [],
    afterSales: [],
    farms: [],
    promoters: [],
    policies: [],
    commissionRules: [],
    lastSettledAt: '',
    supplierSettlementRecords: [],
    commissionSettlementRecords: [],
    dictGroups: [],
    dictItems: [],
    storeAccounts: [],
    exportRecords: [],
    notificationsRead: false,
    auth: { isLoggedIn: false, account: '' }
  }),
  getters: {
    pendingSuppliers: (state) => state.suppliers.filter((item) => item.status === 'pending').length,
    pendingProducts: (state) => state.products.filter((item) => item.status === 'pending').length,
    pendingOrders: (state) => state.orders.filter((item) => item.status === 'pending').length,
    pendingAfterSales: (state) => state.afterSales.filter((item) => !['refunded', 'rejected', 'refund-failed'].includes(item.status)).length,
    totalCommission: (state) => round2(state.promoters.reduce((sum, item) => sum + item.commission, 0)),
    totalGmv: (state) => round2(state.orders.reduce((sum, item) => sum + item.amount, 0)),
    activeFarmCount: (state) => state.farms.filter((item) => item.status === 'active').length,
    activeSupplierCount: (state) => state.suppliers.filter((item) => item.status === 'cooperating').length,
    shippedOrderCount: (state) => state.orders.filter((item) => item.status === 'shipping' || item.status === 'delivered').length,
    hotProducts: (state) => [...state.products].sort((a, b) => b.sales - a.sales).slice(0, 5),
    dailyTrend: (state) => {
      const latest = state.orders.reduce((value, order) => Math.max(value, new Date(order.createdAt.replace(' ', 'T')).getTime() || 0), 0) || Date.now()
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(latest)
        date.setDate(date.getDate() - (6 - index))
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const orders = state.orders.filter((order) => order.createdAt.startsWith(key))
        return { key, label: `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')}`, amount: round2(orders.reduce((sum, order) => sum + order.amount, 0)), count: orders.length }
      })
    }
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && (this.suppliers.length > 0 || this.products.length > 0 || this.orders.length > 0)
      this.loading = true
      this.error = ''
      try {
        const data = await adminRepository.loadDashboard(this.mockScenario)
        this.$patch({
          suppliers: hasPersistedData ? mergeEntitySeeds(data.suppliers, this.suppliers) : data.suppliers,
          products: hasPersistedData ? mergeEntitySeeds(data.products, this.products) : data.products,
          categories: hasPersistedData ? mergeEntitySeeds(data.categories, this.categories) : data.categories,
          orders: hasPersistedData ? mergeEntitySeeds(data.orders, this.orders) : data.orders,
          afterSales: hasPersistedData ? mergeEntitySeeds(data.afterSales, this.afterSales) : data.afterSales,
          farms: hasPersistedData ? mergeEntitySeeds(data.farms, this.farms) : data.farms,
          promoters: hasPersistedData ? mergeEntitySeeds(data.promoters, this.promoters) : data.promoters,
          policies: hasPersistedData ? mergeEntitySeeds(data.pricePolicies, this.policies) : data.pricePolicies,
          commissionRules: hasPersistedData ? mergeEntitySeeds(data.commissionRules, this.commissionRules) : data.commissionRules,
          commissionSettlementRecords: hasPersistedData ? mergeEntitySeeds(data.commissionSettlements, this.commissionSettlementRecords) : data.commissionSettlements,
          supplierSettlementRecords: hasPersistedData ? mergeEntitySeeds(data.supplierSettlements, this.supplierSettlementRecords) : data.supplierSettlements,
          dictGroups: hasPersistedData ? mergeEntitySeeds(data.dictGroups, this.dictGroups) : data.dictGroups,
          dictItems: hasPersistedData ? mergeEntitySeeds(data.dictItems, this.dictItems) : data.dictItems,
          storeAccounts: mergePlatformStoreAccounts(data.storeAccounts, readPlatformStoreAccounts()),
          initialized: true
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
    addCategory(name: string, type: Category['type']) {
      const trimmed = name.trim()
      if (!trimmed) return false
      if (this.categories.some((item) => item.name === trimmed)) return false
      this.categories.unshift({ id: createId('C'), name: trimmed, type })
      return true
    },
    updateCategory(id: string, name: string, type: Category['type']) {
      const trimmed = name.trim()
      const item = this.categories.find((candidate) => candidate.id === id)
      if (!item || !trimmed) return false
      if (this.categories.some((candidate) => candidate.id !== id && candidate.name === trimmed)) return false
      item.name = trimmed
      item.type = type
      return true
    },
    removeCategory(id: string) {
      const item = this.categories.find((candidate) => candidate.id === id)
      if (!item) return false
      const inUse = this.products.some((product) => product.category === item.name) || this.suppliers.some((supplier) => supplier.category === item.name)
      if (inUse) return false
      this.categories = this.categories.filter((candidate) => candidate.id !== id)
      return true
    },
    addDictGroup(payload: { type: string; name: string }) {
      const type = payload.type.trim()
      const name = payload.name.trim()
      if (!type || !name) return false
      if (this.dictGroups.some((item) => item.type === type || item.name === name)) return false
      this.dictGroups.push({ id: createId('DG'), type, name })
      return true
    },
    updateDictGroup(id: string, payload: { type?: string; name?: string }) {
      const item = this.dictGroups.find((candidate) => candidate.id === id)
      if (!item) return false
      const nextType = payload.type?.trim()
      const nextName = payload.name?.trim()
      if (nextType) {
        if (this.dictGroups.some((candidate) => candidate.id !== id && candidate.type === nextType)) return false
        const oldType = item.type
        item.type = nextType
        this.dictItems.forEach((dictItem) => { if (dictItem.type === oldType) dictItem.type = item.type })
      }
      if (nextName) {
        if (this.dictGroups.some((candidate) => candidate.id !== id && candidate.name === nextName)) return false
        item.name = nextName
      }
      return true
    },
    removeDictGroup(id: string) {
      const item = this.dictGroups.find((candidate) => candidate.id === id)
      if (!item) return false
      if (this.dictItems.some((dictItem) => dictItem.type === item.type)) return false
      this.dictGroups = this.dictGroups.filter((candidate) => candidate.id !== id)
      return true
    },
    addDictItem(payload: { type: DictItem['type']; code: string; label: string; enabled?: boolean; sort?: number }) {
      const code = payload.code.trim()
      const label = payload.label.trim()
      if (!code || !label) return false
      if (this.dictItems.some((item) => item.type === payload.type && item.code === code)) return false
      this.dictItems.unshift({ id: createId('DI'), type: payload.type, code, label, enabled: payload.enabled ?? true, sort: payload.sort ?? 0 })
      return true
    },
    updateDictItem(id: string, payload: { code?: string; label?: string; enabled?: boolean; sort?: number }) {
      const item = this.dictItems.find((candidate) => candidate.id === id)
      if (!item) return false
      if (payload.code !== undefined && payload.code.trim()) item.code = payload.code.trim()
      if (payload.label !== undefined && payload.label.trim()) item.label = payload.label.trim()
      if (payload.enabled !== undefined) item.enabled = payload.enabled
      if (payload.sort !== undefined) item.sort = payload.sort
      return true
    },
    removeDictItem(id: string) {
      const item = this.dictItems.find((candidate) => candidate.id === id)
      if (!item) return false
      this.dictItems = this.dictItems.filter((candidate) => candidate.id !== id)
      return true
    },
    addStoreAccount(payload: { farmId: string; name: string; account: string; password: string; role: StoreAccount['role']; promoEnabled?: boolean }) {
      if (!payload.farmId || !payload.name.trim() || !payload.account.trim() || !payload.password.trim()) return false
      if (this.storeAccounts.some((item) => item.farmId === payload.farmId && item.account === payload.account)) return false
      this.storeAccounts.unshift({ id: createId('SA'), farmId: payload.farmId, name: payload.name.trim(), account: payload.account.trim(), password: payload.password.trim(), role: payload.role, enabled: true, promoEnabled: payload.promoEnabled ?? false, createdAt: new Date().toLocaleString('zh-CN') })
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
    inviteSupplier(payload: { name: string; category: string; region?: string; contactPhone?: string; businessLicense?: string; permit?: string; validUntil?: string; coop?: boolean }) {
      if (!payload.name.trim()) return false
      const coop = payload.coop === true
      this.suppliers.unshift({
        id: createId('S'), name: payload.name.trim(), region: payload.region?.trim() || '待补充', category: payload.category,
        certified: coop, status: coop ? 'cooperating' : 'pending', productCount: 0, coop,
        contactPhone: payload.contactPhone?.trim() || undefined,
        qualification: {
          businessLicense: payload.businessLicense?.trim() || '待上传',
          permit: payload.permit?.trim() || '待上传',
          validUntil: payload.validUntil?.trim() || '待补充',
          reviewNote: coop ? '供销社体系渠道，自动通过' : '运营邀请入驻，等待供应商补充资质'
        }
      })
      return true
    },
    updateSupplier(id: string, payload: { name: string; category: string; region?: string; contactPhone?: string; businessLicense?: string; permit?: string; validUntil?: string; coop?: boolean }) {
      const item = this.suppliers.find((supplier) => supplier.id === id)
      if (!item || !payload.name.trim()) return false
      item.name = payload.name.trim()
      item.region = payload.region?.trim() || item.region
      item.category = payload.category
      item.contactPhone = payload.contactPhone?.trim() || undefined
      if (payload.coop !== undefined) {
        item.coop = payload.coop
        if (payload.coop) {
          item.status = 'cooperating'
          item.certified = true
        }
      }
      item.qualification = {
        businessLicense: payload.businessLicense?.trim() || item.qualification.businessLicense,
        permit: payload.permit?.trim() || item.qualification.permit,
        validUntil: payload.validUntil?.trim() || item.qualification.validUntil,
        reviewNote: item.qualification.reviewNote
      }
      return true
    },
    auditSupplier(id: string, approved: boolean) {
      const item = this.suppliers.find((supplier) => supplier.id === id)
      if (!item) return
      item.certified = approved
      item.status = approved ? 'cooperating' : 'paused'
    },
    toggleSupplier(id: string) {
      const item = this.suppliers.find((supplier) => supplier.id === id)
      if (!item || item.status === 'pending') return
      item.status = item.status === 'cooperating' ? 'paused' : 'cooperating'
      if (item.status === 'cooperating') item.certified = true
    },
    auditProduct(id: string, approved: boolean) {
      const item = this.products.find((product) => product.id === id)
      if (item) item.status = approved ? 'active' : 'rejected'
    },
    createProduct(payload: Pick<Product, 'name' | 'category' | 'price' | 'cost' | 'stock' | 'source' | 'supplier' | 'spec' | 'images'> & { image?: string }) {
      const price = round2(payload.price)
      const cost = round2(payload.cost)
      if (!payload.name || price <= 0 || cost < 0 || price <= cost || payload.stock < 0) return false
      const id = createId('P')
      this.products.unshift({
        ...payload, id, price, cost, sales: 0, status: payload.source === 'farmhouse' ? 'pending' : 'active',
        image: payload.image || '/static/images/rice.webp', tags: ['运营新增'], farmIds: [],
        skus: [{ id: `${id}-DEFAULT`, name: '默认规格', price, cost, stock: payload.stock }]
      })
      const createdProduct = this.products[0]
      writePlatformMedia(upsertPlatformProduct(readPlatformMedia(), createdProduct.id, createdProduct.image, createdProduct.images))
      return true
    },
    updateProduct(id: string, payload: { name?: string; category?: string; supplier?: string; cost?: number; price: number; stock: number; skuId?: string; spec?: string; image?: string; images?: string[] }) {
      const item = this.products.find((product) => product.id === id)
      if (!item || payload.price <= 0 || payload.stock < 0 || (payload.cost !== undefined && (payload.cost < 0 || payload.price <= payload.cost))) return false
      const sku = item.skus.find((candidate) => candidate.id === payload.skuId) || item.skus[0]
      if (!sku) return false
      const price = round2(payload.price)
      const cost = payload.cost !== undefined ? round2(payload.cost) : sku.cost
      if (price <= 0 || cost < 0 || price <= cost) return false
      if (payload.name?.trim()) item.name = payload.name.trim()
      if (payload.category?.trim()) item.category = payload.category.trim()
      if (payload.supplier?.trim()) item.supplier = payload.supplier.trim()
      if (payload.spec !== undefined) item.spec = payload.spec.trim()
      if (payload.image !== undefined) item.image = payload.image
      if (payload.images !== undefined) item.images = payload.images
      sku.price = price
      sku.stock = payload.stock
      if (payload.cost !== undefined) sku.cost = cost
      item.price = Math.min(...item.skus.map((candidate) => candidate.price))
      item.stock = item.skus.reduce((sum, candidate) => sum + candidate.stock, 0)
      item.cost = Math.min(...item.skus.map((candidate) => candidate.cost))
      writePlatformMedia(upsertPlatformProduct(readPlatformMedia(), item.id, item.image, item.images))
      return true
    },
    toggleProduct(id: string) {
      const item = this.products.find((product) => product.id === id)
      if (!item || item.status === 'pending' || item.status === 'rejected') return
      item.status = item.status === 'active' ? 'offline' : 'active'
    },
    createPolicy(name: string, type: PricePolicy['type'], scope: string, discount: number, tiers?: PriceTier[]) {
      discount = round2(discount)
      if (!name || !scope || discount <= 0 || discount > 100) return false
      this.policies.unshift({ id: createId('R'), name, type, scope, discount, enabled: true, tiers: tiers?.map((tier) => ({ ...tier, price: round2(tier.price) })) })
      return true
    },
    updatePolicy(id: string, name: string, scope: string, discount: number, enabled?: boolean, tiers?: PriceTier[]) {
      const item = this.policies.find((policy) => policy.id === id)
      discount = round2(discount)
      if (!item || !name || !scope || discount <= 0 || discount > 100) return false
      Object.assign(item, { name, scope, discount })
      if (enabled !== undefined) item.enabled = enabled
      if (tiers !== undefined) item.tiers = tiers.map((tier) => ({ ...tier, price: round2(tier.price) }))
      return true
    },
    togglePolicy(id: string) {
      const item = this.policies.find((policy) => policy.id === id)
      if (item) item.enabled = !item.enabled
    },
    shipOrder(id: string, trackingNo?: string) {
      const item = this.orders.find((order) => order.id === id)
      if (!item || item.status !== 'pending') return false
      const now = new Date().toLocaleString('zh-CN')
      item.status = 'shipping'
      item.trackingNo = trackingNo?.trim() || createId('SF')
      item.logistics = [
        { time: now, title: '供应商已发货', detail: `运单 ${item.trackingNo} 已录入` },
        { time: '预计 2 小时内', title: '仓配中心揽收', detail: '等待模拟物流节点推进' }
      ]
      return true
    },
    batchShipOrders(ids: string[]) {
      return ids.reduce((count, id) => count + (this.shipOrder(id) ? 1 : 0), 0)
    },
    advanceLogistics(id: string) {
      const item = this.orders.find((order) => order.id === id)
      if (!item || item.status !== 'shipping') return false
      item.logistics ||= []
      const now = new Date().toLocaleString('zh-CN')
      if (item.logistics.length === 0 || item.logistics.length === 2) {
        item.logistics.push({ time: now, title: '配送中', detail: '商品已离开区域仓，正在配送至门店' })
        return true
      }
      item.logistics.push({ time: now, title: '已签收', detail: `${item.customer} 已确认收货` })
      item.status = 'delivered'
      return true
    },
    initiateAfterSale(orderId: string, type: AfterSale['type'], issue: string) {
      const order = this.orders.find((candidate) => candidate.id === orderId)
      if (!order || order.status !== 'delivered') return false
      if (this.afterSales.some((afterSale) => afterSale.orderId === orderId)) return false
      const firstItem = order.items?.[0]
      this.afterSales.unshift({
        id: createId('AS'), orderId,
        productName: firstItem?.name || order.productName,
        applicant: order.customer,
        type,
        amount: order.amount,
        status: 'processing',
        issue,
        quantity: firstItem?.quantity || order.quantity,
        image: firstItem?.image,
        history: [{ time: new Date().toLocaleString('zh-CN'), action: '用户发起售后，平台受理中', operator: '运营管理员' }]
      })
      return true
    },
    rejectAfterSale(id: string) {
      const item = this.afterSales.find((afterSale) => afterSale.id === id)
      if (!item || item.status !== 'processing') return false
      item.status = 'rejected'
      item.history ||= []
      item.history.push({ time: new Date().toLocaleString('zh-CN'), action: '售后申请已拒绝', operator: '运营管理员' })
      return true
    },
    approveAfterSaleRefund(id: string) {
      const item = this.afterSales.find((afterSale) => afterSale.id === id)
      if (!item || item.status !== 'processing') return false
      item.status = 'refund-pending'
      item.history ||= []
      item.history.push({ time: new Date().toLocaleString('zh-CN'), action: '已同意退款，待退款', operator: '运营管理员' })
      return true
    },
    approveAfterSaleReturn(id: string) {
      const item = this.afterSales.find((afterSale) => afterSale.id === id)
      if (!item || item.status !== 'processing') return false
      item.status = 'return-pending'
      item.history ||= []
      item.history.push({ time: new Date().toLocaleString('zh-CN'), action: '已同意退货，待退货', operator: '运营管理员' })
      return true
    },
    refundAfterSale(id: string, ok: boolean) {
      const item = this.afterSales.find((afterSale) => afterSale.id === id)
      if (!item || (item.status !== 'refund-pending' && item.status !== 'return-pending')) return false
      item.status = ok ? 'refunded' : 'refund-failed'
      item.refundAmount = ok ? item.amount : undefined
      item.history ||= []
      item.history.push({ time: new Date().toLocaleString('zh-CN'), action: ok ? `退款成功 ¥${item.amount.toFixed(2)}` : '退款失败', operator: '运营管理员' })
      return true
    },
    addFarm(payload: { name: string; region: string; city?: string; tags?: string[]; rating?: number; averageSpend?: number; status?: FarmStore['status']; image?: string; livePopularity?: number }) {
      if (!payload.name.trim()) return false
      this.farms.unshift({
        id: createId('F'), name: payload.name.trim(), region: payload.region.trim() || '待补充', distance: 0,
        rating: payload.rating ?? 5, monthlySales: 0, averageSpend: payload.averageSpend ?? 0,
        status: payload.status ?? 'pending', selectedCount: 0, gmv: 0, image: payload.image || '/static/images/farmhouse.webp',
        tags: payload.tags?.length ? payload.tags : ['新入驻'],
        city: payload.city?.trim() || (payload.region.includes('张家界') ? '张家界市' : '湘西州'),
        availability: 'bookable', livePopularity: payload.livePopularity ?? 0
      })
      const createdFarm = this.farms[0]
      let farmMedia = readPlatformMedia()
      farmMedia = upsertPlatformFarm(farmMedia, createdFarm.id, createdFarm.image)
      farmMedia = upsertPlatformFarmPopularity(farmMedia, createdFarm.id, createdFarm.livePopularity)
      writePlatformMedia(farmMedia)
      return true
    },
    updateFarm(id: string, payload: { name: string; region: string; city?: string; tags?: string[]; rating?: number; averageSpend?: number; status?: FarmStore['status']; image?: string; livePopularity?: number }) {
      const item = this.farms.find((farm) => farm.id === id)
      if (!item || !payload.name.trim()) return false
      item.name = payload.name.trim()
      item.region = payload.region.trim() || item.region
      if (payload.city?.trim()) item.city = payload.city.trim()
      if (payload.tags?.length) item.tags = payload.tags
      if (payload.rating !== undefined) item.rating = payload.rating
      if (payload.averageSpend !== undefined) item.averageSpend = payload.averageSpend
      if (payload.status) item.status = payload.status
      if (payload.image) item.image = payload.image
      if (payload.livePopularity !== undefined) item.livePopularity = Math.max(0, Math.round(payload.livePopularity))
      let farmMedia = readPlatformMedia()
      farmMedia = upsertPlatformFarm(farmMedia, item.id, item.image)
      farmMedia = upsertPlatformFarmPopularity(farmMedia, item.id, item.livePopularity)
      writePlatformMedia(farmMedia)
      return true
    },
    addPromoter(payload: { name: string; level: string; type?: string; status: Promoter['status'] }) {
      if (!payload.name.trim()) return false
      this.promoters.unshift({
        id: createId('T'), name: payload.name.trim(), level: payload.level.trim() || '普通推客', type: payload.type,
        fans: 0, orders: 0, gmv: 0, commission: 0, cumulativeCommission: 0, settled: false, status: payload.status
      })
      return true
    },
    updatePromoter(id: string, payload: { name: string; level: string; type?: string; status: Promoter['status'] }) {
      const item = this.promoters.find((promoter) => promoter.id === id)
      if (!item || !payload.name.trim()) return false
      item.name = payload.name.trim()
      item.level = payload.level.trim() || item.level
      if (payload.type) item.type = payload.type
      if (payload.status) item.status = payload.status
      return true
    },
    settleCommissions() {
      const settled = this.promoters.filter((item) => !item.settled && item.commission > 0)
      const amount = Math.round(settled.reduce((sum, item) => sum + item.commission, 0) * 100) / 100
      if (!settled.length || amount <= 0) return false
      const createdAt = new Date().toLocaleString('zh-CN')
      this.commissionSettlementRecords.unshift({
        id: createId('CS'), promoterIds: settled.map((item) => item.id), amount, createdAt,
        items: settled.map((item) => ({ promoterId: item.id, promoterName: item.name, amount: item.commission }))
      })
      settled.forEach((item) => { item.commission = 0; item.settled = true })
      this.lastSettledAt = createdAt
      return true
    },
    settleSuppliers(ids: string[]) {
      const suppliers = this.suppliers.filter((item) => ids.includes(item.id))
      if (!suppliers.length) return false
      const supplierIds = suppliers.map((item) => item.id)
      const orders = this.orders.filter((item) => item.status === 'delivered' && !item.settlementId && item.supplierId && supplierIds.includes(item.supplierId))
      if (!orders.length) return false
      const createdAt = new Date().toLocaleString('zh-CN')
      const items = suppliers.map((supplier) => {
        const supplierOrders = orders.filter((order) => order.supplierId === supplier.id)
        return { supplierId: supplier.id, supplierName: supplier.name, orderIds: supplierOrders.map((order) => order.id), amount: Math.round(supplierOrders.reduce((sum, order) => sum + order.amount, 0) * 100) / 100 }
      }).filter((item) => item.orderIds.length)
      const id = createId('ST')
      this.supplierSettlementRecords.unshift({ id, period: createdAt.slice(0, 7), supplierIds: items.map((item) => item.supplierId), orderIds: orders.map((item) => item.id), amount: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100, createdAt, items })
      orders.forEach((item) => { item.settlementId = id })
      return true
    },
    updateCommissionRule(id: string, rate: number, enabled: boolean) {
      const item = this.commissionRules.find((rule) => rule.id === id)
      rate = round2(rate)
      if (!item || rate <= 0 || rate > 100) return false
      item.rate = rate
      item.enabled = enabled
      item.updatedAt = new Date().toLocaleString('zh-CN')
      return true
    },
    markNotificationsRead() {
      this.notificationsRead = true
    },
    recordExport(module: string, count: number) {
      this.exportRecords.unshift({ id: createId('EX'), module, count, createdAt: new Date().toLocaleString('zh-CN') })
    },
    login(account: string, password: string) {
      if (!validateAccountPassword(account, password)) return false
      this.auth = { isLoggedIn: true, account: DEMO_ACCOUNT }
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, account: '' }
    }
  }
})
