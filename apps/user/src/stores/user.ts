import { defineStore } from 'pinia'
import type { CatalogState, CAddress, CCartItem, CCommissionAllocation, CCommissionChain, CDistributorProfile, COrder, COrderItem, CProduct, CProductSku, CUserLevel, FarmStore, LiveRoom, MockScenario, Product, UserBinding } from '@agritainment/shared'
import {
  abortCatalogTransaction, allocateCCommissions, applyCatalogStockOperation, cPriceForSku, catalogProductToCProduct, catalogProductsForAudience, cloneSeed, commitCatalogTransaction, createId, demoCDistributorProfiles, deriveCOrderStatus, ensureCatalogState, markCatalogTransactionStockApplied, normalizeCAddresses, normalizeCOrders, normalizeCProducts, prepareCatalogTransaction, promoters, readCAddresses, readCCommissionRecords, readCatalogState, readCOrders, readCUserSession, readCDistributorProfiles, readPendingCatalogTransactions, round2,
  confirmCSubOrderReceiptAtSupplier, markCSubOrderAfterSaleAtSupplier, readPlatformOrders, readUserBindings, resolveCReferralChain, resolveUserIdentity, simulateWechatLogin, splitCOrderItems, syncCSubOrderFromSupplier, upsertUserBinding, writeCAddresses, writeCCommissionRecords, writeCOrder, writeCOrders, writeCUserSession, publishCSubOrderToSupplier, writePlatformOrder
} from '@agritainment/shared'
import { readLivePackageProjection, readLiveRoomProjection, userRepository } from '../services/repository'

interface CartLine extends CCartItem { stock: number; unavailable?: boolean }

interface UserCatalogTransactionPayload {
  order: COrder
  binding?: UserBinding
}

interface UserState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  farms: FarmStore[]
  products: Product[]
  cProducts: CProduct[]
  inventoryRevision: number
  liveRooms: LiveRoom[]
  liveId: string
  promoterId: string
  promoterName: string
  referralPromoterId: string
  userId: string
  cart: CartLine[]
  orders: COrder[]
  addresses: CAddress[]
  commissionRecords: CCommissionAllocation[]
  auth: { isLoggedIn: boolean; openid: string }
  checkoutError: string
  entryChecked: boolean
  entryRestricted: boolean
}

