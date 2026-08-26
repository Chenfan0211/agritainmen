import {
  farmRegionCode,
  type DashboardBooking,
  type DashboardCOrder,
  type DashboardDataDomain,
  type DashboardDataSource,
  type DashboardDemoDataset,
  type DashboardFulfillmentOrder,
  type DashboardRange,
  type DashboardVoucherOrder
} from '@agritainment/shared'

const paidOrderStates = new Set(['paid', 'shipped', 'received', 'after_sale', 'partially_shipped', 'partially_received', 'partially_after_sale'])

function timestampInRange(range: DashboardRange, index: number, total: number): string {
  const start = Date.parse(range.start)
  const end = Date.parse(range.end)
  const ratio = (index + 1) / (total + 1)
  return new Date(start + Math.max(1, end - start) * ratio).toISOString()
}

function previousRange(range: DashboardRange): DashboardRange {
  const start = Date.parse(range.start)
  const end = Date.parse(range.end)
  const duration = Math.max(1, end - start + 1)
  return {
    start: new Date(start - duration).toISOString(),
    end: new Date(start - 1).toISOString()
  }
}

function inRange(value: string, range: DashboardRange): boolean {
  const time = Date.parse(value)
  return Number.isFinite(time) && time >= Date.parse(range.start) && time <= Date.parse(range.end)
}

function currentConsumerOrders(source: DashboardDataSource, range: DashboardRange): DashboardCOrder[] {
  return source.cOrders.filter((order) => (
    !order.id.startsWith('DEMO-') && paidOrderStates.has(order.status) && Number(order.amount) > 0 && inRange(order.createdAt, range)
  ))
}

function hasCurrentConsumerOrders(source: DashboardDataSource, range: DashboardRange): boolean {
  return currentConsumerOrders(source, range).length > 0
}

function demoProduct(source: DashboardDataSource, farmId: string, index: number) {
  const products = (source.catalog?.products || []).filter((product) => product.status === 'active' && product.skus.length)
  const product = products.find((item) => item.farmIds.includes(farmId)) || products[index % Math.max(1, products.length)]
  return {
    productId: product?.id || 'DASH-SEED-PRODUCT',
    skuId: product?.skus[0]?.id || 'DASH-SEED-SKU'
  }
}

function buildConsumerOrders(source: DashboardDataSource, range: DashboardRange): DashboardCOrder[] {
  const previous = previousRange(range)
  const currentStatuses = ['paid', 'shipped', 'received', 'after_sale']
  return source.farms.flatMap((farm, index) => {
    const product = demoProduct(source, farm.id, index)
    const currentAmount = Math.max(68, Number(farm.averageSpend) || 68) * (2 + index % 4)
    const currentStatus = currentStatuses[index % currentStatuses.length]
    return [
      {
        id: `DASH-SEED-C-${farm.id}-CURRENT`, farmId: farm.id, amount: currentAmount, status: currentStatus,
        createdAt: timestampInRange(range, index, source.farms.length), items: [{ productId: product.productId, quantity: 1 + index % 5 }],
        ...(currentStatus === 'after_sale' ? { subOrders: [{ id: `DASH-SEED-SUB-${farm.id}`, amount: Math.round(currentAmount * 0.25), afterSale: { status: 'processing' } }] } : {}),
        dataOrigin: 'dashboard_demo' as const
      },
      {
        id: `DASH-SEED-C-${farm.id}-PREVIOUS`, farmId: farm.id, amount: Math.round(currentAmount * (0.76 + (index % 5) * 0.04)), status: 'received',
        createdAt: timestampInRange(previous, index, source.farms.length), items: [{ productId: product.productId, quantity: 1 + index % 4 }],
        dataOrigin: 'dashboard_demo' as const
      }
    ]
  })
}

function buildVouchers(source: DashboardDataSource, range: DashboardRange): DashboardVoucherOrder[] {
  const statuses: DashboardVoucherOrder['status'][] = ['redeemed', 'paid', 'redeemed', 'refunded']
  return source.farms.map((farm, index) => {
    const product = demoProduct(source, farm.id, index)
    const status = statuses[index % statuses.length]
    const createdAt = timestampInRange(range, index, source.farms.length)
    return {
      id: `DASH-SEED-V-${farm.id}`, userId: `DASH-SEED-USER-${index + 1}`, farmId: farm.id,
      productId: product.productId, skuId: product.skuId, quantity: 1, amount: 88 + index * 3,
      status, createdAt,
      ...(status === 'redeemed' ? { redeemedAt: createdAt } : {}),
      ...(status === 'refunded' ? { refundedAt: createdAt } : {}),
      dataOrigin: 'dashboard_demo'
    }
  })
}

