import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readPlatformOrders } from '@agritainment/shared'
import { useSupplierStore } from './supplier'

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

describe('supplier store interactions', () => {
  beforeEach(async () => { setActivePinia(createPinia()); localStorage.clear() })

  it('F1: logs in as supplier and active driver, rejects disabled driver and wrong password', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.loginSupplier('supplier', '123456')).toBe(true)
    expect(store.auth.role).toBe('supplier')
    store.logout()
    expect(store.loginSupplier('supplier', 'bad')).toBe(false)
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.auth.role).toBe('driver')
    store.logout()
    expect(store.loginDriver('driver01', 'bad')).toBe(false)
    expect(store.loginDriver('no-such', '123456')).toBe(false)
    store.loginSupplier('supplier', '123456')
    store.toggleDriverStatus('D002')
    store.logout()
    expect(store.loginDriver('driver02', '123456')).toBe(false)
    expect(store.loginError).toBe('账号已停用，请联系供应商')
  })

  it('F2: accepts, assigns driver, hands over with shortage, driver sees task and completes', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('supplier', '123456')
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    expect(store.acceptOrder(submitted.id)).toBe(true)
    const accepted = store.orders.find((order) => order.id === submitted.id)!
    expect(accepted.supplierFulfillment?.status).toBe('accepted')
    expect(store.assignDriver(accepted.id, 'D001')).toBe(true)
    const shipped = store.orders.find((order) => order.id === submitted.id)!
    expect(shipped.supplierFulfillment).toMatchObject({ status: 'shipped', shipType: 'driver', driverId: 'D001', driverName: '张伟' })
    const actuals: Record<string, number> = {}
    shipped.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
    actuals[shipped.items![0].skuId] = Math.max(0, shipped.items![0].quantity - 1)
    const result = store.handoverOut(shipped.id, actuals)
    expect(result.ok).toBe(true)
    expect(result.shortages.length).toBeGreaterThan(0)
    const delivering = store.orders.find((order) => order.id === submitted.id)!
    expect(delivering.supplierFulfillment?.status).toBe('delivering')
    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === submitted.id)).toBe(true)
    expect(store.handoverIn(submitted.id)).toBe(true)
    const received = store.orders.find((order) => order.id === submitted.id)!
    expect(received.supplierFulfillment?.status).toBe('received')
    expect(received.status).toBe('delivered')
    expect(store.myTasks.some((order) => order.id === submitted.id)).toBe(false)
    const persisted = readPlatformOrders()?.[submitted.id]
    expect(persisted?.status).toBe('delivered')
    expect(persisted?.supplierFulfillment?.handovers).toHaveLength(2)
  })

  it('F3: courier flow ships directly and confirms delivery', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('supplier', '123456')
    const accepted = store.orders.find((order) => order.supplierFulfillment?.status === 'accepted')!
    expect(store.shipCourier(accepted.id, '')).toBe(false)
    expect(store.shipCourier(accepted.id, 'SF-TEST-01')).toBe(true)
    const shipped = store.orders.find((order) => order.id === accepted.id)!
    expect(shipped.supplierFulfillment?.shipType).toBe('courier')
    const out = store.handoverOut(shipped.id, {})
    expect(out.ok).toBe(true)
    expect(store.markCourierDelivered(accepted.id)).toBe(true)
    expect(store.orders.find((order) => order.id === accepted.id)?.supplierFulfillment?.status).toBe('received')
  })

  it('F5: manages drivers — add, duplicate reject, reset password, reassign visibility', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('supplier', '123456')
    expect(store.addDriver({ name: '测试司机', phone: '13900001111', account: 'driver09', password: 'abc123' }).ok).toBe(true)
    expect(store.addDriver({ name: '重复', phone: '13900002222', account: 'driver09', password: 'abc123' }).error).toBe('账号已存在')
    expect(store.addDriver({ name: '坏手机', phone: '123', account: 'driver10', password: 'abc123' }).error).toContain('手机号')

    const shipped = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped' && order.supplierFulfillment?.driverId === 'D001')
    if (shipped) {
      expect(store.reassignDriver(shipped.id, 'D002')).toBe(true)
      expect(store.orders.find((order) => order.id === shipped.id)?.supplierFulfillment?.driverName).toBe('李强')
      store.logout()
      expect(store.loginDriver('driver02', '123456')).toBe(true)
      expect(store.myTasks.some((order) => order.id === shipped.id)).toBe(true)
      store.logout()
      expect(store.loginDriver('driver01', '123456')).toBe(true)
      expect(store.myTasks.some((order) => order.id === shipped.id)).toBe(false)
    }

    store.logout()
    store.loginSupplier('supplier', '123456')
    expect(store.resetDriverPassword('D001', 'newpass')).toBe(true)
    store.logout()
    expect(store.loginDriver('driver01', 'newpass')).toBe(true)
  })

  it('guards: wrong-state actions return false and batch accept counts', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('supplier', '123456')
    const submitted = store.orders.filter((order) => order.supplierFulfillment?.status === 'submitted')
    const ids = submitted.map((order) => order.id)
    expect(store.batchAcceptOrders(ids)).toBe(ids.length)
    expect(store.acceptOrder(ids[0])).toBe(false)
    const shipped = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped')
    if (shipped) expect(store.assignDriver(shipped.id, 'D001')).toBe(false)
    const another = store.orders.find((order) => order.supplierFulfillment?.status === 'shipped')
    if (another) {
      const actuals: Record<string, number> = {}
      another.items?.forEach((item) => { actuals[item.skuId] = item.quantity })
      expect(store.handoverOut(another.id, actuals).ok).toBe(true)
      expect(store.handoverOut(another.id, actuals).ok).toBe(false)
    }
  })
})