const nowString = () => new Date().toISOString()
const validLevel = (value: unknown): value is CUserLevel => value === 'normal' || value === 'level1' || value === 'level2'
const resolveDirectReferralChain = (promoterId: string, profiles: Record<string, CDistributorProfile>): CCommissionChain | null => resolveCReferralChain(promoterId, promoters, profiles)
const persistUserAddresses = (userId: string, addresses: CAddress[], options: { removedIds?: string[]; defaultId?: string } = {}) => {
  const all = readCAddresses() || {}
  options.removedIds?.forEach((id) => { delete all[id] })
  addresses.forEach((address) => { all[address.id] = address })
  if (options.defaultId) {
    const updatedAt = nowString()
    Object.values(all).forEach((address) => {
      if (address.userId !== userId) return
      address.isDefault = address.id === options.defaultId
      if (address.isDefault) address.updatedAt = updatedAt
    })
  }
  const normalized = normalizeCAddresses(all)
  writeCAddresses(normalized)
  return Object.values(normalized).filter((address) => address.userId === userId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

const persistCommissionChanges = (changes: CCommissionAllocation[]): CCommissionAllocation[] | null => {
  const records = new Map((readCCommissionRecords() || []).map((item) => [item.id, item]))
  changes.forEach((item) => records.set(item.id, item))
  const merged = [...records.values()]
  return writeCCommissionRecords(merged) ? merged : null
}

function persistUserCatalogTransaction(payload: UserCatalogTransactionPayload): CCommissionAllocation[] | null {
  const commissions = persistCommissionChanges(payload.order.commissionAllocations)
  if (!commissions || !writeCOrder(payload.order)) return null
  if (payload.binding && !upsertUserBinding(payload.binding)) return null
  return commissions
}

function applyOrderSnapshot(target: COrder, snapshot: COrder): void {
  const subOrders = snapshot.subOrders.map((next) => {
    const current = target.subOrders.find((item) => item.id === next.id)
    if (!current) return next
    Object.assign(current, next)
    return current
  })
  Object.assign(target, snapshot, { subOrders })
}

function recoverUserCatalogTransactions(initial: CatalogState): CatalogState {
  let catalog = initial
  for (const entry of readPendingCatalogTransactions('user')) {
    const payload = entry.payload as Partial<UserCatalogTransactionPayload>
    if (!payload.order?.id) { abortCatalogTransaction(entry.id); continue }
    if (entry.status === 'prepared') {
      const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, readCatalogState()?.revision ?? catalog.revision)
      if (!result) { abortCatalogTransaction(entry.id); continue }
      catalog = result.state
      if (!markCatalogTransactionStockApplied(entry.id)) continue
    }
    if (!persistUserCatalogTransaction(payload as UserCatalogTransactionPayload)) continue
    commitCatalogTransaction(entry.id)
  }
  return readCatalogState() || catalog
}

function syncPersistedFulfillment(orders: Record<string, COrder>): Record<string, COrder> {
  const supplierOrders = readPlatformOrders() || {}
  const next = { ...orders }
  Object.values(next).forEach((order) => {
    order.subOrders.forEach((sub) => {
      const supplierOrder = supplierOrders[`C-MALL-${sub.id}`]
      if (supplierOrder?.supplierOrderLink?.source === 'c-mall') next[order.id] = syncCSubOrderFromSupplier(next[order.id], sub, supplierOrder)
    })
  })
  return next
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    initialized: false, loading: false, error: '', mockScenario: 'normal', farms: [], products: [], cProducts: [], inventoryRevision: 0, liveRooms: [], liveId: '', promoterId: '', promoterName: '', referralPromoterId: '', userId: '',
    cart: [], orders: [], addresses: [], commissionRecords: [], auth: { isLoggedIn: false, openid: '' }, checkoutError: '', entryChecked: false, entryRestricted: false
  }),
  getters: {
    currentLive: (state) => state.liveRooms.find((item) => item.id === state.liveId) || null,
    liveFarms: (state) => {
      const live = state.liveRooms.find((item) => item.id === state.liveId)
      if (!live?.linkedFarms?.length) return []
      return live.linkedFarms.map((item) => {
        const farm = state.farms.find((f) => f.id === item.farmId)
        return { farm, packages: item.packageIds.map((id) => state.products.find((p) => p.id === id)).filter((p): p is Product => !!p) }
      }).filter((item) => item.farm && item.packages.length)
    },
    distributorProfiles: (): Record<string, CDistributorProfile> => readCDistributorProfiles() || {},
    level: (state): CUserLevel => (readCDistributorProfiles()?.[state.userId]?.status === 'active' ? readCDistributorProfiles()?.[state.userId]?.level : 'normal') || 'normal',
    currentDistributor: (state) => {
      const profile = readCDistributorProfiles()?.[state.userId]
      return profile && profile.status === 'active' ? profile : null
    },
    priceFor: (state) => {
      const userId = state.userId
      return (sku: CProductSku, level?: CUserLevel) => {
      const profile = readCDistributorProfiles()?.[userId]
      const resolved = level || (profile?.status === 'active' ? profile.level : 'normal')
      return cPriceForSku(sku, resolved)
      }
    },
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => Math.round(state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100,
    defaultAddress: (state) => state.addresses.find((item) => item.isDefault) || state.addresses[0] || null,
    myCommissionRecords: (state) => {
      const profile = readCDistributorProfiles()?.[state.userId]
      const beneficiaryId = profile?.status === 'active' ? profile.promoterId : undefined
      return state.commissionRecords.filter((item) => item.beneficiaryId === beneficiaryId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    availableCommission(): number { return Math.round(this.myCommissionRecords.filter((item) => item.status === 'available').reduce((sum, item) => sum + item.amount, 0) * 100) / 100 },
    pendingCommission(): number { return Math.round(this.myCommissionRecords.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) * 100) / 100 }
  },
  actions: {
    applyCatalogState(catalog: CatalogState) {
      const products = normalizeCProducts(catalogProductsForAudience(catalog, 'user').map(catalogProductToCProduct))
      this.cProducts = products
      this.inventoryRevision = catalog.revision
      this.cart = this.cart.map((line) => {
        const sku = products.find((product) => product.id === line.productId)?.skus.find((candidate) => candidate.id === line.skuId)
        return { ...line, stock: sku?.stock ?? 0, unavailable: !sku || line.quantity > sku.stock }
      })
    },
    refreshCatalog() {
      const catalog = readCatalogState()
      if (catalog) this.applyCatalogState(catalog)
      return catalog
    },
    failStockConflict() {
      this.refreshCatalog()
      this.checkoutError = '库存已更新，请刷新后重试'
      return false
    },
    persistSession() {
      if (!this.userId) return
      const cart = this.cart.map(({ stock: _stock, ...item }) => item)
      writeCUserSession(this.userId, { cart, referralPromoterId: this.referralPromoterId })
    },
    restoreSession() {
      if (!this.userId) return
      const session = readCUserSession(this.userId)
      const restored: Array<CartLine | null> = session.cart.map((item): CartLine | null => {
        const product = this.cProducts.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        const quantity = Number(item.quantity)
        const amounts = [item.unitPrice, item.basePrice, item.level1Commission, item.level2Commission]
        if (!product || product.status !== 'active' || product.shippingType !== 'courier' || !sku || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(sku.stock) || sku.stock < 0 || !amounts.every((amount) => Number.isFinite(amount) && amount >= 0) || !validLevel(item.lockedLevel)) return null
        return { ...item, quantity, stock: sku.stock, unavailable: quantity > sku.stock }
      })
      this.cart = restored.filter((item): item is CartLine => item !== null)
      if (!this.referralPromoterId && session.referralPromoterId) this.referralPromoterId = session.referralPromoterId
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      if (!this.entryChecked) this.applyLaunch({})
      if (this.entryChecked && this.entryRestricted) {
        this.cProducts = []
        this.initialized = true
        return
      }
      this.loading = true; this.error = ''
      try {
        const data = await userRepository.loadDashboard(this.mockScenario)
        const catalog = recoverUserCatalogTransactions(ensureCatalogState(data.catalogStoreProducts, data.cProducts))
        const savedOrders = syncPersistedFulfillment(normalizeCOrders(readCOrders() || {}))
        const savedAddresses = normalizeCAddresses(readCAddresses() || {})
        const savedCommissionRecords = readCCommissionRecords() || []
        this.$patch({
          farms: data.farms, products: data.products, liveRooms: data.liveRooms,
          orders: this.userId ? Object.values(savedOrders).filter((item) => item.userId === this.userId) : [],
          addresses: this.userId ? Object.values(savedAddresses).filter((item) => item.userId === this.userId) : [],
          commissionRecords: this.userId ? savedCommissionRecords : [], initialized: true
        })
        this.applyCatalogState(catalog)
        writeCOrders(savedOrders)
        writeCAddresses(savedAddresses)
        if (this.userId) this.restoreSession()
      } catch (error) { this.error = error instanceof Error ? error.message : '数据加载失败' } finally { this.loading = false }
    },
    applyLaunch(query: Record<string, string | undefined>) {
      const savedLive = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-live-id') : ''
      const savedName = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-promoter-name') : ''
      this.liveId = query.live || (typeof savedLive === 'string' ? savedLive : '') || ''
      this.promoterName = query.promoterName || (typeof savedName === 'string' ? savedName : '') || ''
      if (!this.userId && this.auth.isLoggedIn && this.auth.openid) this.userId = resolveUserIdentity(this.auth.openid)
      const bound = this.userId ? readUserBindings()?.[this.userId] : undefined
      const requestedPromoter = query.promoter?.trim() || ''
      const profiles = readCDistributorProfiles() || demoCDistributorProfiles
      const validRequestedPromoter = resolveDirectReferralChain(requestedPromoter, profiles) ? requestedPromoter : ''
      this.promoterId = bound?.status === 'bound' ? bound.promoterId || '' : validRequestedPromoter
      this.referralPromoterId = this.promoterId
      this.entryChecked = true
      this.entryRestricted = !this.promoterId
      if (this.liveId && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-live-id', this.liveId)
      if (this.promoterId && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-id', this.promoterId)
      if (this.promoterName && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-name', this.promoterName)
    },
    refreshFulfillment() {
      const synced = syncPersistedFulfillment(normalizeCOrders(readCOrders() || {}))
      writeCOrders(synced)
      this.orders = this.userId ? Object.values(synced).filter((item) => item.userId === this.userId) : []
      return this.orders
    },
    refreshSharedState() {
      this.refreshCatalog()
      this.products = readLivePackageProjection()
      this.liveRooms = readLiveRoomProjection(this.products)
      const synced = syncPersistedFulfillment(normalizeCOrders(readCOrders() || {}))
      const addresses = normalizeCAddresses(readCAddresses() || {})
      this.orders = this.userId ? Object.values(synced).filter((item) => item.userId === this.userId) : []
      this.addresses = this.userId ? Object.values(addresses).filter((item) => item.userId === this.userId) : []
      this.commissionRecords = this.userId ? readCCommissionRecords() || [] : []
      if (this.userId) this.restoreSession()
      return this.orders
    },
    async wechatLogin() { this.persistSession(); const { openid } = await simulateWechatLogin(); this.auth = { isLoggedIn: true, openid }; this.userId = resolveUserIdentity(openid); this.cart = []; this.orders = []; this.addresses = []; this.commissionRecords = []; this.checkoutError = ''; return { openid, userId: this.userId } },
    setReferral(promoterId: string) {
      const value = promoterId.trim()
      const bound = this.userId ? readUserBindings()?.[this.userId] : undefined
      if (bound?.status === 'bound') return bound.promoterId === value
      if (!resolveDirectReferralChain(value, readCDistributorProfiles() || demoCDistributorProfiles)) return false
      this.referralPromoterId = value; this.promoterId = value; this.persistSession()
      this.entryChecked = true; this.entryRestricted = false
      return true
    },
    priceForSku(sku: CProductSku) { return cPriceForSku(sku, this.level) },
    addToCart(productId: string, skuId: string, quantity = 1) {
      const product = this.cProducts.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      if (!product || !sku || product.status !== 'active' || product.shippingType !== 'courier' || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(sku.stock) || sku.stock < 0 || sku.basePrice < 0 || sku.level1Commission < 0 || sku.level2Commission < 0) { this.checkoutError = '商品配置异常，暂不可购买'; return false }
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      if ((line?.quantity || 0) + quantity > sku.stock) { this.checkoutError = `${product.name}（${sku.name}）库存不足`; return false }
      if (line) { line.quantity += quantity; line.unavailable = false }
      else this.cart.push({ productId, skuId, name: product.name, skuName: sku.name, image: sku.image || product.image, quantity, unitPrice: cPriceForSku(sku, this.level), basePrice: sku.basePrice, level1Commission: sku.level1Commission, level2Commission: sku.level2Commission, supplierId: product.supplierId, stock: sku.stock, lockedLevel: this.level })
      this.persistSession()
      this.checkoutError = ''; return true
    },
    changeCart(productId: string, skuId: string, delta: number) {
      const line = this.cart.find((item) => item.productId === productId && item.skuId === skuId)
      const sku = this.cProducts.find((item) => item.id === productId)?.skus.find((item) => item.id === skuId)
      if (!line || !sku || !Number.isInteger(delta) || delta === 0 || delta > 0 && (sku.stock < 0 || line.quantity + delta > sku.stock)) { this.checkoutError = '库存不足'; return false }
      line.quantity += delta
      if (line.quantity <= 0) this.removeFromCart(productId, skuId)
      else { line.stock = sku.stock; line.unavailable = line.quantity > sku.stock; this.persistSession() }
      this.checkoutError = ''; return true
    },
    removeFromCart(productId: string, skuId: string) { this.cart = this.cart.filter((item) => !(item.productId === productId && item.skuId === skuId)); this.persistSession() },
    setAddress(input: Omit<CAddress, 'id' | 'userId'> & { id?: string }) {
      if (!this.userId || !input.receiver.trim() || !/^1[3-9]\d{9}$/.test(input.phone.trim()) || !input.region.trim() || !input.detail.trim()) return false
      const address: CAddress = { ...input, id: input.id || createId('ADDR'), userId: this.userId, receiver: input.receiver.trim(), phone: input.phone.trim(), region: input.region.trim(), detail: input.detail.trim(), isDefault: input.isDefault, updatedAt: new Date().toISOString() }
      if (address.isDefault) this.addresses.forEach((item) => { item.isDefault = false })
      if (this.addresses.some((item) => item.id === address.id)) this.addresses = this.addresses.map((item) => item.id === address.id ? address : item)
      else this.addresses.unshift(address)
      if (!this.addresses.some((item) => item.isDefault) && this.addresses.length) this.addresses[0].isDefault = true
      this.addresses = persistUserAddresses(this.userId, this.addresses, { defaultId: address.isDefault ? address.id : undefined })
      return true
    },
    setDefaultAddress(id: string) {
      if (!this.addresses.some((item) => item.id === id)) return false
      this.addresses = this.addresses.map((item) => ({ ...item, isDefault: item.id === id }))
      this.addresses = persistUserAddresses(this.userId, this.addresses, { defaultId: id })
      return true
    },
    removeAddress(id: string) {
      const removed = this.addresses.find((item) => item.id === id)
      if (!removed) return false
      this.addresses = this.addresses.filter((item) => item.id !== id)
      if (removed.isDefault && this.addresses.length) this.addresses = this.addresses.map((item, index) => ({ ...item, isDefault: index === 0 }))
      this.addresses = persistUserAddresses(this.userId, this.addresses, { removedIds: [id], defaultId: removed.isDefault ? this.addresses[0]?.id : undefined })
      return true
    },
    submitOrder(remark = '') {
      this.checkoutError = ''; const address = this.defaultAddress
      if (this.entryChecked && this.entryRestricted) { this.checkoutError = '请通过有效推客分享链接进入商城'; return false }
      if (!this.userId || !this.cart.length) { this.checkoutError = '购物车为空'; return false }
      if (!address) { this.checkoutError = '请先设置收货地址'; return false }
      const catalog = readCatalogState()
      if (!catalog || catalog.revision !== this.inventoryRevision) return this.failStockConflict()
      const products = normalizeCProducts(catalogProductsForAudience(catalog, 'user').map(catalogProductToCProduct))
      const invalidLine = this.cart.find((line) => {
        const product = products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || product.status !== 'active' || product.shippingType !== 'courier' || !sku || !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.basePrice) || line.basePrice < 0 || !Number.isFinite(line.level1Commission) || line.level1Commission < 0 || !Number.isFinite(line.level2Commission) || line.level2Commission < 0 || !Number.isFinite(sku.stock) || sku.stock < line.quantity
      })
      if (invalidLine) {
        const product = products.find((item) => item.id === invalidLine.productId)
        const sku = product?.skus.find((item) => item.id === invalidLine.skuId)
        this.checkoutError = !product || product.status !== 'active' || product.shippingType !== 'courier' ? `${invalidLine.name}已下架或不支持快递配送` : !sku ? `${invalidLine.name}（${invalidLine.skuName}）规格已失效` : `${invalidLine.name}（${invalidLine.skuName}）库存不足`
        return false
      }
      const items = this.cart.map(({ stock: _stock, lockedLevel: _level, ...item }) => ({ ...item }))
      const id = createId('CO')
      const groups = splitCOrderItems(items)
      const chain = resolveDirectReferralChain(this.referralPromoterId, readCDistributorProfiles() || demoCDistributorProfiles) || {}
      const checkoutLevel = this.cart[0]?.lockedLevel || this.level
      const subOrders = groups.map((group) => {
        const product = this.cProducts.find((item) => item.supplierId === group.supplierId)
        return { id: createId('CSO'), supplierId: group.supplierId, supplierName: product?.supplierName || group.supplierId, items: group.items, amount: Math.round(group.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100, status: 'pending_payment' as const, logistics: [{ time: nowString(), title: '订单已提交', detail: '等待模拟支付' }] }
      })
      const commissionAllocations = groups.flatMap((group, index) => (['normal', 'level2', 'level1'] as CUserLevel[]).flatMap((level) => {
        const levelItems = group.items.filter((item) => this.cart.find((line) => line.productId === item.productId && line.skuId === item.skuId)?.lockedLevel === level)
        return levelItems.length ? allocateCCommissions(levelItems, chain, level, id, subOrders[index].id) : []
      }))
      const order: COrder = { id, userId: this.userId, level: checkoutLevel, address: cloneSeed(address), amount: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100, items, subOrders, distributorChain: [chain.level1Id, chain.level2Id].filter((item): item is string => !!item), commissionAllocations, status: 'pending_payment', createdAt: nowString(), remark: remark.trim() || undefined }
      const operationId = `${order.id}:reserve`
      const inventoryChanges = this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const bound = readUserBindings()?.[this.userId]
      const payload: UserCatalogTransactionPayload = {
        order,
        binding: this.referralPromoterId && chain.level2Id && (!bound || bound.status !== 'bound')
          ? { userId: this.userId, promoterId: this.referralPromoterId, status: 'bound', boundAt: nowString() }
          : undefined
      }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'user', action: 'reserve', inventoryChanges, payload })) {
        this.checkoutError = '订单准备失败，请稍后重试'
        return false
      }
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, catalog.revision)
      if (!stockResult) {
        abortCatalogTransaction(operationId)
        return this.failStockConflict()
      }
      this.applyCatalogState(stockResult.state)
      if (!markCatalogTransactionStockApplied(operationId)) {
        this.checkoutError = '订单处理中，请刷新后重试'
        return false
      }
      const commissions = persistUserCatalogTransaction(payload)
      if (!commissions || !commitCatalogTransaction(operationId)) {
        this.checkoutError = '订单处理中，请刷新后重试'
        return false
      }
      this.orders.unshift(order)
      this.commissionRecords = commissions
      this.cart = []; this.persistSession(); return true
    },
    payOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'pending_payment') return false
      order.paidAt = nowString()
      order.subOrders.forEach((sub) => {
        sub.status = 'paid'
        sub.logistics.push({ time: nowString(), title: '支付成功', detail: '订单已进入供应商备货流程' }, { time: nowString(), title: '等待发货', detail: '供应商准备发货，暂无运单号' })
        writePlatformOrder(publishCSubOrderToSupplier(order, sub))
      })
      order.status = deriveCOrderStatus(order.subOrders); writeCOrder(order); return true
    },
    shipSubOrder(id: string, subOrderId: string) {
      const order = this.orders.find((item) => item.id === id)
      const sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || sub.status !== 'paid' || !!readPlatformOrders()?.[`C-MALL-${sub.id}`]) return false
      sub.status = 'shipped'; sub.courier = '顺丰速运'; sub.trackingNo = `SF${String(Date.now()).slice(-10)}`
      sub.logistics.push({ time: nowString(), title: '商品已发货', detail: `${sub.courier} ${sub.trackingNo} 已揽收` }, { time: nowString(), title: '运输中', detail: '包裹已进入模拟运输' })
      order.status = deriveCOrderStatus(order.subOrders); writeCOrder(order); return true
    },
    confirmSubOrderReceipt(id: string, subOrderId: string) {
      const order = this.orders.find((item) => item.id === id)
      const sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || sub.status !== 'shipped') return false
      const nextOrder = cloneSeed(order)
      const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
      nextSub.status = 'received'; nextSub.logistics.push({ time: nowString(), title: '已确认收货', detail: '快递商品已签收' })
      nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status === 'pending').forEach((item) => { item.status = 'available' })
      nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
      const commissions = persistCommissionChanges(nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id))
      if (!commissions || !writeCOrder(nextOrder)) return false
      applyOrderSnapshot(order, nextOrder)
      this.commissionRecords = commissions
      const supplierOrder = readPlatformOrders()?.[`C-MALL-${nextSub.id}`]
      const confirmedSupplierOrder = supplierOrder ? confirmCSubOrderReceiptAtSupplier(supplierOrder) : null
      if (confirmedSupplierOrder) writePlatformOrder(confirmedSupplierOrder)
      return true
    },
    withdrawCommission() {
      const ids = new Set(this.myCommissionRecords.filter((item) => item.status === 'available').map((item) => item.id))
      if (!ids.size) return false
      this.commissionRecords = this.commissionRecords.map((item) => ids.has(item.id) ? { ...item, status: 'withdrawn' as const } : item)
      this.orders.forEach((order) => {
        if (!order.commissionAllocations.some((item) => ids.has(item.id))) return
        order.commissionAllocations.forEach((item) => { if (ids.has(item.id)) item.status = 'withdrawn' })
        writeCOrder(order)
      })
      const records = persistCommissionChanges(this.commissionRecords.filter((item) => ids.has(item.id)))
      if (!records) return false
      this.commissionRecords = records
      return true
    },
    cancelOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      if (!order || order.status !== 'pending_payment' || order.inventoryReleased) return false
      const catalog = readCatalogState()
      if (!catalog || catalog.revision !== this.inventoryRevision) return this.failStockConflict()
      const invalidItem = order.items.find((item) => {
        const product = catalog.products.find((candidate) => candidate.id === item.productId)
        const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
        return !product || !sku || !Number.isInteger(item.quantity) || item.quantity <= 0
      })
      if (invalidItem) { this.checkoutError = '订单商品规格已失效，无法释放库存'; return false }
      const nextOrder = cloneSeed(order)
      nextOrder.inventoryReleased = true; nextOrder.subOrders.forEach((sub) => { sub.status = 'cancelled'; sub.inventoryReleased = true; sub.logistics.push({ time: nowString(), title: '订单已取消', detail: '待支付订单取消，库存已释放' }) })
      nextOrder.commissionAllocations.forEach((item) => { item.status = 'reversed' }); nextOrder.status = 'cancelled'
      const operationId = `${order.id}:release`
      const inventoryChanges = nextOrder.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const payload: UserCatalogTransactionPayload = { order: nextOrder }
      if (!prepareCatalogTransaction({ id: operationId, channel: 'user', action: 'release', inventoryChanges, payload })) return false
      const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, catalog.revision)
      if (!stockResult) { abortCatalogTransaction(operationId); return this.failStockConflict() }
      this.applyCatalogState(stockResult.state)
      if (!markCatalogTransactionStockApplied(operationId)) return false
      const commissions = persistUserCatalogTransaction(payload)
      if (!commissions || !commitCatalogTransaction(operationId)) return false
      applyOrderSnapshot(order, nextOrder)
      this.commissionRecords = commissions
      return true
    },
    requestSubOrderAfterSale(id: string, subOrderId: string) {
      const order = this.orders.find((item) => item.id === id)
      const sub = order?.subOrders.find((item) => item.id === subOrderId)
      if (!order || !sub || !['paid', 'shipped', 'received'].includes(sub.status) || sub.afterSale) return false
      if (sub.status === 'paid') {
        const catalog = readCatalogState()
        if (!catalog || catalog.revision !== this.inventoryRevision) return this.failStockConflict()
        const invalidItem = sub.items.find((item) => {
          const product = catalog.products.find((candidate) => candidate.id === item.productId)
          const sku = product?.skus.find((candidate) => candidate.id === item.skuId)
          return !product || !sku || !Number.isInteger(item.quantity) || item.quantity <= 0
        })
        if (invalidItem) { this.checkoutError = '商品规格已失效，无法释放库存'; return false }
        const nextOrder = cloneSeed(order)
        const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
        nextSub.inventoryReleased = true
        nextSub.status = 'after_sale'; nextSub.afterSale = { id: createId('CAS'), reason: '演示售后', status: 'processing', createdAt: nowString() }
        const negativeRecords = nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status === 'withdrawn').map((item) => ({ ...item, id: createId('CC'), amount: -item.amount, status: 'reversed' as const, createdAt: nowString() }))
        nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status !== 'withdrawn').forEach((item) => { item.status = 'reversed' })
        nextOrder.commissionAllocations.push(...negativeRecords); nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
        const operationId = `${nextSub.id}:release`
        const inventoryChanges = nextSub.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
        const payload: UserCatalogTransactionPayload = { order: nextOrder }
        if (!prepareCatalogTransaction({ id: operationId, channel: 'user', action: 'release', inventoryChanges, payload })) return false
        const stockResult = applyCatalogStockOperation(operationId, inventoryChanges, catalog.revision)
        if (!stockResult) { abortCatalogTransaction(operationId); return this.failStockConflict() }
        this.applyCatalogState(stockResult.state)
        if (!markCatalogTransactionStockApplied(operationId)) return false
        const commissions = persistUserCatalogTransaction(payload)
        if (!commissions || !commitCatalogTransaction(operationId)) return false
        applyOrderSnapshot(order, nextOrder)
        this.commissionRecords = commissions
        const supplierOrder = readPlatformOrders()?.[`C-MALL-${nextSub.id}`]
        const afterSaleSupplierOrder = supplierOrder ? markCSubOrderAfterSaleAtSupplier(supplierOrder) : null
        if (afterSaleSupplierOrder) writePlatformOrder(afterSaleSupplierOrder)
        return true
      }
      const nextOrder = cloneSeed(order)
      const nextSub = nextOrder.subOrders.find((item) => item.id === subOrderId)!
      nextSub.status = 'after_sale'; nextSub.afterSale = { id: createId('CAS'), reason: '演示售后', status: 'processing', createdAt: nowString() }
      const negativeRecords = nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status === 'withdrawn').map((item) => ({ ...item, id: createId('CC'), amount: -item.amount, status: 'reversed' as const, createdAt: nowString() }))
      nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id && item.status !== 'withdrawn').forEach((item) => { item.status = 'reversed' })
      nextOrder.commissionAllocations.push(...negativeRecords); nextOrder.status = deriveCOrderStatus(nextOrder.subOrders)
      const commissions = persistCommissionChanges(nextOrder.commissionAllocations.filter((item) => item.subOrderId === nextSub.id))
      if (!commissions || !writeCOrder(nextOrder)) return false
      applyOrderSnapshot(order, nextOrder)
      this.commissionRecords = commissions
      const supplierOrder = readPlatformOrders()?.[`C-MALL-${nextSub.id}`]
      const afterSaleSupplierOrder = supplierOrder ? markCSubOrderAfterSaleAtSupplier(supplierOrder) : null
      if (afterSaleSupplierOrder) writePlatformOrder(afterSaleSupplierOrder)
      return true
    },
    logout() {
      this.persistSession()
      this.auth = { isLoggedIn: false, openid: '' }
      this.userId = ''
      this.cart = []
      this.orders = []
      this.addresses = []
      this.commissionRecords = []
      this.referralPromoterId = ''
      this.promoterId = ''
      this.initialized = false
    }
  }
})