function buildBookings(source: DashboardDataSource, range: DashboardRange): DashboardBooking[] {
  const farmByCity = new Map<string, DashboardDataSource['farms'][number]>()
  source.farms.forEach((farm) => {
    const code = farmRegionCode(farm)
    if (code.length >= 4 && !farmByCity.has(code.slice(0, 4))) farmByCity.set(code.slice(0, 4), farm)
  })
  const farms = [...farmByCity.values()]
  const bookings = farms.map((farm, index): DashboardBooking => {
    const createdAt = timestampInRange(range, index, farms.length + 2)
    return {
      id: `DASH-SEED-B-${farm.id}`, farmId: farm.id, farmName: farm.name, userId: `DASH-SEED-BOOKER-${index + 1}`,
      source: index % 2 ? 'farmhouse' : 'alliance', date: createdAt.slice(0, 10), session: index % 2 ? '晚餐' : '午餐',
      people: 2 + index % 7, amount: 268 + index * 31, amountConfirmedAt: createdAt,
      status: index % 3 ? 'confirmed' : 'completed', createdAt, updatedAt: createdAt, dataOrigin: 'dashboard_demo'
    }
  })
  farms.slice(0, 2).forEach((farm, index) => {
    const createdAt = timestampInRange(range, farms.length + index, farms.length + 2)
    bookings.push({
      id: `DASH-SEED-B-MISSING-${farm.id}`, farmId: farm.id, farmName: farm.name, userId: `DASH-SEED-BOOKER-MISSING-${index + 1}`,
      source: 'farmhouse', date: createdAt.slice(0, 10), session: '晚餐', people: 6 + index,
      status: 'confirmed', createdAt, updatedAt: createdAt, dataOrigin: 'dashboard_demo'
    })
  })
  return bookings
}

function buildFulfillmentOrders(source: DashboardDataSource, range: DashboardRange): DashboardFulfillmentOrder[] {
  const statuses: Array<Pick<DashboardFulfillmentOrder, 'status' | 'supplierFulfillment'>> = [
    { status: 'delivered', supplierFulfillment: { status: 'completed', updatedAt: timestampInRange(range, 0, 8) } },
    { status: 'submitted', supplierFulfillment: { status: 'submitted' } },
    { status: 'accepted', supplierFulfillment: { status: 'accepted', shortages: [{ shortage: 3, handled: false }] } },
    { status: 'cancelled', supplierFulfillment: { status: 'cancelled' } },
    { status: 'shipped', supplierFulfillment: { status: 'shipped', shipType: 'courier' } },
    { status: 'shipping', supplierFulfillment: { status: 'delivering', updatedAt: new Date(Date.parse(range.start) - 3 * 86400000).toISOString() } }
  ]
  return statuses.map((item, index) => {
    const farm = source.farms[index % source.farms.length]
    const product = demoProduct(source, farm.id, index)
    return {
      id: `DASH-SEED-F-${index + 1}`, farmId: farm.id, customer: farm.name, amount: 320 + index * 80,
      status: item.status, createdAt: index === 1 ? new Date(Date.parse(range.start) + 1000).toISOString() : timestampInRange(range, index, statuses.length),
      supplierId: source.catalog?.products.find((entry) => entry.id === product.productId)?.supplierId,
      items: [{ productId: product.productId, quantity: 4 + index }], supplierFulfillment: item.supplierFulfillment,
      dataOrigin: 'dashboard_demo'
    }
  })
}

