import { defineStore } from 'pinia'
import type { DriverAccount, MockScenario, Order, ShortageItem, Supplier, SupplierAccount, SupplierSettlementRecord } from '@agritainment/shared'
import {
  PLATFORM_DRIVERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, SUPPLIER_DEMO_ID, acceptSupplierOrder, assignSupplierDriver, authenticateSupplier, buildSupplierAccountSeeds, clearPlatformJson, cloneSeed, confirmCourierDelivered, createId,
  deriveSupplierMetrics, demoDrivers, driverActiveTaskCounts, ensureSupplierFulfillment, findActiveDriver, findDriverByAccount,
  handoverSupplierIn, handoverSupplierOut, markShortageHandled, mergePlatformDrivers, mergePlatformEntities, mergePlatformSupplierAccounts, readCOrders, readPlatformDrivers, readPlatformEntities, readPlatformOrders, readPlatformSupplierAccounts, readPlatformSupplierSettlements,
  reassignSupplierDriver, shipSupplierCourier, suppliers as supplierSeeds, syncCSubOrderFromSupplier, todayString, writeCOrder, writePlatformDrivers, writePlatformOrder
} from '@agritainment/shared'
import { seedSupplierDataOnce, supplierInfo } from '../services/repository'

const FULFILLMENT_STATUS_TEXT: Record<string, string> = {
  submitted: '待接单', accepted: '待发货', shipped: '待出库', delivering: '配送中', received: '已收货', cancelled: '已取消', completed: '已完成'
}

export type SupplierRole = 'supplier' | 'driver'

interface SupplierState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  loginError: string
  auth: { isLoggedIn: boolean; role: SupplierRole | null; account: string; name: string; supplierId: string; driverId?: string; credentialUpdatedAt?: string }
  suppliers: Supplier[]
  supplierAccounts: SupplierAccount[]
  drivers: DriverAccount[]
  orders: Order[]
  settlements: SupplierSettlementRecord[]
}

