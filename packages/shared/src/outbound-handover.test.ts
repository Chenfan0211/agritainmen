import { describe, expect, it } from 'vitest'
import type { DailyDeliveryRoute, Order, OrderItem } from './index'
import {
  aggregateRouteOutboundItems,
  createAbnormalWarehouseCheckIn,
  completeRouteStopHandover,
  createRouteOutboundHandover,
  dispatchRouteOutbound,
  rejectRouteOutboundHandover,
  reorderRouteStops,
  reviewRouteOutboundHandover,
  saveRouteOutboundShortages,
  validateWarehouseCheckIn
} from './index'

const ORIGIN = { longitude: 109.8, latitude: 28.6 }
const NOW = '2026-09-15T08:00:00.000Z'

function item(productId: string, skuId: string, name: string, skuName: string, quantity: number): OrderItem {
  return { productId, skuId, name, skuName, image: `/images/${productId}.png`, quantity, price: 10 }
}

function order(id: string, storeId: string, createdAt: string, items: OrderItem[], status: 'shipped' | 'delivering' | 'received' = 'shipped'): Order {
  return {
    id,
    productName: items.map((line) => line.name).join('、'),
    quantity: items.reduce((sum, line) => sum + line.quantity, 0),
    amount: 0,
    customer: storeId,
    storeId,
    channel: 'purchase',
    status: 'shipping',
    createdAt,
    supplierId: 'S1',
    items,
    supplierFulfillment: {
      status,
      shipType: 'driver',
      driverId: 'D1',
      driverName: '张伟',
      deliverDate: '2026-09-15',
      shortages: [],
      handovers: [],
      updatedAt: NOW
    }
  }
}

function route(orders: Order[], options: { checkedIn?: boolean; secondCheckIn?: boolean } = {}): DailyDeliveryRoute {
  const storeIds = [...new Set(orders.map((entry) => entry.storeId!))]
  const stops = storeIds.map((storeId) => ({
    storeId,
    storeName: storeId,
    address: `${storeId} address`,
    longitude: ORIGIN.longitude,
    latitude: ORIGIN.latitude,
    orderIds: orders.filter((entry) => entry.storeId === storeId).map((entry) => entry.id),
    ...(options.checkedIn && storeId === storeIds[0] ? { checkIn: { at: NOW, longitude: ORIGIN.longitude, latitude: ORIGIN.latitude, distanceM: 1 } } : {}),
    ...(options.secondCheckIn && storeId === storeIds[1] ? { checkIn: { at: NOW, longitude: ORIGIN.longitude, latitude: ORIGIN.latitude, distanceM: 1 } } : {})
  }))
  return {
    id: 'ROUTE-1',
    supplierId: 'S1',
    driverId: 'D1',
    deliveryDate: '2026-09-15',
    status: 'published',
    stops,
    totalDistanceKm: 12,
    estimatedDurationMinutes: 60,
    sourceOrderIds: orders.map((entry) => entry.id),
    provider: 'test',
    origin: ORIGIN,
    stopCount: stops.length,
    ...(options.checkedIn ? { warehouseCheckIn: { at: NOW, longitude: ORIGIN.longitude, latitude: ORIGIN.latitude, distanceM: 1 } } : {}),
    generatedAt: NOW,
    publishedAt: NOW
  }
}

const operator = { id: 'D1', name: '张伟', role: 'driver' as const }