export function supplementDashboardDataSource(source: DashboardDataSource, range: DashboardRange, now = new Date()): DashboardDataSource {
  const next: DashboardDataSource = {
    ...source,
    cOrders: [...source.cOrders], voucherOrders: [...source.voucherOrders], bookings: [...source.bookings],
    fulfillmentOrders: [...source.fulfillmentOrders], afterSales: [...source.afterSales],
    supplierSettlements: [...(source.supplierSettlements || [])], commissionLedger: [...(source.commissionLedger || [])],
    domainUpdatedAt: { ...(source.domainUpdatedAt || {}) }
  }
  const datasets: DashboardDemoDataset[] = []
  let recordCount = 0
  const addDataset = (dataset: DashboardDemoDataset, count: number, domain: DashboardDataDomain) => {
    datasets.push(dataset)
    recordCount += count
    next.domainUpdatedAt![domain] = now.toISOString()
  }

  if (!hasCurrentConsumerOrders(next, range)) {
    const records = buildConsumerOrders(next, range)
    next.cOrders.push(...records)
    addDataset('consumerOrders', records.length, 'orders')
  }
  if (!next.voucherOrders.some((order) => order.status !== 'refunded' && inRange(order.createdAt, range))) {
    const records = buildVouchers(next, range)
    next.voucherOrders.push(...records)
    addDataset('vouchers', records.length, 'vouchers')
  }
  if (!next.bookings.some((booking) => ['confirmed', 'completed'].includes(booking.status) && inRange(booking.createdAt, range))) {
    const records = buildBookings(next, range)
    next.bookings.push(...records)
    addDataset('bookings', records.length, 'bookings')
  }
  const currentOrders = currentConsumerOrders(next, range)
  const currentOrderIds = new Set(currentOrders.map((order) => order.id))
  if (!next.afterSales.some((item) => currentOrderIds.has(item.orderId))) {
    const orders = currentOrders.slice(0, 3)
    const statuses = ['processing', 'refund-pending', 'refunded'] as const
    const records = orders.map((order, index) => ({ id: `DASH-SEED-AS-${index + 1}`, orderId: order.id, status: statuses[index], amount: Math.round(order.amount * 0.2), dataOrigin: 'dashboard_demo' as const }))
    next.afterSales.push(...records)
    addDataset('afterSales', records.length, 'afterSales')
  }
  if (!next.fulfillmentOrders.some((order) => inRange(order.createdAt, range))) {
    const records = buildFulfillmentOrders(next, range)
    next.fulfillmentOrders.push(...records)
    addDataset('fulfillmentOrders', records.length, 'orders')
  }
  if (!next.supplierSettlements!.some((record) => inRange(record.createdAt, range))) {
    const orders = next.fulfillmentOrders.filter((order) => inRange(order.createdAt, range) && order.supplierId).slice(0, 3)
    const statuses = ['pending', 'settled', 'failed'] as const
    const records = orders.map((order, index) => {
      const supplier = source.suppliers.find((item) => item.id === order.supplierId)
      return {
        id: `DASH-SEED-SET-${index + 1}`, period: range.start.slice(0, 7), supplierIds: [order.supplierId!], orderIds: [order.id],
        amount: order.amount, createdAt: timestampInRange(range, index, Math.max(3, orders.length)), status: statuses[index],
        items: [{ supplierId: order.supplierId!, supplierName: supplier?.name || order.supplierId!, orderIds: [order.id], amount: order.amount }]
      }
    })
    next.supplierSettlements!.push(...records)
    addDataset('supplierSettlements', records.length, 'settlements')
  }
  if (!next.commissionLedger!.some((entry) => inRange(entry.createdAt, range))) {
    const orders = currentOrders.slice(0, 8)
    const records = orders.map((order, index) => ({
      id: `DASH-SEED-COM-${index + 1}`, sourceOrderId: order.id, beneficiaryType: index % 2 ? 'staff' as const : 'promoter' as const,
      beneficiaryId: index % 2 ? (source.storeAccounts.find((account) => account.farmId === order.farmId)?.id || `DASH-STAFF-${index}`) : (source.promoters[index % Math.max(1, source.promoters.length)]?.id || `DASH-PROMOTER-${index}`),
      farmId: order.farmId, role: index % 2 ? 'store_staff' : 'promoter', amount: Math.round(order.amount * 0.05),
      status: index % 3 ? 'pending' as const : 'settled' as const, createdAt: order.createdAt, updatedAt: order.createdAt,
      dataOrigin: 'dashboard_demo' as const
    }))
    next.commissionLedger!.push(...records)
    addDataset('commissionLedger', records.length, 'settlements')
  }

  if (datasets.length) next.demoSupplement = { enabled: true, datasets, recordCount, generatedAt: now.toISOString() }
  return next
}