export const useSupplierStore = defineStore('supplier', {
  state: (): SupplierState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    loginError: '',
    auth: { isLoggedIn: false, role: null, account: '', name: '', supplierId: SUPPLIER_DEMO_ID },
    suppliers: [],
    supplierAccounts: [],
    drivers: [],
    orders: [],
    settlements: []
  }),
  getters: {
    currentSupplier: (state) => state.suppliers.find((supplier) => supplier.id === state.auth.supplierId),
    metrics: (state) => deriveSupplierMetrics(state.orders.filter((order) => order.supplierId === state.auth.supplierId)),
    todayDeliveryOrders: (state) => state.orders.filter((order) => order.supplierId === state.auth.supplierId && order.channel === 'purchase' && (() => {
      const fulfillment = order.supplierFulfillment
      if (!fulfillment) return false
      if (fulfillment.status === 'submitted' || fulfillment.status === 'accepted') return true
      return fulfillment.deliverDate === todayString() && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
    })()),
    visibleDrivers: (state) => state.drivers.filter((driver) => driver.supplierId === state.auth.supplierId),
    activeDrivers: (state) => state.drivers.filter((driver) => driver.supplierId === state.auth.supplierId && driver.status === 'active'),
    driverTaskCounts: (state) => driverActiveTaskCounts(state.orders.filter((order) => order.supplierId === state.auth.supplierId)),
    supplierOrders: (state) => state.orders.filter((order) => order.channel === 'purchase' && order.supplierId === state.auth.supplierId),
    supplierOrderCounts: (state) => state.orders
      .filter((order) => order.channel === 'purchase' && order.supplierId === state.auth.supplierId)
      .reduce<Record<string, number>>((counts, order) => {
        const status = order.supplierFulfillment?.status ?? 'submitted'
        counts['全部'] += 1
        counts[status] = (counts[status] ?? 0) + 1
        if (order.supplierFulfillment?.shortages.length) counts['缺货'] += 1
        return counts
      }, { '全部': 0, '缺货': 0 }),
    myTasks: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return order.supplierId === state.auth.supplierId && fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering') && fulfillment.deliverDate === todayString()
      })
    },
    myHistory: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return order.supplierId === state.auth.supplierId && fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && fulfillment.status === 'received'
      })
    },
    myHandovers: (state) => {
      const mine = (operatorId?: string) => operatorId === (state.auth.driverId || state.auth.supplierId)
      return state.orders.filter((order) => order.supplierId === state.auth.supplierId).flatMap((order) => (order.supplierFulfillment?.handovers || []).filter((item) => mine(item.operatorId)).map((item) => ({ ...item, customer: order.customer })))
        .sort((a, b) => b.time.localeCompare(a.time))
    },
    allHandovers: (state) => state.orders.filter((order) => order.supplierId === state.auth.supplierId).flatMap((order) => (order.supplierFulfillment?.handovers || []).map((item) => ({ ...item, customer: order.customer })))
      .sort((a, b) => b.time.localeCompare(a.time)),
    statusText: () => (status: string) => FULFILLMENT_STATUS_TEXT[status] || status,
    mySettlements: (state) => state.settlements.filter((item) => item.supplierIds.includes(state.auth.supplierId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        seedSupplierDataOnce()
        const supplierDirectory = mergePlatformEntities(cloneSeed(supplierSeeds), readPlatformEntities()?.suppliers)
        const supplierAccounts = mergePlatformSupplierAccounts(buildSupplierAccountSeeds(supplierDirectory), readPlatformSupplierAccounts())
        const drivers = mergePlatformDrivers(cloneSeed(demoDrivers), readPlatformDrivers())
        const platformOrders = readPlatformOrders()
        const orders = platformOrders
          ? Object.values(platformOrders).filter((order) => order.channel === 'purchase')
          : []
        orders.forEach((order) => {
          if (!order.supplierFulfillment) order.supplierFulfillment = ensureSupplierFulfillment(order)
          const fulfillment = order.supplierFulfillment
          if (fulfillment.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering') && !fulfillment.deliverDate) {
            fulfillment.deliverDate = todayString()
            writePlatformOrder(order)
          }
        })
        orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const settlements = Object.values(readPlatformSupplierSettlements() || {})
        this.$patch({ suppliers: supplierDirectory, supplierAccounts, drivers, orders, settlements, initialized: true })
        if (this.auth.isLoggedIn && this.auth.role === 'supplier') {
          const account = supplierAccounts.find((item) => item.supplierId === this.auth.supplierId)
          const supplier = supplierDirectory.find((item) => item.id === this.auth.supplierId)
          if (!account || !supplier || supplier.status !== 'cooperating' || account.account !== this.auth.account || account.updatedAt !== this.auth.credentialUpdatedAt) this.logout()
          else this.auth.name = supplier.name
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    async refreshSharedState() {
      await this.initialize(true)
    },
    loginSupplier(account: string, password: string) {
      const result = authenticateSupplier(this.supplierAccounts, this.suppliers, account, password)
      if (!result.ok) {
        this.loginError = result.reason === 'inactive' ? '账号暂不可登录，请联系平台管理员' : '账号或密码错误'
        return false
      }
      this.auth = {
        isLoggedIn: true,
        role: 'supplier',
        account: result.account.account,
        name: result.supplier.name,
        supplierId: result.supplier.id,
        credentialUpdatedAt: result.account.updatedAt
      }
      this.loginError = ''
      return true
    },
    loginDriver(account: string, password: string) {
      const driver = findDriverByAccount(this.drivers, account)
      if (driver && driver.status === 'disabled') {
        this.loginError = '账号已停用，请联系供应商'
        return false
      }
      const active = findActiveDriver(this.drivers, account, password)
      if (!active) {
        this.loginError = '账号或密码错误'
        return false
      }
      this.auth = { isLoggedIn: true, role: 'driver', account: active.account, name: active.name, supplierId: active.supplierId, driverId: active.id }
      this.loginError = ''
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, role: null, account: '', name: '', supplierId: SUPPLIER_DEMO_ID }
      this.loginError = ''
    },
    markShortageHandled(orderId: string, skuId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      return order ? this.commitOrder(markShortageHandled(order, skuId, this.auth.name || supplierInfo.name)) : false
    },
    async resetDemoData() {
      clearPlatformJson(PLATFORM_ORDERS_STORAGE_KEY)
      clearPlatformJson(PLATFORM_DRIVERS_STORAGE_KEY)
      await this.initialize(true)
    },
    commitOrder(next: Order | null) {
      if (!next) return false
      if (next.supplierId && next.supplierId !== this.auth.supplierId) return false
      const index = this.orders.findIndex((order) => order.id === next.id)
      if (index >= 0) this.orders[index] = next
      else this.orders.unshift(next)
      writePlatformOrder(next)
      const link = next.supplierOrderLink
      if (link?.source === 'c-mall' && link.sourceOrderId && link.sourceSubOrderId) {
        const cOrder = readCOrders()?.[link.sourceOrderId]
        const subOrder = cOrder?.subOrders.find((item) => item.id === link.sourceSubOrderId)
        if (cOrder && subOrder) writeCOrder(syncCSubOrderFromSupplier(cOrder, subOrder, next))
      }
      return true
    },
    acceptOrder(id: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === id)
      return order ? this.commitOrder(acceptSupplierOrder(order, this.auth.name || supplierInfo.name)) : false
    },
    batchAcceptOrders(ids: string[]) {
      if (this.auth.role !== 'supplier') return 0
      return ids.reduce((count, id) => count + (this.acceptOrder(id) ? 1 : 0), 0)
    },
    assignDriver(orderId: string, driverId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      const driver = this.drivers.find((item) => item.id === driverId && item.supplierId === this.auth.supplierId)
      return order && driver ? this.commitOrder(assignSupplierDriver(order, driver, this.auth.name || supplierInfo.name)) : false
    },
    reassignDriver(orderId: string, driverId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      const driver = this.drivers.find((item) => item.id === driverId && item.supplierId === this.auth.supplierId)
      return order && driver ? this.commitOrder(reassignSupplierDriver(order, driver, this.auth.name || supplierInfo.name)) : false
    },
    shipCourier(orderId: string, trackingNo: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      return order ? this.commitOrder(shipSupplierCourier(order, trackingNo, this.auth.name || supplierInfo.name)) : false
    },
    handoverOut(orderId: string, actuals: Record<string, number>, note?: string): { ok: boolean; shortages: ShortageItem[] } {
      if (this.auth.role !== 'supplier') return { ok: false, shortages: [] }
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return { ok: false, shortages: [] }
      const next = handoverSupplierOut(order, actuals, { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' }, note)
      if (!next) return { ok: false, shortages: [] }
      this.commitOrder(next)
      return { ok: true, shortages: next.supplierFulfillment?.shortages || [] }
    },
    handoverIn(orderId: string, note?: string) {
      const order = this.orders.find((item) => item.id === orderId)
      if (!order || this.auth.role !== 'driver' || !this.auth.driverId) return false
      return this.commitOrder(handoverSupplierIn(order, { id: this.auth.driverId, name: this.auth.name, role: 'driver' }, note))
    },
    markCourierDelivered(orderId: string) {
      if (this.auth.role !== 'supplier') return false
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return false
      return this.commitOrder(confirmCourierDelivered(order, { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' }))
    },
    addDriver(input: { name: string; phone: string; account: string; password: string }): { ok: boolean; error?: string } {
      if (this.auth.role !== 'supplier') return { ok: false, error: '无权管理司机' }
      const name = input.name.trim()
      const account = input.account.trim()
      const phone = input.phone.trim()
      if (!name || name.length > 20) return { ok: false, error: '姓名必填且不超过 20 字' }
      if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, error: '手机号格式不正确' }
      if (!/^[a-zA-Z0-9]{4,20}$/.test(account)) return { ok: false, error: '账号需 4-20 位字母或数字' }
      if (input.password.length < 6 || input.password.length > 20) return { ok: false, error: '密码需 6-20 位' }
      if (this.drivers.some((driver) => driver.account === account)) return { ok: false, error: '账号已存在' }
      const driver: DriverAccount = {
        id: createId('D'), supplierId: this.auth.supplierId, name, account, password: input.password, phone,
        status: 'active', createdAt: new Date().toISOString()
      }
      this.drivers.push(driver)
      writePlatformDrivers(this.drivers)
      return { ok: true }
    },
    updateDriver(id: string, patch: { name?: string; phone?: string }) {
      if (this.auth.role !== 'supplier') return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      if (patch.name !== undefined && (!patch.name.trim() || patch.name.trim().length > 20)) return false
      if (patch.phone !== undefined && !/^1[3-9]\d{9}$/.test(patch.phone.trim())) return false
      if (patch.name !== undefined) driver.name = patch.name.trim()
      if (patch.phone !== undefined) driver.phone = patch.phone.trim()
      writePlatformDrivers(this.drivers)
      return true
    },
    resetDriverPassword(id: string, password: string) {
      if (this.auth.role !== 'supplier') return false
      if (password.length < 6 || password.length > 20) return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      driver.password = password
      writePlatformDrivers(this.drivers)
      return true
    },
    toggleDriverStatus(id: string) {
      if (this.auth.role !== 'supplier') return false
      const driver = this.drivers.find((item) => item.id === id && item.supplierId === this.auth.supplierId)
      if (!driver) return false
      driver.status = driver.status === 'active' ? 'disabled' : 'active'
      writePlatformDrivers(this.drivers)
      return true
    }
  }
})
