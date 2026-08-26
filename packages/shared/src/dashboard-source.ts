import {
  afterSales,
  cProducts,
  farms,
  liveRooms,
  mergePlatformAfterSales,
  mergePlatformEntities,
  mergePlatformLives,
  mergePlatformOrders,
  mergePlatformStoreAccounts,
  migrateLegacyCatalog,
  orders,
  products,
  promoters,
  readCatalogState,
  readCOrders,
  readPlatformAfterSales,
  readPlatformBookings,
  readPlatformCommissionLedger,
  readPlatformEntities,
  readPlatformLives,
  readPlatformLivesUpdatedAt,
  readPlatformOrders,
  readPlatformPromoterAccounts,
  readPlatformStoreAccounts,
  readPlatformSupplierSettlements,
  readPlatformVoucherOrders,
  storeAccounts,
  suppliers
} from './index'
import type { DashboardDataSource } from './dashboard'

function latestTimestamp(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
}

export function createPlatformDashboardDataSource(): DashboardDataSource {
  const entities = readPlatformEntities()
  const mergedFarms = mergePlatformEntities(farms, entities?.farms)
  const mergedSuppliers = mergePlatformEntities(suppliers, entities?.suppliers)
  const publishedPromoterAccounts = readPlatformPromoterAccounts()
  const promoterEnabled = new Map(publishedPromoterAccounts?.map((account) => [account.promoterId, account.enabled]) || [])
  const mergedPromoters = promoters.map((promoter) => promoterEnabled.has(promoter.id)
    ? { ...promoter, status: promoterEnabled.get(promoter.id) ? promoter.status : 'paused' as const }
    : promoter)
  const catalog = readCatalogState() || {
    schemaVersion: 2,
    revision: 0,
    products: migrateLegacyCatalog(products, cProducts)
  }
  const mergedStoreAccounts = mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
  const cOrders = Object.values(readCOrders() || {})
  const voucherOrders = Object.values(readPlatformVoucherOrders() || {})
  const bookings = Object.values(readPlatformBookings() || {})
  const fulfillmentOrders = mergePlatformOrders(orders, readPlatformOrders())
  const mergedAfterSales = mergePlatformAfterSales(afterSales, readPlatformAfterSales())
  const supplierSettlements = Object.values(readPlatformSupplierSettlements() || {})
  const commissionLedger = Object.values(readPlatformCommissionLedger() || {})

  return {
    farms: mergedFarms,
    storeAccounts: mergedStoreAccounts,
    suppliers: mergedSuppliers,
    promoters: mergedPromoters,
    lives: mergePlatformLives(liveRooms).filter((room) => room !== null),
    catalog,
    cOrders,
    voucherOrders,
    bookings,
    fulfillmentOrders,
    afterSales: mergedAfterSales,
    supplierSettlements,
    commissionLedger,
    domainUpdatedAt: {
      farms: entities?.updatedAt,
      accounts: latestTimestamp(mergedStoreAccounts.map((account) => account.createdAt)),
      catalog: entities?.updatedAt,
      orders: latestTimestamp([
        ...cOrders.map((order) => order.createdAt),
        ...fulfillmentOrders.flatMap((order) => [order.createdAt, order.supplierFulfillment?.updatedAt])
      ]),
      bookings: latestTimestamp(bookings.flatMap((booking) => [booking.updatedAt, booking.createdAt])),
      vouchers: latestTimestamp(voucherOrders.flatMap((order) => [order.refundedAt, order.redeemedAt, order.createdAt])),
      afterSales: latestTimestamp(mergedAfterSales.flatMap((item) => item.history?.map((event) => event.time) || [])),
      lives: readPlatformLivesUpdatedAt(),
      settlements: latestTimestamp([
        ...supplierSettlements.map((record) => record.createdAt),
        ...commissionLedger.flatMap((entry) => [entry.updatedAt, entry.createdAt])
      ])
    },
    updatedAt: entities?.updatedAt
  }
}
