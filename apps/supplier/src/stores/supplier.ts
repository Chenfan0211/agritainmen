import { defineStore } from 'pinia'
import type { DriverAccount, MockScenario, Order, ShortageItem } from '@agritainment/shared'
import {
  SUPPLIER_DEMO_ID, acceptSupplierOrder, assignSupplierDriver, cloneSeed, confirmCourierDelivered, createId,
  deriveSupplierMetrics, demoDrivers, driverActiveTaskCounts, ensureSupplierFulfillment, findActiveDriver, findDriverByAccount,
  handoverSupplierIn, handoverSupplierOut, mergePlatformDrivers, readPlatformDrivers, readPlatformOrders,
  reassignSupplierDriver, shipSupplierCourier, validateSupplierAccount, writePlatformDrivers, writePlatformOrder
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
  auth: { isLoggedIn: boolean; role: SupplierRole | null; account: string; name: string; supplierId: string; driverId?: string }
  drivers: DriverAccount[]
  orders: Order[]
}

export const useSupplierStore = defineStore('supplier', {
  state: (): SupplierState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    loginError: '',
    auth: { isLoggedIn: false, role: null, account: '', name: '', supplierId: SUPPLIER_DEMO_ID },
    drivers: [],
    orders: []
  }),
  getters: {
    metrics: (state) => deriveSupplierMetrics(state.orders),
    activeDrivers: (state) => state.drivers.filter((driver) => driver.status === 'active'),
    driverTaskCounts: (state) => driverActiveTaskCounts(state.orders),
    supplierOrders: (state) => state.orders.filter((order) => order.channel === 'purchase' && order.supplierId === SUPPLIER_DEMO_ID),
    myTasks: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
      })
    },
    myHistory: (state) => {
      if (state.auth.role !== 'driver' || !state.auth.driverId) return []
      return state.orders.filter((order) => {
        const fulfillment = order.supplierFulfillment
        return fulfillment?.shipType === 'driver' && fulfillment.driverId === state.auth.driverId && fulfillment.status === 'received'
      })
    },
    myHandovers: (state) => {
      const mine = (operatorId?: string) => operatorId === (state.auth.driverId || state.auth.supplierId)
      return state.orders.flatMap((order) => (order.supplierFulfillment?.handovers || []).filter((item) => mine(item.operatorId)))
        .sort((a, b) => b.time.localeCompare(a.time))
    },
    allHandovers: (state) => state.orders.flatMap((order) => (order.supplierFulfillment?.handovers || []).map((item) => ({ ...item, customer: order.customer })))
      .sort((a, b) => b.time.localeCompare(a.time)),
    statusText: () => (status: string) => FULFILLMENT_STATUS_TEXT[status] || status
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        seedSupplierDataOnce()
        const drivers = mergePlatformDrivers(cloneSeed(demoDrivers), readPlatformDrivers())
        const platformOrders = readPlatformOrders()
        const orders = platformOrders
          ? Object.values(platformOrders).filter((order) => order.channel === 'purchase' && order.supplierId === SUPPLIER_DEMO_ID)
          : []
        orders.forEach((order) => { if (!order.supplierFulfillment) order.supplierFulfillment = ensureSupplierFulfillment(order) })
        orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        this.$patch({ drivers, orders, initialized: true })
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    loginSupplier(account: string, password: string) {
      if (!validateSupplierAccount(account, password)) {
        this.loginError = '账号或密码错误'
        return false
      }
      this.auth = { isLoggedIn: true, role: 'supplier', account: account.trim(), name: supplierInfo.name, supplierId: SUPPLIER_DEMO_ID }
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
    commitOrder(next: Order | null) {
      if (!next) return false
      const index = this.orders.findIndex((order) => order.id === next.id)
      if (index >= 0) this.orders[index] = next
      else this.orders.unshift(next)
      writePlatformOrder(next)
      return true
    },
    acceptOrder(id: string) {
      const order = this.orders.find((item) => item.id === id)
      return order ? this.commitOrder(acceptSupplierOrder(order, this.auth.name || supplierInfo.name)) : false
    },
    batchAcceptOrders(ids: string[]) {
      return ids.reduce((count, id) => count + (this.acceptOrder(id) ? 1 : 0), 0)
    },
    assignDriver(orderId: string, driverId: string) {
      const order = this.orders.find((item) => item.id === orderId)
      const driver = this.drivers.find((item) => item.id === driverId)
      return order && driver ? this.commitOrder(assignSupplierDriver(order, driver, this.auth.name || supplierInfo.name)) : false
    },
    reassignDriver(orderId: string, driverId: string) {
      const order = this.orders.find((item) => item.id === orderId)
      const driver = this.drivers.find((item) => item.id === driverId)
      return order && driver ? this.commitOrder(reassignSupplierDriver(order, driver, this.auth.name || supplierInfo.name)) : false
    },
    shipCourier(orderId: string, trackingNo: string) {
      const order = this.orders.find((item) => item.id === orderId)
      return order ? this.commitOrder(shipSupplierCourier(order, trackingNo, this.auth.name || supplierInfo.name)) : false
    },
    handoverOut(orderId: string, actuals: Record<string, number>, note?: string): { ok: boolean; shortages: ShortageItem[] } {
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
      const order = this.orders.find((item) => item.id === orderId)
      if (!order) return false
      return this.commitOrder(confirmCourierDelivered(order, { id: this.auth.supplierId || SUPPLIER_DEMO_ID, name: this.auth.name || supplierInfo.name, role: 'supplier' }))
    },
    addDriver(input: { name: string; phone: string; account: string; password: string }): { ok: boolean; error?: string } {
      const name = input.name.trim()
      const account = input.account.trim()
      const phone = input.phone.trim()
      if (!name || name.length > 20) return { ok: false, error: '姓名必填且不超过 20 字' }
      if (!/^1[3-9]\d{9}$/.test(phone)) return { ok: false, error: '手机号格式不正确' }
      if (!/^[a-zA-Z0-9]{4,20}$/.test(account)) return { ok: false, error: '账号需 4-20 位字母或数字' }
      if (input.password.length < 6 || input.password.length > 20) return { ok: false, error: '密码需 6-20 位' }
      if (this.drivers.some((driver) => driver.account === account)) return { ok: false, error: '账号已存在' }
      const driver: DriverAccount = {
        id: createId('D'), supplierId: SUPPLIER_DEMO_ID, name, account, password: input.password, phone,
        status: 'active', createdAt: new Date().toLocaleString('zh-CN')
      }
      this.drivers.push(driver)
      writePlatformDrivers(this.drivers)
      return { ok: true }
    },
    updateDriver(id: string, patch: { name?: string; phone?: string }) {
      const driver = this.drivers.find((item) => item.id === id)
      if (!driver) return false
      if (patch.name !== undefined && (!patch.name.trim() || patch.name.trim().length > 20)) return false
      if (patch.phone !== undefined && !/^1[3-9]\d{9}$/.test(patch.phone.trim())) return false
      if (patch.name !== undefined) driver.name = patch.name.trim()
      if (patch.phone !== undefined) driver.phone = patch.phone.trim()
      writePlatformDrivers(this.drivers)
      return true
    },
    resetDriverPassword(id: string, password: string) {
      if (password.length < 6 || password.length > 20) return false
      const driver = this.drivers.find((item) => item.id === id)
      if (!driver) return false
      driver.password = password
      writePlatformDrivers(this.drivers)
      return true
    },
    toggleDriverStatus(id: string) {
      const driver = this.drivers.find((item) => item.id === id)
      if (!driver) return false
      driver.status = driver.status === 'active' ? 'disabled' : 'active'
      writePlatformDrivers(this.drivers)
      return true
    }
  }
})