describe('route outbound handover domain', () => {
  it('creates abnormal warehouse check-ins with required reason rules', () => {
    expect(createAbnormalWarehouseCheckIn('device_issue', '', undefined, NOW)).toMatchObject({
      type: 'abnormal', reasonCode: 'device_issue', at: NOW
    })
    expect(createAbnormalWarehouseCheckIn('other', '', undefined, NOW)).toBeNull()
    expect(createAbnormalWarehouseCheckIn('other', '仓点坐标错误', ORIGIN, NOW)).toMatchObject({
      type: 'abnormal', reasonCode: 'other', reasonNote: '仓点坐标错误', longitude: ORIGIN.longitude, latitude: ORIGIN.latitude
    })
  })

  it('validates warehouse check-in against the configured origin', () => {
    expect(validateWarehouseCheckIn(ORIGIN, ORIGIN)).toMatchObject({ ok: true, distanceM: 0 })
    expect(validateWarehouseCheckIn(undefined, ORIGIN)).toMatchObject({ ok: false, code: 'warehouse_coordinates_missing' })
    expect(validateWarehouseCheckIn(ORIGIN, { longitude: 110.8, latitude: 28.6 })).toMatchObject({ ok: false, code: 'too_far' })
  })

  it('aggregates route products by SKU with image and specification metadata', () => {
    const orders = [
      order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 4)]),
      order('O2', 'STORE-2', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 3), item('P2', 'SKU-2', '腊肉', '1kg', 2)])
    ]
    expect(aggregateRouteOutboundItems(orders)).toEqual([
      expect.objectContaining({ skuId: 'SKU-1', name: '土蜂蜜', skuName: '500g', image: '/images/P1.png', expected: 7, driverActual: 7 }),
      expect.objectContaining({ skuId: 'SKU-2', name: '腊肉', skuName: '1kg', expected: 2, driverActual: 2 })
    ])
  })

  it('records driver actuals, then locks the supplier-reviewed values', () => {
    const orders = [order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 5)])]
    const submitted = createRouteOutboundHandover(route(orders, { checkedIn: true }), orders, operator, { actuals: { 'SKU-1': 4 }, proofImages: ['proof-1'], note: '少一件' }, NOW)
    expect(submitted?.outboundHandover).toMatchObject({
      status: 'pending_supplier',
      driverId: 'D1',
      driverName: '张伟',
      driverNote: '少一件',
      proofImages: ['proof-1'],
      items: [expect.objectContaining({ expected: 5, driverActual: 4 })]
    })
    const rejected = rejectRouteOutboundHandover(submitted!, '凭证不清晰', { id: 'S1', name: '供应商', role: 'supplier' }, '2026-09-15T08:02:00.000Z')
    expect(rejected?.outboundHandover).toMatchObject({
      status: 'rejected',
      rejectionReason: '凭证不清晰',
      items: [expect.objectContaining({ driverActual: 4 })],
      reviewHistory: [expect.objectContaining({ action: 'rejected' })]
    })
    const resubmitted = createRouteOutboundHandover(rejected!, orders, operator, { actuals: { 'SKU-1': 4 }, proofImages: ['proof-2'], note: '已补充' }, '2026-09-15T08:04:00.000Z')
    expect(resubmitted?.outboundHandover).toMatchObject({
      status: 'pending_supplier',
      proofImages: ['proof-2'],
      reviewHistory: [expect.objectContaining({ action: 'rejected' })]
    })
    const reviewed = reviewRouteOutboundHandover(resubmitted!, { actuals: { 'SKU-1': 3 }, note: '复核' }, { id: 'S1', name: '供应商', role: 'supplier' }, '2026-09-15T08:05:00.000Z')
    expect(reviewed?.outboundHandover).toMatchObject({
      status: 'pending_dispatch',
      supplierNote: '复核',
      items: [expect.objectContaining({ driverActual: 4, supplierActual: 3 })],
      reviewHistory: [expect.objectContaining({ action: 'rejected' }), expect.objectContaining({ action: 'confirmed' })]
    })
    expect(reviewRouteOutboundHandover(reviewed!, { actuals: { 'SKU-1': 2 } }, { id: 'S1', name: '供应商', role: 'supplier' }, NOW)).toBeNull()
  })

  it('requires exact store allocations and dispatches every route order to delivering', () => {
    const orders = [
      order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 5)]),
      order('O2', 'STORE-2', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 5)])
    ]
    const submitted = createRouteOutboundHandover(route(orders, { checkedIn: true }), orders, operator, { actuals: { 'SKU-1': 7 }, proofImages: ['proof-7'] }, NOW)!
    const reviewed = reviewRouteOutboundHandover(submitted, { actuals: { 'SKU-1': 7 } }, { id: 'S1', name: '供应商', role: 'supplier' }, '2026-09-15T08:05:00.000Z')!
    expect(saveRouteOutboundShortages(reviewed, orders, [{ skuId: 'SKU-1', storeId: 'STORE-1', quantity: 1 }])).toBeNull()
    const allocated = saveRouteOutboundShortages(reviewed, orders, [
      { skuId: 'SKU-1', storeId: 'STORE-1', quantity: 1 },
      { skuId: 'SKU-1', storeId: 'STORE-2', quantity: 2 }
    ])!
    const dispatched = dispatchRouteOutbound(allocated, orders, operator, '2026-09-15T08:10:00.000Z')!
    expect(dispatched.route.outboundHandover?.status).toBe('dispatched')
    expect(dispatched.orders.map((entry) => entry.supplierFulfillment?.status)).toEqual(['delivering', 'delivering'])
    expect(dispatched.orders.flatMap((entry) => entry.supplierFulfillment?.shortages || []).map((entry) => entry.shortage)).toEqual([1, 2])
  })

  it('splits a store shortage across its orders from oldest to newest', () => {
    const orders = [
      order('O-NEW', 'STORE-1', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 4)]),
      order('O-OLD', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 3)])
    ]
    const submitted = createRouteOutboundHandover(route(orders, { checkedIn: true }), orders, operator, { actuals: { 'SKU-1': 5 }, proofImages: ['proof-5'] }, NOW)!
    const reviewed = reviewRouteOutboundHandover(submitted, { actuals: { 'SKU-1': 5 } }, { id: 'S1', name: '供应商', role: 'supplier' }, NOW)!
    const allocated = saveRouteOutboundShortages(reviewed, orders, [{ skuId: 'SKU-1', storeId: 'STORE-1', quantity: 2 }])!
    const dispatched = dispatchRouteOutbound(allocated, orders, operator, NOW)!
    expect(dispatched.orders.find((entry) => entry.id === 'O-OLD')?.supplierFulfillment?.shortages[0]?.shortage).toBe(2)
    expect(dispatched.orders.find((entry) => entry.id === 'O-NEW')?.supplierFulfillment?.shortages).toEqual([])
  })

  it('requires proof images and preserves shortage notes', () => {
    const orders = [order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 5)])]
    const base = route(orders, { checkedIn: true })
    expect(createRouteOutboundHandover(base, orders, operator, { actuals: { 'SKU-1': 4 }, proofImages: [] }, NOW)).toBeNull()
    const submitted = createRouteOutboundHandover(base, orders, operator, { actuals: { 'SKU-1': 4 }, proofImages: ['proof'] }, NOW)!
    const reviewed = reviewRouteOutboundHandover(submitted, { actuals: { 'SKU-1': 4 } }, { id: 'S1', name: '供应商', role: 'supplier' }, NOW)!
    const allocated = saveRouteOutboundShortages(reviewed, orders, [{ skuId: 'SKU-1', storeId: 'STORE-1', quantity: 1, note: '包装破损' }])!
    expect(allocated.outboundHandover?.shortageAllocations).toEqual([{ skuId: 'SKU-1', storeId: 'STORE-1', quantity: 1, note: '包装破损' }])
  })

  it('keeps completed stops fixed while reordering unfinished stops', () => {
    const orders = [
      order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)]),
      order('O2', 'STORE-2', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)]),
      order('O3', 'STORE-3', '2026-09-15T03:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)])
    ]
    const base = route(orders, { checkedIn: true })
    base.stops[0] = { ...base.stops[0], completedOrderIds: ['O1'], completedAt: NOW }
    expect(reorderRouteStops(base, ['STORE-2', 'STORE-1', 'STORE-3'])).toBeNull()
    expect(reorderRouteStops(base, ['STORE-1', 'STORE-3', 'STORE-2'])?.stops.map((stop) => stop.storeId)).toEqual(['STORE-1', 'STORE-3', 'STORE-2'])
  })

  it('reorders route stops and recalculates map distance, duration and polyline', () => {
    const orders = [
      order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)]),
      order('O2', 'STORE-2', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)])
    ]
    const base = route(orders, { checkedIn: true })
    base.stops[1] = { ...base.stops[1], longitude: 109.9, latitude: 28.7 }
    const reordered = reorderRouteStops(base, ['STORE-2', 'STORE-1'])
    expect(reordered?.stops.map((stop) => stop.storeId)).toEqual(['STORE-2', 'STORE-1'])
    expect(reordered?.segments).toHaveLength(2)
    expect(reordered?.totalDistanceKm).toBeGreaterThan(0)
    expect(reordered?.estimatedDurationMinutes).toBeGreaterThan(0)
    expect(reordered?.polyline).toHaveLength(3)
    expect(reorderRouteStops(base, ['STORE-2'])).toBeNull()
  })

  it('completes a route only after every store has handed over', () => {
    const orders = [
      order('O1', 'STORE-1', '2026-09-15T01:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)], 'delivering'),
      order('O2', 'STORE-2', '2026-09-15T02:00:00.000Z', [item('P1', 'SKU-1', '土蜂蜜', '500g', 1)], 'delivering')
    ]
    const base = route(orders, { checkedIn: true, secondCheckIn: true })
    const first = completeRouteStopHandover({ ...base, outboundHandover: { status: 'dispatched', items: [], driverId: 'D1', driverName: '张伟', driverSubmittedAt: NOW, proofImages: ['proof'], shortageAllocations: [], dispatchedAt: NOW } }, orders, 'STORE-1', operator, NOW)!
    expect(first.route.status).toBe('published')
    const second = completeRouteStopHandover(first.route, first.orders, 'STORE-2', operator, NOW)!
    expect(second.route.status).toBe('completed')
    expect(second.orders.every((entry) => entry.supplierFulfillment?.status === 'received')).toBe(true)
  })
})
