import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readPlatformDrivers, readPlatformOrders, todayString, writePlatformDrivers, writePlatformOrder } from '@agritainment/shared'
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

  it('loads C-mall fulfillment orders and isolates them by supplier account', async () => {
    writePlatformOrder({ id: 'C-MALL-CSO-A', productName: '腊肉', quantity: 1, amount: 45, customer: '甲 · C端商城', channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S002', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-A', sourceSubOrderId: 'CSO-A', customerUserId: 'U-A' } })
    writePlatformOrder({ id: 'C-MALL-CSO-B', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城', channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-B', sourceSubOrderId: 'CSO-B', customerUserId: 'U-B' } })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.orders.some((item) => item.id === 'C-MALL-CSO-A')).toBe(true)
    expect(store.orders.some((item) => item.id === 'C-MALL-CSO-B')).toBe(true)
    expect(store.loginSupplier('supplier', '123456')).toBe(true)
    expect(store.supplierOrders.every((item) => item.supplierId === 'S002')).toBe(true)
    expect(store.loginSupplier('supplier04', '123456')).toBe(true)
    expect(store.supplierOrders).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'C-MALL-CSO-B', supplierId: 'S004' })]))
    expect(store.supplierOrders.some((item) => item.supplierId === 'S002')).toBe(false)
  })

  it('allows only the owning supplier role to operate and locks after-sale orders', async () => {
    writePlatformOrder({ id: 'C-MALL-GUARD', productName: '腊肉', quantity: 1, amount: 45, customer: '甲 · C端商城', channel: 'purchase', status: 'after-sale', createdAt: new Date().toISOString(), supplierId: 'S002', supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-GUARD', sourceSubOrderId: 'CSO-GUARD', customerUserId: 'U-A' }, supplierFulfillment: { status: 'cancelled', shipType: 'courier', shortages: [], handovers: [], updatedAt: new Date().toISOString() } })
    const store = useSupplierStore()
    await store.initialize(true)
    const submitted = store.orders.find((order) => order.supplierId === 'S002' && order.supplierFulfillment?.status === 'submitted')!
    expect(store.acceptOrder(submitted.id)).toBe(false)
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.acceptOrder(submitted.id)).toBe(false)
    store.logout()
    expect(store.loginSupplier('supplier04', '123456')).toBe(true)
    expect(store.acceptOrder(submitted.id)).toBe(false)
    store.logout()
    expect(store.loginSupplier('supplier', '123456')).toBe(true)
    expect(store.acceptOrder('C-MALL-GUARD')).toBe(false)
    expect(store.shipCourier('C-MALL-GUARD', 'SF-GUARD')).toBe(false)
    expect(store.markCourierDelivered('C-MALL-GUARD')).toBe(false)
  })

  it('isolates visible drivers and task counts by the current supplier', async () => {
    writePlatformDrivers([{
      id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456',
      phone: '13900004004', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'S004-DRIVER-TASK', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城',
      channel: 'purchase', status: 'shipping', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierFulfillment: {
        status: 'shipped', shipType: 'driver', driverId: 'D-S004', driverName: '炎陵司机',
        deliverDate: todayString(), shortages: [], handovers: [], updatedAt: new Date().toISOString()
      }
    })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('supplier04', '123456')).toBe(true)

    expect(store.visibleDrivers.map((driver) => driver.id)).toEqual(['D-S004'])
    expect(store.activeDrivers.map((driver) => driver.id)).toEqual(['D-S004'])
    expect(store.driverTaskCounts).toEqual({ 'D-S004': 1 })
  })

  it('allows suppliers to manage only their own drivers and assigns new drivers to the current supplier', async () => {
    writePlatformDrivers([{
      id: 'D-S004', supplierId: 'S004', name: '炎陵司机', account: 'driver04', password: '123456',
      phone: '13900004004', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'S004-ASSIGN-GUARD', productName: '黄桃', quantity: 1, amount: 45, customer: '乙 · C端商城',
      channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierFulfillment: { status: 'accepted', shortages: [], handovers: [], updatedAt: new Date().toISOString() }
    })
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.loginSupplier('supplier04', '123456')).toBe(true)

    expect(store.updateDriver('D001', { name: '越权修改' })).toBe(false)
    expect(store.resetDriverPassword('D001', 'newpass')).toBe(false)
    expect(store.toggleDriverStatus('D001')).toBe(false)
    expect(store.assignDriver('S004-ASSIGN-GUARD', 'D001')).toBe(false)
    expect(store.addDriver({ name: '新增司机', phone: '13900004005', account: 'driver05', password: '123456' }).ok).toBe(true)

    const persisted = readPlatformDrivers() || []
    expect(persisted.find((driver) => driver.account === 'driver05')?.supplierId).toBe('S004')
    expect(persisted.find((driver) => driver.id === 'D001')?.name).toBe('张伟')

    store.logout()
    expect(store.updateDriver('D-S004', { name: '未登录修改' })).toBe(false)
    expect(store.resetDriverPassword('D-S004', 'another')).toBe(false)
    expect(store.toggleDriverStatus('D-S004')).toBe(false)
    expect(store.addDriver({ name: '未登录司机', phone: '13900004006', account: 'driver06', password: '123456' }).ok).toBe(false)

    expect(store.loginDriver('driver04', '123456')).toBe(true)
    expect(store.updateDriver('D-S004', { name: '司机越权修改' })).toBe(false)
    expect(store.resetDriverPassword('D-S004', 'driverpass')).toBe(false)
    expect(store.toggleDriverStatus('D-S004')).toBe(false)
    expect(store.addDriver({ name: '司机新增账号', phone: '13900004008', account: 'driver08', password: '123456' }).ok).toBe(false)
  })

  it('refreshes drivers and orders written by another H5 page', async () => {
    const store = useSupplierStore()
    await store.initialize(true)
    expect(store.orders.some((order) => order.id === 'C-MALL-EXTERNAL')).toBe(false)
    expect(store.drivers.some((driver) => driver.id === 'D-EXTERNAL')).toBe(false)

    writePlatformDrivers([...(readPlatformDrivers() || []), {
      id: 'D-EXTERNAL', supplierId: 'S004', name: '外部司机', account: 'external04', password: '123456',
      phone: '13900004007', status: 'active', createdAt: new Date().toISOString()
    }])
    writePlatformOrder({
      id: 'C-MALL-EXTERNAL', productName: '黄桃', quantity: 1, amount: 45, customer: '外部用户 · C端商城',
      channel: 'purchase', status: 'pending', createdAt: new Date().toISOString(), supplierId: 'S004',
      supplierOrderLink: { source: 'c-mall', sourceOrderId: 'CO-EXTERNAL', sourceSubOrderId: 'CSO-EXTERNAL', customerUserId: 'U-EXTERNAL' }
    })

    await store.refreshSharedState()

    expect(store.orders.some((order) => order.id === 'C-MALL-EXTERNAL')).toBe(true)
    expect(store.drivers.some((driver) => driver.id === 'D-EXTERNAL')).toBe(true)
  })

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

  it('filters myTasks by deliverDate, marks shortage handled, and resets demo data', async () => {
    const store = useSupplierStore()
    await store.initialize()
    expect(store.metrics.shortageOrderCount).toBe(2)
    store.loginSupplier('supplier', '123456')

    // accept + assign an order -> deliverDate today
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    store.acceptOrder(submitted.id)
    store.assignDriver(submitted.id, 'D001')

    // mark the seeded shortage (SO-S007, driver D003) as handled and persist
    const shortOrder = store.orders.find((order) => (order.supplierFulfillment?.shortages.length || 0) > 0)!
    const sku = shortOrder.supplierFulfillment!.shortages[0].skuId
    expect(store.markShortageHandled(shortOrder.id, sku)).toBe(true)
    expect(readPlatformOrders()?.[shortOrder.id]?.supplierFulfillment?.shortages[0].handled).toBe(true)

    // driver03 sees SO-S007 today (deliverDate = today)
    store.logout()
    expect(store.loginDriver('driver03', '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === shortOrder.id)).toBe(true)

    // a task dated in the past is excluded from today tasks
    store.logout()
    store.loginSupplier('supplier', '123456')
    const assigned = store.orders.find((order) => order.supplierFulfillment?.driverId === 'D001')!
    assigned.supplierFulfillment!.deliverDate = '2000-01-01'
    store.logout()
    store.loginDriver('driver01', '123456')
    expect(store.myTasks.some((order) => order.id === assigned.id)).toBe(false)

    // reset demo data -> shortage unhandled again, 3 drivers
    store.logout()
    store.loginSupplier('supplier', '123456')
    await store.resetDemoData()
    const resetShort = store.orders.find((order) => (order.supplierFulfillment?.shortages.length || 0) > 0)!
    expect(resetShort.supplierFulfillment?.shortages[0].handled).toBeFalsy()
    expect(store.drivers.length).toBe(3)
  })

  it('backfills missing driver deliverDate and includes the store on my handovers', async () => {
    const store = useSupplierStore()
    await store.initialize()

    const legacy = store.orders.find((order) => {
      const fulfillment = order.supplierFulfillment
      return fulfillment?.shipType === 'driver' && (fulfillment.status === 'shipped' || fulfillment.status === 'delivering')
    })!
    const persistedLegacy = JSON.parse(JSON.stringify(legacy)) as typeof legacy
    delete persistedLegacy.supplierFulfillment!.deliverDate
    writePlatformOrder(persistedLegacy)

    await store.initialize(true)

    expect(store.orders.find((order) => order.id === legacy.id)?.supplierFulfillment?.deliverDate).toBe(todayString())
    expect(readPlatformOrders()?.[legacy.id]?.supplierFulfillment?.deliverDate).toBe(todayString())
    const legacyDriver = store.drivers.find((driver) => driver.id === legacy.supplierFulfillment?.driverId)!
    expect(store.loginDriver(legacyDriver.account, '123456')).toBe(true)
    expect(store.myTasks.some((order) => order.id === legacy.id)).toBe(true)

    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    const handoverOrder = store.orders.find((order) => order.supplierFulfillment?.handovers.some((item) => item.operatorId === 'D001'))!
    expect(store.myHandovers.find((item) => item.orderId === handoverOrder.id)).toMatchObject({ customer: handoverOrder.customer })
  })

  it('backfills only missing dates for active driver shipments and is idempotent', async () => {
    const store = useSupplierStore()
    await store.initialize()
    const source = store.orders.find((order) => order.supplierFulfillment?.shipType === 'driver' && order.supplierFulfillment.status === 'shipped')!
    const clone = (id: string, fulfillment: Partial<NonNullable<typeof source.supplierFulfillment>>) => ({
      ...JSON.parse(JSON.stringify(source)),
      id,
      supplierFulfillment: { ...source.supplierFulfillment, ...fulfillment }
    }) as typeof source

    writePlatformOrder(clone('LEGACY-SHIPPED', { deliverDate: undefined }))
    writePlatformOrder(clone('LEGACY-DELIVERING', { status: 'delivering', deliverDate: undefined }))
    writePlatformOrder(clone('DATED-SHIPPED', { deliverDate: '2000-01-01' }))
    writePlatformOrder(clone('COURIER-SHIPPED', { shipType: 'courier', deliverDate: undefined }))
    writePlatformOrder(clone('RECEIVED-DRIVER', { status: 'received', deliverDate: undefined }))

    await store.initialize(true)

    const firstSnapshot = readPlatformOrders()!
    expect(firstSnapshot['LEGACY-SHIPPED'].supplierFulfillment?.deliverDate).toBe(todayString())
    expect(firstSnapshot['LEGACY-DELIVERING'].supplierFulfillment?.deliverDate).toBe(todayString())
    expect(firstSnapshot['DATED-SHIPPED'].supplierFulfillment?.deliverDate).toBe('2000-01-01')
    expect(firstSnapshot['COURIER-SHIPPED'].supplierFulfillment?.deliverDate).toBeUndefined()
    expect(firstSnapshot['RECEIVED-DRIVER'].supplierFulfillment?.deliverDate).toBeUndefined()

    await store.initialize(true)

    expect(JSON.stringify(readPlatformOrders())).toBe(JSON.stringify(firstSnapshot))
  })

  it('seeds incrementally: missing demo orders/drivers merged without overwriting existing data', async () => {
    const store = useSupplierStore()
    await store.initialize()
    store.loginSupplier('supplier', '123456')

    // progress one order (submitted -> accepted) so it diverges from seed
    const submitted = store.orders.find((order) => order.supplierFulfillment?.status === 'submitted')!
    store.acceptOrder(submitted.id)
    const acceptedId = submitted.id
    expect(readPlatformOrders()?.[acceptedId]?.supplierFulfillment?.status).toBe('accepted')

    // re-seed (simulates next launch): must NOT overwrite the progressed order, and merges missing demo data
    await store.initialize(true)
    store.loginSupplier('supplier', '123456')
    expect(readPlatformOrders()?.[acceptedId]?.supplierFulfillment?.status).toBe('accepted')
    expect(store.orders.length).toBeGreaterThanOrEqual(18)
    expect(store.drivers.length).toBe(3)

    // driver03 王芳: today task SO-S007 + history SO-S016
    store.logout()
    expect(store.loginDriver('driver03', '123456')).toBe(true)
    expect(store.myTasks.some((o) => o.id === 'SO-S007')).toBe(true)
    expect(store.myHistory.some((o) => o.id === 'SO-S016')).toBe(true)

    // driver01 张伟: >=3 today tasks + history SO-S017
    store.logout()
    expect(store.loginDriver('driver01', '123456')).toBe(true)
    expect(store.myTasks.length).toBeGreaterThanOrEqual(3)
    expect(store.myHistory.some((o) => o.id === 'SO-S017')).toBe(true)
  })

})
