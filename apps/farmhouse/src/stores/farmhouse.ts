import { defineStore } from 'pinia'
import type { AfterSale, BalanceEntry, Booking, BusinessMediaValue, CommissionLedgerEntry, FarmExperience, CAddress, CatalogProduct, CatalogState, FarmStore, Member, MockScenario, Order, PlatformJournalEntry, Product, PromotionRecord, Role, ShareRecord, SharedBooking, StoreAccount, StoreCatalogSelection, StorefrontOrder, TenantConfig, UserBinding, VoucherOrder } from '@agritainment/shared'
import { ensureStoreCatalogSelectionDefaults } from '@agritainment/shared'
import { initialCatalogOrderQuantity } from '@agritainment/shared'
import { abortCatalogTransaction, allocateStoreCatalogCommission, applyCatalogStockOperation, applyPlatformMedia, buildPortalUrl, buildSupplierPlatformOrders, calcCartTotal, catalogProductToProduct, catalogProductToStoreProduct, catalogProductsForAudience, clearPlatformJson, cloneSeed, commitCatalogTransaction, createId, createStrictSnapshotRecoveryHandlerRegistration, enqueuePlatformRecovery, initializePlatformRecoveryHandlers, isExpressDeliverable, mediaValueToImage, markCatalogTransactionStockApplied, members, mergeEntitySeeds, mergePersistedDefaults, mergePlatformExperiences, mergePlatformStoreAccounts, normalizeMinimumOrderQuantity, prepareCatalogTransaction, promoters, readCatalogState, readCatalogTransactionJournal, readPendingCatalogTransactions, readPlatformAfterSales, readPlatformBookings, readPlatformCollectionRevision, readPlatformCommissionLedger, readPlatformJournal, readPlatformJson, readPlatformOrders, readPlatformStoreAccounts, readPlatformVoucherOrders, readShareConfig, readShareRecords, readStoreCatalogSelectionState, readUserBindings, reconcilePendingPlatformTransactions, resolveCatalogTransactionForRecovery, resolvePlatformJournal, resolveShare, resolveUserIdByOpenid, resolveUserIdentity, round2, runLockedPlatformTransaction, saveStoreCatalogSelection, simulateWechatLogin, storeAccounts, suppliers, updateCatalogStock, upsertUserBinding, validateCatalogSkuOrderQuantity, writeCatalogState, writeUserBindings, writePlatformJson, writePlatformVoucherOrders, readPlatformExperiences, writePlatformExperience, removePlatformExperience, writePlatformAfterSales, writePlatformBooking, writePlatformCommissionLedger, writePlatformOrder, writePlatformOrders, writePlatformStoreAccounts, writeShareRecord, writeShareRecords, PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY } from '@agritainment/shared'
import { resolveRuntimeTenant } from '../config/tenant'
import { farmhouseRepository } from '../services/repository'

interface CartLine {
  productId: string
  skuId: string
  skuName: string
  name: string
  image: BusinessMediaValue
  price: number
  stock: number
  quantity: number
  minimumOrderQuantity: number
  unavailable?: boolean
}

interface FarmhouseTransactionPayload {
  order?: StorefrontOrder
  memberBalance?: number
  memberPoints?: number
  balanceEntry?: BalanceEntry
  platformOrder?: Order
  platformOrders?: Order[]
  shareRecords?: ShareRecord[]
  userBinding?: UserBinding
}

function buildOrderShareReversals(orderId: string, records: ShareRecord[] = readShareRecords() || []): ShareRecord[] {
  const reversals: ShareRecord[] = []
  records.filter((record) => record.orderId === orderId && record.status !== 'reversed').forEach((record) => {
    if (record.settled) {
      const correctionId = `${record.id}:reverse`
      if (!records.some((candidate) => candidate.id === correctionId)) {
        reversals.push({ ...record, id: correctionId, amount: -record.amount, status: 'pending', settled: false, createdAt: new Date().toLocaleString('zh-CN') })
      }
    } else {
      reversals.push({ ...record, status: 'reversed' })
    }
  })
  return reversals
}

function applyFarmhouseTransactionSideEffects(payload: FarmhouseTransactionPayload): boolean {
  const originalOrders = cloneSeed(readPlatformOrders() || {})
  const originalBindings = cloneSeed(readUserBindings() || {})
  const originalShares = cloneSeed(readShareRecords() || [])
  const orders = [...new Map([...((payload.platformOrders || [])), ...(payload.platformOrder ? [payload.platformOrder] : [])].map((order) => [order.id, order])).values()]
  const ok = orders.every((order) => writePlatformOrder(order)) && (!payload.userBinding || upsertUserBinding(payload.userBinding)) && (!payload.shareRecords || payload.shareRecords.every((record) => writeShareRecord(record)))
  if (ok) return true
  writePlatformOrders(originalOrders)
  writeUserBindings(originalBindings)
  writeShareRecords(originalShares)
  return false
}

const FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY = 'farmhouse-commerce-recovery-v1'
const FARMHOUSE_COMMERCE_RECOVERY_SCHEMA = 'farmhouse-commerce-snapshot-v1'
const FARMHOUSE_COMMERCE_STORAGE_KEY = 'agritainment-platform-farmhouse-commerce'
type FarmhouseCommerceVariant = 'checkout' | 'cancel' | 'voucher' | 'after-sale-request-refund' | 'after-sale-request-return' | 'after-sale-refund' | 'after-sale-return'
interface FarmhouseLocalSnapshot { orders: StorefrontOrder[]; memberBalance: number; memberPoints: number; balanceEntries: BalanceEntry[] }
type FarmhouseLocalState = Record<string, FarmhouseLocalSnapshot>
interface FarmhouseCommerceSnapshot {
  variant: FarmhouseCommerceVariant
  farmId: string
  vouchers?: Record<string, VoucherOrder>
  ledger?: Record<string, CommissionLedgerEntry>
  localState?: FarmhouseLocalState
  catalog?: CatalogState
  afterSales?: Record<string, AfterSale> | null
  shares?: ShareRecord[]
  platformOrders?: Record<string, Order>
  bindings?: Record<string, UserBinding>
  storeAccounts?: StoreAccount[]
  localBaseline?: FarmhouseLocalSnapshot
}
interface StableFarmhouseSnapshot { snapshot: FarmhouseCommerceSnapshot; revisions: Record<string, number> }

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function sameCollections(actual: string[], expected: string[]): boolean { return actual.length === expected.length && expected.every((key) => actual.includes(key)) }
function farmhouseCollections(variant: FarmhouseCommerceVariant): string[] {
  if (variant === 'checkout') return [FARMHOUSE_COMMERCE_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_BINDINGS_STORAGE_KEY, PLATFORM_STORE_ACCOUNTS_STORAGE_KEY]
  if (variant === 'cancel') return [FARMHOUSE_COMMERCE_STORAGE_KEY, PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY]
  if (variant === 'voucher') return [PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY]
  if (variant === 'after-sale-request-refund' || variant === 'after-sale-request-return') return [FARMHOUSE_COMMERCE_STORAGE_KEY, PLATFORM_AFTERSALES_STORAGE_KEY]
  return [FARMHOUSE_COMMERCE_STORAGE_KEY, ...(variant === 'after-sale-return' ? [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY] : []), PLATFORM_AFTERSALES_STORAGE_KEY, PLATFORM_SHARES_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY]
}
function farmhouseSnapshotKeys(variant: FarmhouseCommerceVariant): string[] {
  if (variant === 'checkout') return ['variant', 'farmId', 'localState', 'catalog', 'platformOrders', 'shares', 'bindings', 'storeAccounts']
  if (variant === 'cancel') return ['variant', 'farmId', 'localState', 'catalog', 'platformOrders', 'shares']
  if (variant === 'voucher') return ['variant', 'farmId', 'vouchers', 'ledger']
  if (variant === 'after-sale-request-refund' || variant === 'after-sale-request-return') return ['variant', 'farmId', 'localState', 'afterSales']
  return ['variant', 'farmId', 'localState', ...(variant === 'after-sale-return' ? ['catalog'] : []), 'afterSales', 'shares', 'platformOrders']
}
function isFarmhouseLocalSnapshot(value: unknown): value is FarmhouseLocalSnapshot {
  return isRecord(value) && Array.isArray(value.orders) && Number.isFinite(value.memberBalance) && Number.isFinite(value.memberPoints) && Array.isArray(value.balanceEntries)
}
function isFarmhouseCommerceSnapshot(value: unknown): value is FarmhouseCommerceSnapshot {
  if (!isRecord(value) || !['checkout', 'cancel', 'voucher', 'after-sale-request-refund', 'after-sale-request-return', 'after-sale-refund', 'after-sale-return'].includes(String(value.variant)) || typeof value.farmId !== 'string' || !value.farmId.trim()) return false
  const variant = value.variant as FarmhouseCommerceVariant
  const expectedKeys = farmhouseSnapshotKeys(variant)
  const keys = Object.keys(value)
  if (!sameCollections(keys, expectedKeys) && !(variant === 'checkout' && sameCollections(keys, [...expectedKeys, 'localBaseline']) && isFarmhouseLocalSnapshot(value.localBaseline))) return false
  if (variant === 'voucher') return isRecord(value.vouchers) && isRecord(value.ledger)
  if (variant === 'cancel') return isRecord(value.localState) && isRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision) && isRecord(value.platformOrders) && Array.isArray(value.shares)
  if (variant === 'checkout') return isRecord(value.localState) && isRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision)
    && isRecord(value.platformOrders) && Array.isArray(value.shares) && isRecord(value.bindings) && Array.isArray(value.storeAccounts)
  if (!isRecord(value.localState) || !(value.afterSales === null || isRecord(value.afterSales))) return false
  if (variant === 'after-sale-request-refund' || variant === 'after-sale-request-return') return true
  if (!Array.isArray(value.shares) || !isRecord(value.platformOrders)) return false
  return variant !== 'after-sale-return' || (isRecord(value.catalog) && Array.isArray(value.catalog.products) && Number.isInteger(value.catalog.revision))
}
function changedKeys(original: Record<string, unknown>, target: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(original), ...Object.keys(target)])].filter((key) => JSON.stringify(original[key]) !== JSON.stringify(target[key]))
}
function hasUniqueIds(records: Array<{ id: string }>): boolean {
  return records.every((record) => typeof record?.id === 'string' && !!record.id.trim()) && new Set(records.map((record) => record.id)).size === records.length
}
function farmhouseCatalogDeltaMatches(original: CatalogState, target: CatalogState, expected: Map<string, number>, operationId: string, action: 'reserve' | 'release' = 'release'): boolean {
  if (target.schemaVersion !== original.schemaVersion || target.revision !== original.revision + 1 || target.products.length !== original.products.length) return false
  const targetProducts = new Map(target.products.map((product) => [product.id, product]))
  for (const product of original.products) {
    const nextProduct = targetProducts.get(product.id)
    if (!nextProduct || nextProduct.skus.length !== product.skus.length) return false
    const { skus: _beforeSkus, ...beforeProduct } = product
    const { skus: _afterSkus, ...afterProduct } = nextProduct
    if (JSON.stringify(beforeProduct) !== JSON.stringify(afterProduct)) return false
    const nextSkus = new Map(nextProduct.skus.map((sku) => [sku.id, sku]))
    for (const sku of product.skus) {
      const nextSku = nextSkus.get(sku.id)
      if (!nextSku) return false
      const { stock: beforeStock, ...beforeSku } = sku
      const { stock: afterStock, ...afterSku } = nextSku
      if (JSON.stringify(beforeSku) !== JSON.stringify(afterSku) || afterStock - beforeStock !== (expected.get(`${product.id}:${sku.id}`) || 0)) return false
    }
  }
  const beforeOps = original.appliedOperations || {}
  const afterOps = target.appliedOperations || {}
  if (changedKeys(beforeOps, afterOps).some((id) => id !== operationId)) return false
  const operation = afterOps[operationId]
  if (!operation || operation.action !== action) return false
  try {
    const fingerprint = JSON.parse(operation.requestFingerprint) as { action?: string; changes?: Array<{ productId: string; skuId: string; quantity: number }> }
    const fingerprintChanges = new Map<string, number>()
    for (const change of fingerprint.changes || []) fingerprintChanges.set(`${change.productId}:${change.skuId}`, (fingerprintChanges.get(`${change.productId}:${change.skuId}`) || 0) + change.quantity)
    return fingerprint.action === action && JSON.stringify([...fingerprintChanges.entries()].sort()) === JSON.stringify([...expected.entries()].sort())
  } catch {
    return false
  }
}
function shareChangesAreValidReversals(original: ShareRecord[], target: ShareRecord[], orderId: string): boolean {
  if (!hasUniqueIds(original) || !hasUniqueIds(target)) return false
  const before = new Map(original.map((record) => [record.id, record]))
  const after = new Map(target.map((record) => [record.id, record]))
  const sameBeneficiary = (left: ShareRecord, right: ShareRecord) => left.userId === right.userId && left.orderId === right.orderId
    && left.orderAmount === right.orderAmount && left.role === right.role && left.promoterId === right.promoterId
    && left.staffAccountId === right.staffAccountId && left.rate === right.rate
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id)
    const next = after.get(id)
    if (JSON.stringify(previous) === JSON.stringify(next)) continue
    if (!next || next.orderId !== orderId) return false
    if (previous) {
      if (previous.settled || next.settled || previous.status === 'reversed' || !sameBeneficiary(previous, next) || previous.amount !== next.amount || previous.createdAt !== next.createdAt || next.status !== 'reversed') return false
      continue
    }
    const reversalOf = id.endsWith(':reverse') ? before.get(id.slice(0, -':reverse'.length)) : undefined
    if (!reversalOf?.settled || reversalOf.orderId !== orderId || !sameBeneficiary(reversalOf, next) || next.amount !== -reversalOf.amount || next.status !== 'pending' || next.settled) return false
  }
  return true
}
function checkoutShareMatchesOrder(share: ShareRecord, order: StorefrontOrder, original: FarmhouseCommerceSnapshot, target: FarmhouseCommerceSnapshot): boolean {
  const customerUserId = order.customerUserId
  if (!customerUserId || share.userId !== customerUserId || share.id !== `SR-${order.id}` || share.orderId !== order.id || round2(share.orderAmount) !== round2(order.amount)
    || share.status !== 'pending' || !!share.settled || !Number.isFinite(share.rate) || !Number.isFinite(share.amount)) return false
  const binding = target.bindings?.[customerUserId]
  const previousBinding = original.bindings?.[customerUserId]
  if (binding && (!previousBinding || binding.promoterId !== previousBinding.promoterId || binding.staffAccountId !== previousBinding.staffAccountId)) return false
  const promoterId = binding?.promoterId
  const staffAccountId = binding?.staffAccountId || (!promoterId
    ? original.storeAccounts?.find((account) => account.farmId === original.farmId && account.role === 'owner' && account.enabled)?.id
    : undefined)
  const allocation = allocateStoreCatalogCommission(order.items.map((item) => {
    const product = original.catalog?.products.find((candidate) => candidate.id === item.productId)
    return {
      unitPrice: item.price,
      quantity: item.quantity,
      promoterCommissionRate: product?.promoterCommissionRate ?? 0,
      storeCommissionRate: product?.storeCommissionRate ?? 0
    }
  }), promoterId ? { type: 'promoter', beneficiaryId: promoterId } : staffAccountId && binding?.staffAccountId ? { type: 'staff', beneficiaryId: staffAccountId } : null, staffAccountId || '')
  if (!allocation || allocation.amount <= 0) return false
  return share.role === (allocation.beneficiaryType === 'promoter' ? 'promoter' : 'staff')
    && round2(share.rate) === round2(allocation.amount / order.amount * 100)
    && round2(share.amount) === round2(allocation.amount)
    && (allocation.beneficiaryType === 'promoter'
      ? share.promoterId === allocation.beneficiaryId && !share.staffAccountId
      : share.staffAccountId === allocation.beneficiaryId && !share.promoterId)
}
function isFarmhouseCommerceJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY || journal.recoverySchema !== FARMHOUSE_COMMERCE_RECOVERY_SCHEMA || !isFarmhouseCommerceSnapshot(journal.original) || !isFarmhouseCommerceSnapshot(journal.target)) return false
  const original = journal.original
  const target = journal.target
  const businessCollections = journal.collections.filter((key) => key !== PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && key !== PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  if (original.variant !== target.variant || original.farmId !== target.farmId || !sameCollections(businessCollections, farmhouseCollections(original.variant))) return false
  if (original.variant === 'voucher') {
    const voucherIds = changedKeys(original.vouchers!, target.vouchers!)
    if (!voucherIds.length || !voucherIds.every((id) => (!original.vouchers![id] || original.vouchers![id].farmId === original.farmId) && (!target.vouchers![id] || target.vouchers![id].farmId === original.farmId))) return false
    if (voucherIds.length !== 1) return false
    const voucherId = voucherIds[0]
    const nextVoucher = target.vouchers![voucherId]
    const action = nextVoucher?.status === 'redeemed' ? 'redeem' : nextVoucher?.status === 'refunded' ? 'refund' : ''
    if (!action || journal.operationId !== `farmhouse-voucher:${voucherId}:${action}`) return false
    return changedKeys(original.ledger!, target.ledger!).every((id) => {
      const before = original.ledger![id]
      const after = target.ledger![id]
      const voucher = target.vouchers![after?.sourceOrderId] || original.vouchers![after?.sourceOrderId]
      const stableFinance = !!before && !!after && before.sourceOrderId === after.sourceOrderId && before.beneficiaryType === after.beneficiaryType
        && before.beneficiaryId === after.beneficiaryId && before.farmId === after.farmId && before.role === after.role && before.amount === after.amount && before.createdAt === after.createdAt
      const allowedStatus = action === 'redeem'
        ? before?.status === 'pending' && after?.status === 'available'
        : !!before && ['pending', 'available'].includes(before.status) && after?.status === 'reversed'
      return stableFinance && allowedStatus && voucherIds.includes(after!.sourceOrderId) && id === `${after!.sourceOrderId}:commission` && voucher?.farmId === original.farmId
        && (!after!.farmId || after!.farmId === original.farmId) && after!.beneficiaryType === 'promoter'
        && (!voucher.promoterId || voucher.promoterId === after!.beneficiaryId)
    })
  }
  if (original.variant === 'checkout') {
    if (JSON.stringify(original.storeAccounts) !== JSON.stringify(target.storeAccounts)
      || JSON.stringify(original.storeAccounts) !== JSON.stringify(mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts()))) return false
    if (JSON.stringify(original.localBaseline) !== JSON.stringify(target.localBaseline)) return false
    const currentBindings = readUserBindings() || {}
    if (JSON.stringify(currentBindings) !== JSON.stringify(original.bindings) && JSON.stringify(currentBindings) !== JSON.stringify(target.bindings)) return false
    if (!hasUniqueIds(original.shares!) || !hasUniqueIds(target.shares!)) return false
    if (changedKeys(original.localState!, target.localState!).some((farmId) => farmId !== original.farmId)) return false
    const beforeLocal = original.localState![original.farmId] || original.localBaseline
    const afterLocal = target.localState![original.farmId]
    if (!beforeLocal || !afterLocal || !Array.isArray(afterLocal.orders) || !Array.isArray(afterLocal.balanceEntries)) return false
    const beforeOrders = new Map((beforeLocal?.orders || []).map((order) => [order.id, order]))
    const addedOrders = afterLocal.orders.filter((order) => !beforeOrders.has(order.id))
    if (addedOrders.length !== 1 || afterLocal.orders.length !== beforeOrders.size + 1 || [...beforeOrders].some(([id, order]) => JSON.stringify(afterLocal.orders.find((candidate) => candidate.id === id)) !== JSON.stringify(order))) return false
    const order = addedOrders[0]
    if (journal.operationId !== `${order.id}:checkout` || order.status !== '待发货' || order.afterSaleType || order.inventoryReleased || order.balanceRefunded) return false
    const itemAmount = round2(order.items.reduce((sum, item) => sum + item.price * item.quantity, 0))
    if (!order.items.length || order.items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0) || itemAmount !== round2(order.amount) || order.itemCount !== order.items.reduce((sum, item) => sum + item.quantity, 0)) return false
    const addedEntries = afterLocal.balanceEntries.filter((entry) => !(beforeLocal?.balanceEntries || []).some((candidate) => candidate.id === entry.id))
    if (addedEntries.length !== 1 || addedEntries[0].id !== `${order.id}:consume` || addedEntries[0].type !== 'consume' || round2(addedEntries[0].amount) !== round2(-order.amount) || round2(addedEntries[0].balance) !== round2(afterLocal.memberBalance)) return false
    if ((beforeLocal?.balanceEntries || []).some((entry) => JSON.stringify(afterLocal.balanceEntries.find((candidate) => candidate.id === entry.id)) !== JSON.stringify(entry))) return false
    if (beforeLocal && (round2(afterLocal.memberBalance) !== round2(beforeLocal.memberBalance - order.amount) || afterLocal.memberPoints !== beforeLocal.memberPoints + (order.pointsAwarded || 0))) return false
    const expectedStock = new Map<string, number>()
    order.items.forEach((item) => expectedStock.set(`${item.productId}:${item.skuId}`, (expectedStock.get(`${item.productId}:${item.skuId}`) || 0) - item.quantity))
    if (!farmhouseCatalogDeltaMatches(original.catalog!, target.catalog!, expectedStock, journal.operationId, 'reserve')) return false
    const linkedOrderIds = new Set(order.platformOrderIds?.length ? order.platformOrderIds : order.platformOrderId ? [order.platformOrderId] : [])
    const changedPlatformOrderIds = changedKeys(original.platformOrders!, target.platformOrders!)
    if (changedPlatformOrderIds.length !== linkedOrderIds.size || changedPlatformOrderIds.some((id) => {
      const platformOrder = target.platformOrders![id]
      return !linkedOrderIds.has(id) || !!original.platformOrders![id] || platformOrder?.storeId !== original.farmId
    })) return false
    const changedShareIds = changedKeys(Object.fromEntries(original.shares!.map((share) => [share.id, share])), Object.fromEntries(target.shares!.map((share) => [share.id, share])))
    if (changedShareIds.length > 1 || changedShareIds.some((id) => {
      const share = target.shares!.find((record) => record.id === id)
      return !!original.shares!.find((record) => record.id === id) || id !== `SR-${order.id}` || share?.orderId !== order.id || round2(share.orderAmount) !== round2(order.amount) || share.status !== 'pending' || !!share.settled
    })) return false
    const changedBindingIds = changedKeys(original.bindings!, target.bindings!)
    if (changedBindingIds.length > 1 || changedBindingIds.some((userId) => {
      const before = original.bindings![userId]
      const after = target.bindings![userId]
      const sameOwner = !!before && before.promoterId === after?.promoterId && before.staffAccountId === after?.staffAccountId
      return userId !== order.customerUserId || !before || !after || before.status !== 'pending' || after.userId !== userId || after.status !== 'bound' || !sameOwner
    })) return false
    const expectedShare = checkoutShareMatchesOrder
    const customerBinding = target.bindings?.[order.customerUserId || '']
    const originalCustomerBinding = original.bindings?.[order.customerUserId || '']
    const expectedOwnerId = original.storeAccounts?.find((account) => account.farmId === original.farmId && account.role === 'owner' && account.enabled)?.id
    const expectedAllocation = allocateStoreCatalogCommission(order.items.map((item) => {
      const product = original.catalog!.products.find((candidate) => candidate.id === item.productId)
      return { unitPrice: item.price, quantity: item.quantity, promoterCommissionRate: product?.promoterCommissionRate ?? 0, storeCommissionRate: product?.storeCommissionRate ?? 0 }
    }), customerBinding?.promoterId ? { type: 'promoter' as const, beneficiaryId: customerBinding.promoterId } : customerBinding?.staffAccountId ? { type: 'staff' as const, beneficiaryId: customerBinding.staffAccountId } : null, customerBinding?.staffAccountId || expectedOwnerId || '')
    const share = changedShareIds.length ? target.shares!.find((record) => record.id === changedShareIds[0]) : undefined
    if (originalCustomerBinding?.status === 'pending' && changedBindingIds.length !== 1) return false
    if ((expectedAllocation?.amount || 0) > 0 ? !share || !expectedShare(share, order, original, target) : !!share) return false
    const binding = share ? target.bindings![share.userId] : undefined
    if (binding && ((share?.promoterId && binding.promoterId !== share.promoterId) || (share?.staffAccountId && binding.staffAccountId !== share.staffAccountId))) return false
    return true
  }
  if (original.variant === 'cancel') {
    if (changedKeys(original.localState!, target.localState!).some((farmId) => farmId !== original.farmId) || !target.localState![original.farmId]) return false
    const beforeLocal = original.localState![original.farmId]
    const afterLocal = target.localState![original.farmId]
    if (!beforeLocal || !afterLocal || !Array.isArray(afterLocal.orders) || !Array.isArray(afterLocal.balanceEntries)) return false
    const changedOrders = afterLocal.orders.filter((order) => JSON.stringify(beforeLocal.orders.find((candidate) => candidate.id === order.id)) !== JSON.stringify(order))
    if (changedOrders.length !== 1) return false
    const afterOrder = changedOrders[0]
    const beforeOrder = beforeLocal.orders.find((order) => order.id === afterOrder.id)
    if (!beforeOrder || journal.operationId !== `${beforeOrder.id}:release` || beforeOrder.status !== '待发货' || beforeOrder.inventoryReleased || beforeOrder.balanceRefunded
      || afterOrder.status !== '已取消' || !afterOrder.inventoryReleased || !afterOrder.balanceRefunded) return false
    const { status: _beforeStatus, inventoryReleased: _beforeReleased, balanceRefunded: _beforeRefunded, ...beforeStable } = beforeOrder
    const { status: _afterStatus, inventoryReleased: _afterReleased, balanceRefunded: _afterRefunded, ...afterStable } = afterOrder
    if (JSON.stringify(beforeStable) !== JSON.stringify(afterStable)) return false
    const refund = afterLocal.balanceEntries.find((entry) => entry.id === `${beforeOrder.id}:refund`)
    if (!refund || refund.type !== 'refund' || round2(refund.amount) !== round2(beforeOrder.amount) || round2(refund.balance) !== round2(afterLocal.memberBalance)
      || round2(afterLocal.memberBalance) !== round2(beforeLocal.memberBalance + beforeOrder.amount)
      || afterLocal.memberPoints !== Math.max(0, beforeLocal.memberPoints - (beforeOrder.pointsAwarded || 0))) return false
    const expectedStock = new Map<string, number>()
    beforeOrder.items.forEach((item) => expectedStock.set(`${item.productId}:${item.skuId}`, (expectedStock.get(`${item.productId}:${item.skuId}`) || 0) + item.quantity))
    if (!farmhouseCatalogDeltaMatches(original.catalog!, target.catalog!, expectedStock, journal.operationId, 'release')) return false
    if (!shareChangesAreValidReversals(original.shares!, target.shares!, beforeOrder.id)) return false
    const linkedIds = new Set(beforeOrder.platformOrderIds?.length ? beforeOrder.platformOrderIds : beforeOrder.platformOrderId ? [beforeOrder.platformOrderId] : [])
    return changedKeys(original.platformOrders!, target.platformOrders!).every((id) => linkedIds.has(id) && original.platformOrders![id]?.storeId === original.farmId && target.platformOrders![id]?.status === 'paid-cancelled')
  }
  if (changedKeys(original.localState!, target.localState!).some((farmId) => farmId !== original.farmId) || !target.localState![original.farmId]) return false
  const beforeLocal = original.localState![original.farmId]
  const afterLocal = target.localState![original.farmId]
  if (!afterLocal || !Array.isArray(afterLocal.orders) || !Array.isArray(afterLocal.balanceEntries)) return false
  const beforeOrders = new Map((beforeLocal?.orders || []).map((order) => [order.id, order]))
  const afterOrders = new Map(afterLocal.orders.map((order) => [order.id, order]))
  const changedOrderIds = [...new Set([...beforeOrders.keys(), ...afterOrders.keys()])].filter((id) => JSON.stringify(beforeOrders.get(id)) !== JSON.stringify(afterOrders.get(id)))
  if (changedOrderIds.length !== 1) return false
  const orderId = changedOrderIds[0]
  const beforeOrder = beforeOrders.get(orderId)
  const afterOrder = afterOrders.get(orderId)
  if (!beforeOrder || !afterOrder) return false
  const changedOrderSet = new Set(changedOrderIds)
  const changedAfterSales = changedKeys(original.afterSales || {}, target.afterSales || {})
  if (changedAfterSales.some((id) => !changedOrderSet.has((target.afterSales || {})[id]?.orderId || (original.afterSales || {})[id]?.orderId))) return false
  const requestType = original.variant === 'after-sale-request-refund' ? 'refund' : original.variant === 'after-sale-request-return' ? 'return' : null
  if (requestType) {
    const { status: _beforeStatus, afterSaleType: _beforeType, ...beforeStable } = beforeOrder
    const { status: _afterStatus, afterSaleType: _afterType, ...afterStable } = afterOrder
    const workId = changedAfterSales.length === 1 ? changedAfterSales[0] : ''
    const work = (target.afterSales || {})[workId]
    return journal.operationId === `${orderId}:after-sale-request-${requestType}`
      && beforeLocal.memberBalance === afterLocal.memberBalance && beforeLocal.memberPoints === afterLocal.memberPoints
      && JSON.stringify(beforeLocal.balanceEntries) === JSON.stringify(afterLocal.balanceEntries)
      && JSON.stringify(beforeStable) === JSON.stringify(afterStable)
      && beforeOrder.status === '已完成' && !beforeOrder.afterSaleType && !beforeOrder.balanceRefunded && !beforeOrder.inventoryReleased && !(original.afterSales || {})[workId]
      && afterOrder.afterSaleType === requestType && afterOrder.status === (requestType === 'refund' ? '退款中' : '退货中')
      && !!work && work.orderId === orderId && work.type === requestType && work.status === 'processing'
  }
  if (journal.operationId !== `${orderId}:${original.variant}` || changedAfterSales.length !== 1) return false
  const beforeWork = (original.afterSales || {})[changedAfterSales[0]]
  const afterWork = (target.afterSales || {})[changedAfterSales[0]]
  if (!beforeWork || !afterWork || beforeWork.orderId !== orderId || afterWork.orderId !== orderId || beforeWork.status !== 'processing' || afterWork.status !== 'refunded' || beforeWork.type !== afterWork.type) return false
  if (!shareChangesAreValidReversals(original.shares!, target.shares!, orderId)) return false
  const linkedPlatformOrderIds = new Set<string>()
  changedOrderIds.forEach((id) => {
    const order = afterOrders.get(id) || beforeOrders.get(id)
    const ids = order?.platformOrderIds?.length ? order.platformOrderIds : order?.platformOrderId ? [order.platformOrderId] : []
    ids.forEach((platformOrderId) => linkedPlatformOrderIds.add(platformOrderId))
  })
  if (!changedKeys(original.platformOrders!, target.platformOrders!).every((id) => {
    const before = original.platformOrders![id]
    const after = target.platformOrders![id]
    return linkedPlatformOrderIds.has(id) && before?.storeId === original.farmId && after?.storeId === original.farmId
  })) return false
  if (original.variant !== 'after-sale-return') return true
  const expected = new Map<string, number>()
  changedOrderIds.forEach((id) => {
    const before = beforeOrders.get(id)
    const after = afterOrders.get(id)
    if (!before?.inventoryReleased && after?.inventoryReleased && after.afterSaleType === 'return') {
      after.items.forEach((item) => expected.set(`${item.productId}:${item.skuId}`, (expected.get(`${item.productId}:${item.skuId}`) || 0) + item.quantity))
    }
  })
  return expected.size > 0 && !!original.catalog && !!target.catalog && farmhouseCatalogDeltaMatches(original.catalog, target.catalog, expected, journal.operationId)
}
function stableFarmhouseRead<T>(key: string, reader: () => T): { data: T; revision: number } | null {
  const before = readPlatformCollectionRevision(key)
  const data = cloneSeed(reader())
  const after = readPlatformCollectionRevision(key)
  return before === after ? { data, revision: after } : null
}
function readFarmhouseLocalState(): FarmhouseLocalState {
  const value = readPlatformJson<FarmhouseLocalState>(FARMHOUSE_COMMERCE_STORAGE_KEY)
  return isRecord(value) ? cloneSeed(value as FarmhouseLocalState) : {}
}
function writeFarmhouseLocalState(value: FarmhouseLocalState): boolean {
  if (Object.keys(value).length) return writePlatformJson(FARMHOUSE_COMMERCE_STORAGE_KEY, value)
  const existed = readPlatformJson<unknown>(FARMHOUSE_COMMERCE_STORAGE_KEY) !== null
  clearPlatformJson(FARMHOUSE_COMMERCE_STORAGE_KEY)
  return existed && Object.keys(readFarmhouseLocalState()).length === 0
}
function readStableFarmhouseSnapshot(variant: FarmhouseCommerceVariant, farmId: string): StableFarmhouseSnapshot | null {
  const requestVariant = variant === 'after-sale-request-refund' || variant === 'after-sale-request-return'
  const reads: Array<[string, () => unknown]> = variant === 'voucher'
    ? [[PLATFORM_VOUCHERS_STORAGE_KEY, () => readPlatformVoucherOrders() || {}], [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, () => readPlatformCommissionLedger() || {}]]
    : variant === 'checkout'
      ? [[FARMHOUSE_COMMERCE_STORAGE_KEY, readFarmhouseLocalState], [PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()], [PLATFORM_ORDERS_STORAGE_KEY, () => readPlatformOrders() || {}], [PLATFORM_SHARES_STORAGE_KEY, () => readShareRecords() || []], [PLATFORM_BINDINGS_STORAGE_KEY, () => readUserBindings() || {}], [PLATFORM_STORE_ACCOUNTS_STORAGE_KEY, () => mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())]]
    : variant === 'cancel'
      ? [[FARMHOUSE_COMMERCE_STORAGE_KEY, readFarmhouseLocalState], [PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()], [PLATFORM_ORDERS_STORAGE_KEY, () => readPlatformOrders() || {}], [PLATFORM_SHARES_STORAGE_KEY, () => readShareRecords() || []]]
    : [[FARMHOUSE_COMMERCE_STORAGE_KEY, readFarmhouseLocalState], ...(variant === 'after-sale-return' ? [[PLATFORM_CATALOG_STORAGE_KEY, () => readCatalogState()] as [string, () => unknown]] : []), [PLATFORM_AFTERSALES_STORAGE_KEY, () => readPlatformAfterSales()], ...(requestVariant ? [] : [[PLATFORM_SHARES_STORAGE_KEY, () => readShareRecords() || []] as [string, () => unknown], [PLATFORM_ORDERS_STORAGE_KEY, () => readPlatformOrders() || {}] as [string, () => unknown]])]
  if (variant === 'checkout' || variant === 'after-sale-return') reads.push([PLATFORM_CATALOG_TRANSACTION_JOURNAL_STORAGE_KEY, readCatalogTransactionJournal])
  const values = new Map<string, unknown>()
  const revisions: Record<string, number> = {}
  for (const [key, reader] of reads) {
    const stable = stableFarmhouseRead(key, reader)
    if (!stable) return null
    values.set(key, stable.data)
    revisions[key] = stable.revision
  }
  const snapshot: FarmhouseCommerceSnapshot = { variant, farmId }
  if (variant === 'voucher') {
    snapshot.vouchers = values.get(PLATFORM_VOUCHERS_STORAGE_KEY) as Record<string, VoucherOrder>
    snapshot.ledger = values.get(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY) as Record<string, CommissionLedgerEntry>
  } else if (variant === 'checkout' || variant === 'cancel') {
    const catalog = values.get(PLATFORM_CATALOG_STORAGE_KEY)
    if (!catalog) return null
    snapshot.localState = values.get(FARMHOUSE_COMMERCE_STORAGE_KEY) as FarmhouseLocalState
    snapshot.catalog = catalog as CatalogState
    snapshot.platformOrders = values.get(PLATFORM_ORDERS_STORAGE_KEY) as Record<string, Order>
    snapshot.shares = values.get(PLATFORM_SHARES_STORAGE_KEY) as ShareRecord[]
    if (variant === 'checkout') {
      snapshot.bindings = values.get(PLATFORM_BINDINGS_STORAGE_KEY) as Record<string, UserBinding>
      snapshot.storeAccounts = values.get(PLATFORM_STORE_ACCOUNTS_STORAGE_KEY) as StoreAccount[]
    }
  } else {
    snapshot.localState = values.get(FARMHOUSE_COMMERCE_STORAGE_KEY) as FarmhouseLocalState
    snapshot.afterSales = values.get(PLATFORM_AFTERSALES_STORAGE_KEY) as Record<string, AfterSale> | null
    if (!requestVariant) {
      snapshot.shares = values.get(PLATFORM_SHARES_STORAGE_KEY) as ShareRecord[]
      snapshot.platformOrders = values.get(PLATFORM_ORDERS_STORAGE_KEY) as Record<string, Order>
    }
    if (variant === 'after-sale-return') {
      const catalog = values.get(PLATFORM_CATALOG_STORAGE_KEY)
      if (!catalog) return null
      snapshot.catalog = catalog as CatalogState
    }
  }
  return { snapshot, revisions }
}
function writeFarmhouseCommerceSnapshot(snapshot: FarmhouseCommerceSnapshot): boolean {
  const before = readStableFarmhouseSnapshot(snapshot.variant, snapshot.farmId)?.snapshot
  if (!before) return false
  if (JSON.stringify(before) === JSON.stringify(snapshot)) return true
  const requestVariant = snapshot.variant === 'after-sale-request-refund' || snapshot.variant === 'after-sale-request-return'
  const steps: Array<{ apply: () => boolean; rollback: () => boolean }> = snapshot.variant === 'voucher'
    ? [
        { apply: () => writePlatformVoucherOrders(snapshot.vouchers!), rollback: () => writePlatformVoucherOrders(before.vouchers!) },
        { apply: () => writePlatformCommissionLedger(snapshot.ledger!), rollback: () => writePlatformCommissionLedger(before.ledger!) }
      ]
    : snapshot.variant === 'checkout' || snapshot.variant === 'cancel'
      ? [
          { apply: () => writeFarmhouseLocalState(snapshot.localState!), rollback: () => writeFarmhouseLocalState(before.localState!) },
          { apply: () => writeCatalogState(snapshot.catalog!), rollback: () => writeCatalogState(before.catalog!) },
          { apply: () => writePlatformOrders(snapshot.platformOrders!), rollback: () => writePlatformOrders(before.platformOrders!) },
          { apply: () => writeShareRecords(snapshot.shares!), rollback: () => writeShareRecords(before.shares!) },
          ...(snapshot.variant === 'checkout' ? [{ apply: () => writeUserBindings(snapshot.bindings!), rollback: () => writeUserBindings(before.bindings!) }] : [])
        ]
    : requestVariant
      ? [
          { apply: () => writeFarmhouseLocalState(snapshot.localState!), rollback: () => writeFarmhouseLocalState(before.localState!) },
          { apply: () => writePlatformAfterSales(snapshot.afterSales!), rollback: () => writePlatformAfterSales(before.afterSales!) }
        ]
    : [
        { apply: () => writeFarmhouseLocalState(snapshot.localState!), rollback: () => writeFarmhouseLocalState(before.localState!) },
        ...(snapshot.catalog ? [{ apply: () => writeCatalogState(snapshot.catalog!), rollback: () => writeCatalogState(before.catalog!) }] : []),
        { apply: () => writePlatformAfterSales(snapshot.afterSales!), rollback: () => writePlatformAfterSales(before.afterSales!) },
        { apply: () => writeShareRecords(snapshot.shares!), rollback: () => writeShareRecords(before.shares!) },
        { apply: () => writePlatformOrders(snapshot.platformOrders!), rollback: () => writePlatformOrders(before.platformOrders!) }
      ]
  const applied: typeof steps = []
  for (const step of steps) {
    if (step.apply()) { applied.push(step); continue }
    for (const completed of [...applied].reverse()) completed.rollback()
    return false
  }
  return true
}
function reusableFarmhouseTarget(operationId: string, original: FarmhouseCommerceSnapshot): FarmhouseCommerceSnapshot | null {
  const journal = readPlatformJournal()[operationId]
  return journal?.status === 'aborted' && isFarmhouseCommerceJournal(journal) && JSON.stringify(journal.original) === JSON.stringify(original) ? cloneSeed(journal.target as FarmhouseCommerceSnapshot) : null
}

export function createFarmhouseAtomicRecoveryHandlerRegistrations() {
  return [createStrictSnapshotRecoveryHandlerRegistration({
    key: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY,
    fields: ['localState', 'localBaseline', 'catalog', 'afterSales', 'shares', 'platformOrders', 'bindings', 'storeAccounts', 'vouchers', 'ledger'] as const,
    validateJournal: isFarmhouseCommerceJournal,
    readStable: (journal) => {
      const source = journal.original as FarmhouseCommerceSnapshot
      const stable = readStableFarmhouseSnapshot(source.variant, source.farmId)
      if (!stable) return null
      if (source.variant === 'checkout' && source.localBaseline) stable.snapshot.localBaseline = cloneSeed(source.localBaseline)
      return { snapshot: stable.snapshot, token: stable.revisions }
    },
    isStillStable: (revisions, journal) => {
      const source = journal.original as FarmhouseCommerceSnapshot
      return farmhouseCollections(source.variant).every((key) => readPlatformCollectionRevision(key) === revisions[key])
    },
    writeSnapshot: (snapshot, _rollback, journal) => {
      if (!writeFarmhouseCommerceSnapshot(snapshot)) return false
      if (!['checkout', 'after-sale-return'].includes(snapshot.variant)) return true
      const expectedCatalogStatus = journal.status === 'committed' ? 'committed' : 'aborted'
      return readCatalogTransactionJournal()[journal.operationId]?.status === expectedCatalogStatus || resolveCatalogTransactionForRecovery(journal.operationId, expectedCatalogStatus)
    }
  })]
}

function reverseOrderShares(orderId: string): boolean {
  return buildOrderShareReversals(orderId).every((record) => writeShareRecord(record))
}

function selectedProduct(product: CatalogProduct, selection?: StoreCatalogSelection): Product {
  return selection ? catalogProductToStoreProduct(product, selection) : catalogProductToProduct(product)
}

export function isActiveBookingStatus(status: Booking['status']): boolean {
  return status === 'reserved' || status === 'confirmed'
}

export function farmhouseBookingStatusText(status: Booking['status']): string {
  return status === 'reserved' ? '待确认' : status === 'confirmed' ? '已确认' : status === 'completed' ? '已核销' : '已取消'
}

export function farmhouseBookingVerificationError(status: Booking['status']): string | undefined {
  return status === 'completed' ? '该预约已核销，不能重复核销' : status === 'cancelled' ? '该预约已取消，不能核销' : undefined
}

export interface Room {
  id: string
  name: string
  emoji: string
  image: BusinessMediaValue
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
  image: BusinessMediaValue
}

const seedRooms = (): Room[] => [
  { id: 'R001', name: '观溪雅间', image: '/static/images/mountain.webp', emoji: '🪟', capacity: '8–10 人 · 临溪景观 · 最低消费 ¥600', sessions: '午市 11:00 / 晚市 17:30', status: '可预订', people: 8 },
  { id: 'R002', name: '竹林包厢', image: '/static/images/field.webp', emoji: '🏮', capacity: '6–8 人 · 竹林环绕 · 最低消费 ¥480', sessions: '午市 11:00 / 晚市 17:30', status: '可预订', people: 6 },
  { id: 'R003', name: '丰收大厅', image: '/static/images/farmhouse.webp', emoji: '🍂', capacity: '20–30 人 · 适合家宴聚会 · 最低消费 ¥1500', sessions: '晚市 17:30', status: '仅余晚市', people: 20 }
]


const seedExperiences = (): FarmExperience[] => [
  { id: 'EXP001', farmId: 'F001', name: '农事采摘体验', categoryCode: 'pick', description: '应季果蔬采摘 · 亲子互动', price: 68, status: 'active', image: '/static/images/field.webp', sort: 1, updatedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'EXP002', farmId: 'F001', name: '柴火土灶现做', categoryCode: 'cook', description: '农家柴火灶 · 现场烹饪', price: 128, status: 'active', image: '/static/images/farmhouse.webp', sort: 2, updatedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'EXP003', farmId: 'F001', name: '露营帐篷烧烤', categoryCode: 'camp', description: '临溪草坪 · 夜宿露营', price: 198, status: 'active', image: '/static/images/mountain.webp', sort: 3, updatedAt: '2026-08-01T09:00:00.000Z' }
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
  catalogRevision: number
  selectionRevision: number
  catalogSelections: StoreCatalogSelection[]
  cart: CartLine[]
  bookings: Booking[]
  orders: StorefrontOrder[]
  rooms: Room[]
  shares: number
  balanceEntries: BalanceEntry[]
  promotionRecords: PromotionRecord[]
  foods: FoodItem[]
  experiences: FarmExperience[]
  checkoutError: string
  auth: { isLoggedIn: boolean; openid: string }
  storeAccounts: StoreAccount[]
  loggedAccountId: string
  currentUserId: string
  pendingUserId: string
  deliveryAddress: string
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
    catalogRevision: 0,
    selectionRevision: 0,
    catalogSelections: [],
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
    experiences: seedExperiences(),
    checkoutError: '',
    auth: { isLoggedIn: false, openid: '' },
    storeAccounts: [],
    loggedAccountId: '',
    currentUserId: '',
    pendingUserId: '',
    deliveryAddress: '',
    referrer: {}
  }),
  getters: {
    isListed: (state) => (productId: string) => state.catalogSelections.some((item) => item.productId === productId && item.listed),
    cartCount: (state) => state.cart.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: (state) => calcCartTotal(state.cart.map(({ price, quantity }) => ({ price, quantity }))),
    cartHasUnavailable: (state) => state.cart.some((item) => item.unavailable),
    balance: (state) => state.member.balance,
    points: (state) => state.member.points,
    vouchers: (state): VoucherOrder[] => Object.values(readPlatformVoucherOrders() || {}).filter((item) => item.farmId === (state.tenant?.farmId || state.farm?.id || 'F001')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    canOperate: (state) => state.role === 'staff' || state.role === 'manager',
    canSelect: (state) => state.role === 'manager'
  },
  actions: {
    async initialize(force = false, farm?: unknown) {
      if ((!force && this.initialized) || this.loading) return
      const runtimeTenant = resolveRuntimeTenant(farm)
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.tenant?.farmId === runtimeTenant.farmId && !!this.farm
      this.loading = true
      this.error = ''
      try {
        initializePlatformRecoveryHandlers(createFarmhouseAtomicRecoveryHandlerRegistrations())
        const reconciliation = reconcilePendingPlatformTransactions({ handlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY, matches: isFarmhouseCommerceJournal })
        if (!reconciliation.ok) throw new Error(reconciliation.message)
        const [storefront, catalogState] = await Promise.all([
          farmhouseRepository.loadStorefront(this.mockScenario, runtimeTenant),
          farmhouseRepository.loadCatalogState(this.mockScenario)
        ])
        this.$patch({
          tenant: hasPersistedData ? mergePersistedDefaults(storefront.tenant, this.tenant) : storefront.tenant,
          farm: hasPersistedData ? mergePersistedDefaults(storefront.farm, this.farm) : storefront.farm,
          member: hasPersistedData ? mergePersistedDefaults(storefront.member, this.member) : storefront.member,
          foods: hasPersistedData ? mergeEntitySeeds(storefront.foods, this.foods) : storefront.foods,
          experiences: hasPersistedData ? mergeEntitySeeds(storefront.experiences, this.experiences) : storefront.experiences,
          initialized: true
        })
        this.applyCatalogState(catalogState)
        if (this.farm) applyPlatformMedia([this.farm], this.products)
        this.storeAccounts = mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
        this.experiences = mergePlatformExperiences(this.experiences)
        const currentFarmId = this.tenant?.farmId || this.farm?.id || 'F001'
        const persisted = readFarmhouseLocalState()[currentFarmId]
        if (persisted) {
          this.orders = cloneSeed(persisted.orders)
          this.member.balance = persisted.memberBalance
          this.member.points = persisted.memberPoints
          this.balanceEntries = cloneSeed(persisted.balanceEntries)
        }
        this.syncSharedBookings()
        this.recoverCatalogTransactions()
        if (!this.deliveryAddress) this.deliveryAddress = this.tenant?.address || ''
        if (this.auth.isLoggedIn && this.auth.openid) this.setAuthorizedIdentity(this.auth.openid)
        this.cart.forEach((line) => {
          const product = this.products.find((item) => item.id === line.productId)
          const sku = product?.skus.find((item) => item.id === line.skuId) || product?.skus[0]
          if (sku) Object.assign(line, { skuId: sku.id, skuName: sku.name, price: sku.price, stock: sku.stock })
        })
        this.syncCourierOrders()
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    applyCatalogState(state: CatalogState) {
      const storeId = this.tenant?.farmId || this.farm?.id || 'F001'
      const selectionState = ensureStoreCatalogSelectionDefaults(storeId, state)
      const selections = selectionState.selections.filter((item) => item.storeId === storeId)
      const selectionByProduct = new Map(selections.map((item) => [item.productId, item]))
      const candidates = catalogProductsForAudience(state, 'farmhouse-selection')
      this.catalogRevision = state.revision
      this.selectionRevision = selectionState.revision
      this.catalogSelections = selections
      this.selectableProducts = candidates.map((product) => selectedProduct(product))
      this.products = candidates
        .filter((product) => selectionByProduct.get(product.id)?.listed)
        .map((product) => selectedProduct(product, selectionByProduct.get(product.id)))
      applyPlatformMedia(null, this.selectableProducts)
      applyPlatformMedia(null, this.products)
      this.cart.forEach((line) => {
        const sku = this.products.find((product) => product.id === line.productId)?.skus.find((item) => item.id === line.skuId)
        line.stock = sku?.stock ?? 0
        line.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        line.unavailable = !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      })
    },
    refreshCatalog() {
      const state = readCatalogState()
      if (!state) return false
      this.applyCatalogState(state)
      return true
    },
    async refreshSharedState() {
      this.storeAccounts = mergePlatformStoreAccounts(storeAccounts, readPlatformStoreAccounts())
      this.refreshCatalog()
      this.syncSharedBookings()
      this.syncCourierOrders()
    },
    syncSharedBookings() {
      const currentFarmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const mapStatus = (status: SharedBooking['status']): Booking['status'] => status === 'submitted' ? 'reserved' : status === 'confirmed' ? 'confirmed' : status === 'completed' ? 'completed' : 'cancelled'
      for (const shared of Object.values(readPlatformBookings() || {})) {
        if (shared.farmId !== currentFarmId) continue
        const values = { date: shared.date, session: shared.session, people: shared.people, amount: shared.amount, status: mapStatus(shared.status) }
        const existing = this.bookings.find((booking) => booking.id === shared.id)
        if (existing) Object.assign(existing, values)
        else this.bookings.push({ id: shared.id, type: 'package', name: shared.farmName, ...values })
      }
    },
    recoverCatalogTransactions() {
      for (const entry of readPendingCatalogTransactions('farmhouse')) {
        const platformJournal = readPlatformJournal()[entry.id]
        if (platformJournal?.recoveryHandlerKey === FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY && platformJournal.status !== 'committed') continue
        const payload = entry.payload as FarmhouseTransactionPayload
        if (!payload.order || !Number.isFinite(payload.memberBalance) || !Number.isFinite(payload.memberPoints)) continue
        if (entry.status === 'prepared') {
          const catalog = readCatalogState()
          if (!catalog) continue
          const result = applyCatalogStockOperation(entry.id, entry.inventoryChanges, catalog.revision)
          if (!result || !markCatalogTransactionStockApplied(entry.id)) continue
          this.applyCatalogState(result.state)
        }
        if (!applyFarmhouseTransactionSideEffects(payload)) continue
        const existing = this.orders.find((order) => order.id === payload.order!.id)
        if (existing) Object.assign(existing, cloneSeed(payload.order))
        else this.orders.unshift(cloneSeed(payload.order))
        this.member.balance = Number(payload.memberBalance)
        this.member.points = Number(payload.memberPoints)
        if (payload.balanceEntry && !this.balanceEntries.some((item) => item.id === payload.balanceEntry!.id)) this.balanceEntries.unshift(cloneSeed(payload.balanceEntry))
        commitCatalogTransaction(entry.id)
      }
      const latest = readCatalogState()
      if (latest && latest.revision !== this.catalogRevision) this.applyCatalogState(latest)
    },
    syncCourierOrders() {
      const platformOrders = readPlatformOrders()
      if (!platformOrders) return
      this.orders.forEach((order) => {
        const ids = order.platformOrderIds?.length ? order.platformOrderIds : order.platformOrderId ? [order.platformOrderId] : []
        const linked = ids.map((platformOrderId) => platformOrders[platformOrderId]).filter((item): item is Order => !!item)
        if (!linked.length) return
        const fulfillments = linked.map((platformOrder) => platformOrder.supplierFulfillment).filter((item): item is NonNullable<Order['supplierFulfillment']> => !!item)
        if (!fulfillments.length) return
        if (fulfillments.every((fulfillment) => fulfillment.status === 'received' || fulfillment.status === 'completed')) order.status = '已完成'
        else if (fulfillments.some((fulfillment) => fulfillment.status === 'shipped' || fulfillment.status === 'delivering')) order.status = '已发货'
        else order.status = '待发货'
        const shipped = fulfillments.find((fulfillment) => fulfillment.trackingNo)
        order.trackingNo = shipped?.trackingNo
        order.courier = fulfillments.some((fulfillment) => fulfillment.shipType === 'driver') ? '司机配送' : '快递直发'
        order.logistics = linked[0]?.logistics?.length ? linked[0].logistics : order.logistics
      })
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
      const minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity)
      const initialQuantity = initialCatalogOrderQuantity(minimumOrderQuantity)
      if (!sku || !validateCatalogSkuOrderQuantity(sku, initialQuantity).ok) {
        this.checkoutError = sku && sku.stock < minimumOrderQuantity ? `${product.name}库存不足或购买数量未达要求` : `${product.name}库存不足`
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
        line.minimumOrderQuantity = minimumOrderQuantity
        line.unavailable = !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      } else {
        this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.price, stock: sku.stock, quantity: initialQuantity, minimumOrderQuantity, unavailable: false })
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
      else {
        line.stock = sku?.stock ?? 0
        line.minimumOrderQuantity = normalizeMinimumOrderQuantity(sku?.minimumOrderQuantity ?? line.minimumOrderQuantity)
        line.unavailable = !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      }
      this.checkoutError = ''
      return true
    },
    async checkout(payload: { deliveryMode?: 'pickup' | 'courier'; address?: string } = {}) {
      this.checkoutError = ''
      if (!this.cart.length) {
        this.checkoutError = '购物车为空'
        return false
      }
      const latestCatalog = readCatalogState()
      if (!latestCatalog) { this.checkoutError = '商品库存已更新，请重试'; return false }
      const revisionChanged = latestCatalog.revision !== this.catalogRevision
      if (revisionChanged) this.applyCatalogState(latestCatalog)
      const insufficient = this.cart.find((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        const sku = product?.skus.find((item) => item.id === line.skuId)
        return !product || !sku || !validateCatalogSkuOrderQuantity(sku, line.quantity).ok
      })
      if (insufficient) {
        const sku = this.products.find((item) => item.id === insufficient.productId)?.skus.find((item) => item.id === insufficient.skuId)
        const validation = sku ? validateCatalogSkuOrderQuantity(sku, insufficient.quantity) : null
        this.checkoutError = !sku ? `${insufficient.name}规格已失效` : validation && !validation.ok && (validation.code === 'below_minimum_order_quantity' || sku.stock < normalizeMinimumOrderQuantity(sku.minimumOrderQuantity)) ? `${insufficient.name}库存不足或购买数量未达要求` : `${insufficient.name}库存不足`
        return false
      }
      if (revisionChanged) { this.checkoutError = '商品库存已更新，请重试'; return false }
      const expressCart = this.cart.filter((line) => {
        const product = this.products.find((item) => item.id === line.productId)
        return !!product && isExpressDeliverable(product)
      })
      const wantsCourier = payload.deliveryMode === 'courier' && expressCart.length > 0
      if (wantsCourier && !payload.address?.trim()) {
        this.checkoutError = '请填写收货地址'
        return false
      }
      if (readStoreCatalogSelectionState().revision !== this.selectionRevision) {
        this.refreshCatalog()
        this.checkoutError = '门店价格已更新，请确认后重试'
        return false
      }
      const total = this.cartTotal
      if (this.member.balance < total) {
        this.checkoutError = '会员余额不足'
        return false
      }
      const expectedRevision = this.catalogRevision
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const stable = readStableFarmhouseSnapshot('checkout', farmId)
      if (!stable || stable.snapshot.catalog?.revision !== expectedRevision) {
        const latest = readCatalogState()
        if (latest) this.applyCatalogState(latest)
        this.checkoutError = '商品库存已更新，请重试'
        return false
      }
      const original = cloneSeed(stable.snapshot)
      const originalLocal = original.localState![farmId]
      const hadPersistedLocal = !!originalLocal
      const localBase: FarmhouseLocalSnapshot = originalLocal
        ? cloneSeed(originalLocal)
        : { orders: cloneSeed(this.orders), memberBalance: this.member.balance, memberPoints: this.member.points, balanceEntries: cloneSeed(this.balanceEntries) }
      if (!originalLocal) original.localBaseline = cloneSeed(localBase)
      if (localBase.memberBalance < total) {
        this.checkoutError = '会员余额不足'
        return false
      }
      const itemCount = this.cartCount
      const orderId = createId('SO')
      const customerUserId = this.currentUserId || this.auth.openid || `guest:${farmId}`
      const pointsAwarded = Math.floor(total)
      const operationTime = new Date()
      const cartItems = this.cart.map((item) => {
        const product = this.products.find((p) => p.id === item.productId)
        const courier = wantsCourier && !!product && isExpressDeliverable(product)
        return { productId: item.productId, skuId: item.skuId, name: item.name, skuName: item.skuName, image: mediaValueToImage(item.image), quantity: item.quantity, price: item.price, minimumOrderQuantity: normalizeMinimumOrderQuantity(item.minimumOrderQuantity), deliveryMode: courier ? 'courier' as const : 'pickup' as const }
      })
      const order: StorefrontOrder = {
        id: orderId, customerUserId, amount: total, itemCount, status: '待发货', createdAt: operationTime.toLocaleString('zh-CN'),
        items: cartItems, pointsAwarded,
        delivery: wantsCourier ? { mode: 'courier', address: payload.address?.trim() } : { mode: 'pickup' },
        platformOrderId: wantsCourier ? `FH-${orderId}` : undefined
      }
      const nextBalance = round2(localBase.memberBalance - total)
      const balanceEntry: BalanceEntry = { id: `${orderId}:consume`, type: 'consume', amount: -total, balance: nextBalance, description: `商城订单消费 · ${itemCount} 件商品`, createdAt: operationTime.toLocaleString('zh-CN') }
      const inventoryChanges = this.cart.map((line) => ({ productId: line.productId, skuId: line.skuId, quantity: -line.quantity }))
      const operationId = `${orderId}:checkout`
      const courierItems = cartItems.filter((item) => item.deliveryMode === 'courier')
      const address: CAddress | undefined = courierItems.length
        ? { id: `${orderId}-ADDR`, userId: this.auth.openid || '', receiver: this.member.name, phone: this.member.phone || '', region: payload.address?.trim() || '', detail: '', isDefault: false, updatedAt: operationTime.toISOString() }
        : undefined
      const platformOrders: Order[] = courierItems.length
        ? buildSupplierPlatformOrders({
            items: courierItems, products: this.products, customer: '游客 · ' + this.member.name, channel: 'shop', source: 'farmhouse-courier',
            sourceOrderId: 'FH-' + orderId, status: 'pending', createdAt: operationTime.toLocaleString('zh-CN'), customerUserId: this.auth.openid || '', deliveryAddress: address,
            storeId: farmId, storeName: this.farm?.name || this.tenant?.name || '农家乐'
          })
        : []
      if (platformOrders.length) {
        order.platformOrderId = platformOrders[0].id
        order.platformOrderIds = platformOrders.map((platformOrder) => platformOrder.id)
      }
      const shareSideEffects = this.buildOrderShareSideEffects(orderId, cartItems, original, customerUserId)
      const transactionPayload: FarmhouseTransactionPayload & { order: StorefrontOrder; memberBalance: number; memberPoints: number; balanceEntry: BalanceEntry; cartItems: typeof cartItems } = {
        order, memberBalance: balanceEntry.balance, memberPoints: localBase.memberPoints + pointsAwarded, balanceEntry, cartItems,
        platformOrder: platformOrders[0], platformOrders, shareRecords: shareSideEffects.shareRecord ? [shareSideEffects.shareRecord] : undefined, userBinding: shareSideEffects.userBinding
      }
      const targetCatalog = cloneSeed(original.catalog!)
      for (const change of inventoryChanges) {
        const sku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((candidate) => candidate.id === change.skuId)
        if (!sku || sku.status === 'retired' || !validateCatalogSkuOrderQuantity(sku, -change.quantity).ok) {
          this.checkoutError = '商品库存不足，请调整后重试'
          return false
        }
        sku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = {
        id: operationId, action: 'reserve', requestFingerprint: JSON.stringify({ action: 'reserve', changes: inventoryChanges }),
        changes: [], appliedAt: operationTime.toISOString()
      }
      const targetShares = cloneSeed(original.shares!)
      if (shareSideEffects.shareRecord) targetShares.push(cloneSeed(shareSideEffects.shareRecord))
      const targetBindings = cloneSeed(original.bindings!)
      if (shareSideEffects.userBinding) targetBindings[shareSideEffects.userBinding.userId] = cloneSeed(shareSideEffects.userBinding)
      const target: FarmhouseCommerceSnapshot = {
        variant: 'checkout', farmId,
        localState: {
          ...cloneSeed(original.localState!),
          [farmId]: {
            orders: [cloneSeed(order), ...localBase.orders.filter((item) => item.id !== order.id)],
            memberBalance: nextBalance,
            memberPoints: localBase.memberPoints + pointsAwarded,
            balanceEntries: [cloneSeed(balanceEntry), ...localBase.balanceEntries.filter((item) => item.id !== balanceEntry.id)]
          }
        },
        catalog: targetCatalog,
        platformOrders: { ...cloneSeed(original.platformOrders!), ...Object.fromEntries(platformOrders.map((platformOrder) => [platformOrder.id, cloneSeed(platformOrder)])) },
        shares: targetShares,
        bindings: targetBindings,
        storeAccounts: cloneSeed(original.storeAccounts!),
        ...(original.localBaseline ? { localBaseline: cloneSeed(original.localBaseline) } : {})
      }
      const restoreLocalState = () => (!hadPersistedLocal && !readFarmhouseLocalState()[farmId]) || JSON.stringify(readFarmhouseLocalState()) === JSON.stringify(original.localState!) || writeFarmhouseLocalState(original.localState!)
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: farmhouseCollections('checkout'),
        original,
        target,
        recoveryHandlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: FARMHOUSE_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: farmhouseCollections('checkout').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'catalog-journal', apply: () => prepareCatalogTransaction({ id: operationId, channel: 'farmhouse', action: 'reserve', inventoryChanges, payload: transactionPayload }), rollback: () => resolveCatalogTransactionForRecovery(operationId, 'aborted') },
          { key: 'local-state', apply: () => writeFarmhouseLocalState(target.localState!), rollback: restoreLocalState },
          { key: 'catalog', apply: () => writeCatalogState(target.catalog!, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, target.catalog!.revision) },
          { key: 'catalog-stock-applied', apply: () => markCatalogTransactionStockApplied(operationId), rollback: () => resolveCatalogTransactionForRecovery(operationId, 'aborted') },
          { key: 'platform-orders', apply: () => writePlatformOrders(target.platformOrders!), rollback: () => writePlatformOrders(original.platformOrders!) },
          { key: 'bindings', apply: () => writeUserBindings(target.bindings!), rollback: () => writeUserBindings(original.bindings!) },
          { key: 'shares', apply: () => writeShareRecords(target.shares!), rollback: () => writeShareRecords(original.shares!) },
          { key: 'catalog-commit', apply: () => commitCatalogTransaction(operationId), rollback: () => resolveCatalogTransactionForRecovery(operationId, 'aborted') }
        ]
      })
      if (!result.ok) {
        this.checkoutError = result.fatal ? '订单事务恢复失败，请联系平台处理' : result.code === 'revision_conflict' ? '商品库存已更新，请重试' : '订单处理中，请重试'
        return false
      }
      const localSnapshot = target.localState![farmId]
      const soldQuantities = new Map(this.cart.map((line) => [line.productId, line.quantity]))
      this.applyCatalogState(target.catalog!)
      this.products.forEach((product) => { product.sales += soldQuantities.get(product.id) || 0 })
      this.orders = cloneSeed(localSnapshot.orders)
      this.member.balance = localSnapshot.memberBalance
      this.member.points = localSnapshot.memberPoints
      this.balanceEntries = cloneSeed(localSnapshot.balanceEntries)
      this.cart = []
      return true
    },
    async cancelStorefrontOrder(id: string) {
      const memoryOrder = this.orders.find((item) => item.id === id)
      if (!memoryOrder || memoryOrder.status !== '待发货' || memoryOrder.inventoryReleased || memoryOrder.balanceRefunded) return false
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const stable = readStableFarmhouseSnapshot('cancel', farmId)
      const original = stable?.snapshot
      const originalLocal = original?.localState?.[farmId]
      const order = originalLocal?.orders.find((item) => item.id === id)
      if (!stable || !original || !originalLocal || !order || order.status !== '待发货' || order.inventoryReleased || order.balanceRefunded || original.catalog?.revision !== this.catalogRevision) {
        this.checkoutError = '商品库存已更新，请重试'
        return false
      }
      const operationId = `${order.id}:release`
      const inventoryChanges = order.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity }))
      const targetCatalog = cloneSeed(original.catalog!)
      for (const change of inventoryChanges) {
        const sku = targetCatalog.products.find((product) => product.id === change.productId)?.skus.find((item) => item.id === change.skuId)
        if (!sku) return false
        sku.stock += change.quantity
      }
      targetCatalog.revision += 1
      targetCatalog.appliedOperations ||= {}
      targetCatalog.appliedOperations[operationId] = { id: operationId, action: 'release', requestFingerprint: JSON.stringify({ action: 'release', changes: inventoryChanges }), changes: [], appliedAt: new Date().toISOString() }
      const nextOrder = { ...cloneSeed(order), status: '已取消' as const, inventoryReleased: true, balanceRefunded: true }
      const nextBalance = round2(originalLocal.memberBalance + order.amount)
      const nextPoints = Math.max(0, originalLocal.memberPoints - (order.pointsAwarded || 0))
      const balanceEntry: BalanceEntry = { id: `${order.id}:refund`, type: 'refund', amount: order.amount, balance: nextBalance, description: `商城订单取消退款 · ${order.itemCount} 件商品`, createdAt: new Date().toLocaleString('zh-CN') }
      const targetLocal: FarmhouseLocalState = { ...cloneSeed(original.localState!), [farmId]: { orders: originalLocal.orders.map((item) => item.id === id ? nextOrder : cloneSeed(item)), memberBalance: nextBalance, memberPoints: nextPoints, balanceEntries: [balanceEntry, ...originalLocal.balanceEntries.filter((item) => item.id !== balanceEntry.id).map(cloneSeed)] } }
      const targetPlatformOrders = cloneSeed(original.platformOrders!)
      const platformOrderIds = order.platformOrderIds?.length ? order.platformOrderIds : order.platformOrderId ? [order.platformOrderId] : []
      platformOrderIds.forEach((platformOrderId) => {
        const linked = targetPlatformOrders[platformOrderId]
        if (linked?.storeId === farmId) targetPlatformOrders[platformOrderId] = { ...linked, status: 'paid-cancelled' }
      })
      const shareMap = new Map(original.shares!.map((record) => [record.id, cloneSeed(record)]))
      buildOrderShareReversals(order.id, original.shares!).forEach((record) => shareMap.set(record.id, record))
      const target: FarmhouseCommerceSnapshot = { variant: 'cancel', farmId, localState: targetLocal, catalog: targetCatalog, platformOrders: targetPlatformOrders, shares: [...shareMap.values()] }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: farmhouseCollections('cancel'),
        original,
        target,
        recoveryHandlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: FARMHOUSE_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: farmhouseCollections('cancel').map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'local-state', apply: () => writeFarmhouseLocalState(targetLocal), rollback: () => writeFarmhouseLocalState(original.localState!) },
          { key: 'catalog', apply: () => writeCatalogState(targetCatalog, original.catalog!.revision), rollback: () => writeCatalogState(original.catalog!, targetCatalog.revision) },
          { key: 'platform-orders', apply: () => writePlatformOrders(targetPlatformOrders), rollback: () => writePlatformOrders(original.platformOrders!) },
          { key: 'shares', apply: () => writeShareRecords(target.shares!), rollback: () => writeShareRecords(original.shares!) }
        ]
      })
      if (!result.ok) { this.checkoutError = result.code === 'revision_conflict' ? '数据已更新，请重试' : result.fatal ? '取消事务恢复失败，请联系平台处理' : '取消未完成，请重试'; return false }
      this.applyCatalogState(targetCatalog)
      this.orders = cloneSeed(targetLocal[farmId].orders)
      this.member.balance = nextBalance
      this.member.points = nextPoints
      this.balanceEntries = cloneSeed(targetLocal[farmId].balanceEntries)
      return true
    },
    async requestStorefrontAfterSale(id: string, type: 'refund' | 'return', evidenceImages?: BusinessMediaValue[]) {
      const memoryOrder = this.orders.find((item) => item.id === id)
      if (!memoryOrder) return false
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const variant: FarmhouseCommerceVariant = type === 'refund' ? 'after-sale-request-refund' : 'after-sale-request-return'
      const operationId = `${id}:${variant}`
      const stable = readStableFarmhouseSnapshot(variant, farmId)
      if (!stable) { this.checkoutError = '数据已更新，请重试'; return false }
      const original = stable.snapshot
      const originalLocal = original.localState![farmId]
      const persistedOrder = originalLocal?.orders.find((item) => item.id === id)
      if (!originalLocal || !persistedOrder || persistedOrder.status !== '已完成' || persistedOrder.afterSaleType || Object.values(original.afterSales || {}).some((work) => work.orderId === id)) {
        if (persistedOrder && persistedOrder.status !== '已完成') this.checkoutError = '订单数据已更新，请重试'
        return false
      }
      let target = reusableFarmhouseTarget(operationId, original)
      if (!target) {
        const now = new Date().toLocaleString('zh-CN')
        const first = persistedOrder.items[0]
        const work: AfterSale = {
          id: `AS-${id}`, orderId: id, productName: first?.name || '特产商品', applicant: this.member.name || '游客',
          type, amount: persistedOrder.amount, status: 'processing', issue: '用户申请售后，平台受理中', quantity: first?.quantity || persistedOrder.itemCount,
          evidenceImages,
          history: [{ time: now, action: '用户发起售后，平台受理中', operator: this.member.name || '游客' }]
        }
        const nextOrder = { ...cloneSeed(persistedOrder), afterSaleType: type, status: type === 'refund' ? '退款中' as const : '退货中' as const }
        target = {
          variant,
          farmId,
          localState: { ...cloneSeed(original.localState!), [farmId]: { ...cloneSeed(originalLocal), orders: originalLocal.orders.map((item) => item.id === id ? nextOrder : cloneSeed(item)) } },
          afterSales: { ...(original.afterSales || {}), [work.id]: work }
        }
      }
      const result = await runLockedPlatformTransaction({
        operationId,
        collections: farmhouseCollections(variant),
        original,
        target,
        recoveryHandlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY,
        recoverySchema: FARMHOUSE_COMMERCE_RECOVERY_SCHEMA,
        revisionChecks: farmhouseCollections(variant).map((key) => ({ key, expectedRevision: stable.revisions[key] })),
        steps: [
          { key: 'local-state', apply: () => writeFarmhouseLocalState(target!.localState!), rollback: () => writeFarmhouseLocalState(original.localState!) },
          { key: 'after-sales', apply: () => writePlatformAfterSales(target!.afterSales!), rollback: () => writePlatformAfterSales(original.afterSales!) }
        ]
      })
      if (!result.ok) {
        this.checkoutError = result.fatal ? '售后申请事务恢复失败，请联系平台处理' : '售后申请未完成，请重试'
        return false
      }
      const local = target.localState![farmId]
      this.orders = cloneSeed(local.orders)
      this.member.balance = local.memberBalance
      this.member.points = local.memberPoints
      this.balanceEntries = cloneSeed(local.balanceEntries)
      return true
    },
    async completeStorefrontAfterSale(_id: string) {
      return false
    },
    submitBooking(payload: Omit<Booking, 'id' | 'status'>) {
      const duplicated = this.bookings.some((item) => isActiveBookingStatus(item.status) && item.type === payload.type && item.name === payload.name && item.date === payload.date && item.session === payload.session)
      if (duplicated) return false
      const id = createId('B')
      const createdAt = new Date().toISOString()
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const existingShared = Object.values(readPlatformBookings() || {}).some((item) => item.farmId === farmId && item.userId === (this.currentUserId || this.auth.openid || 'guest') && item.date === payload.date && item.session === payload.session && ['submitted', 'confirmed'].includes(item.status))
      if (existingShared) return false
      const shared: import('@agritainment/shared').SharedBooking = {
        id,
        farmId,
        farmName: this.farm?.name || this.tenant?.name || farmId,
        userId: this.currentUserId || this.auth.openid || 'guest',
        source: 'farmhouse',
        date: payload.date,
        session: payload.session,
        people: payload.people,
        ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
        status: 'submitted',
        createdAt
      }
      if (!writePlatformBooking(shared)) return false
      this.bookings.unshift({ ...payload, id, status: 'reserved' })
      return true
    },
    cancelBooking(id: string) {
      const item = this.bookings.find((booking) => booking.id === id)
      if (!item || !isActiveBookingStatus(item.status)) return false
      const shared = readPlatformBookings()?.[id]
      if (shared && !writePlatformBooking({ ...shared, status: 'cancelled', updatedAt: new Date().toLocaleString('zh-CN') })) return false
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
    setSkuStock(productId: string, skuId: string, stock: number) {
      const product = this.selectableProducts.find((item) => item.id === productId) || this.products.find((item) => item.id === productId)
      const sku = product?.skus.find((item) => item.id === skuId)
      const nextStock = Math.max(0, Math.round(Number(stock) || 0))
      if (!product || !sku) return false
      const delta = nextStock - sku.stock
      if (!delta) return true
      const next = updateCatalogStock([{ productId, skuId, quantity: delta }], this.catalogRevision)
      if (!next) {
        this.refreshCatalog()
        this.checkoutError = '商品库存已更新，请重试'
        return false
      }
      this.applyCatalogState(next)
      return true
    },
    toggleListed(productId: string) {
      const product = this.selectableProducts.find((item) => item.id === productId)
      const selection = this.catalogSelections.find((item) => item.productId === productId)
      if (!product || !selection) return false
      const saved = saveStoreCatalogSelection({ ...selection, listed: !selection.listed }, this.selectionRevision)
      if (!saved) {
        this.refreshCatalog()
        this.checkoutError = '门店选品已更新，请重新提交'
        return false
      }
      return this.refreshCatalog()
    },
    listProduct(productId: string, retailPrice: number | Record<string, number>) {
      const source = this.selectableProducts.find((item) => item.id === productId)
      if (!source) return false
      const skuRetailPrices = typeof retailPrice === 'number'
        ? Object.fromEntries(source.skus.map((sku) => [sku.id, round2(sku.price + (retailPrice - source.price))]))
        : Object.fromEntries(Object.entries(retailPrice).map(([skuId, price]) => [skuId, round2(Number(price))]))
      if (source.skus.some((sku) => !Number.isFinite(skuRetailPrices[sku.id]) || skuRetailPrices[sku.id] <= sku.cost)) return false
      const storeId = this.tenant?.farmId || this.farm?.id || 'F001'
      if (!saveStoreCatalogSelection({ storeId, productId, listed: true, skuRetailPrices }, this.selectionRevision)) {
        this.refreshCatalog()
        this.checkoutError = '门店选品已更新，请重新提交'
        return false
      }
      return this.refreshCatalog()
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
    addExperience(payload: Omit<FarmExperience, 'id' | 'updatedAt'>) {
      if (!payload.name.trim()) return false
      const experience: FarmExperience = { ...payload, id: createId('EXP'), updatedAt: new Date().toISOString() }
      if (!writePlatformExperience(experience)) return false
      this.experiences.unshift(experience)
      return true
    },
    updateExperience(id: string, payload: Omit<FarmExperience, 'id' | 'updatedAt'>) {
      const experience = this.experiences.find((item) => item.id === id)
      if (!experience || !payload.name.trim()) return false
      const next: FarmExperience = { ...experience, ...payload, id, updatedAt: new Date().toISOString() }
      if (!writePlatformExperience(next)) return false
      const index = this.experiences.findIndex((item) => item.id === id)
      this.experiences[index] = next
      return true
    },
    removeExperience(id: string) {
      const index = this.experiences.findIndex((item) => item.id === id)
      if (index < 0) return false
      if (!removePlatformExperience(id)) return false
      this.experiences.splice(index, 1)
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
    verifyBooking(id: string, amount: number) {
      const item = this.bookings.find((booking) => booking.id === id)
      const confirmedAmount = round2(Number(amount))
      if (!item || !isActiveBookingStatus(item.status) || !Number.isFinite(confirmedAmount) || confirmedAmount <= 0) return false
      const shared = readPlatformBookings()?.[id]
      const confirmedAt = new Date().toISOString()
      if (shared && !writePlatformBooking({ ...shared, status: 'completed', amount: confirmedAmount, amountConfirmedAt: confirmedAt, updatedAt: confirmedAt })) return false
      item.status = 'completed'
      item.amount = confirmedAmount
      return true
    },
    async redeemVoucher(id: string) {
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const stable = readStableFarmhouseSnapshot('voucher', farmId)
      if (!stable) return false
      const original = stable.snapshot
      const voucher = original.vouchers![id]
      if (!voucher || voucher.farmId !== farmId || voucher.status !== 'paid') return false
      const operationId = `farmhouse-voucher:${id}:redeem`
      const now = new Date().toLocaleString('zh-CN')
      const entryId = id + ':commission'
      const entry = original.ledger![entryId]
      const target = reusableFarmhouseTarget(operationId, original) || { variant: 'voucher' as const, farmId, vouchers: { ...original.vouchers!, [id]: { ...voucher, status: 'redeemed' as const, redeemedAt: now } }, ledger: entry?.status === 'pending' ? { ...original.ledger!, [entryId]: { ...entry, status: 'available' as const, updatedAt: now } } : cloneSeed(original.ledger!) }
      const result = await runLockedPlatformTransaction({ operationId, collections: farmhouseCollections('voucher'), original, target, recoveryHandlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY, recoverySchema: FARMHOUSE_COMMERCE_RECOVERY_SCHEMA, revisionChecks: farmhouseCollections('voucher').map((key) => ({ key, expectedRevision: stable.revisions[key] })), steps: [{ key: 'vouchers', apply: () => writePlatformVoucherOrders(target.vouchers!), rollback: () => writePlatformVoucherOrders(original.vouchers!) }, { key: 'ledger', apply: () => writePlatformCommissionLedger(target.ledger!), rollback: () => writePlatformCommissionLedger(original.ledger!) }] })
      if (!result.ok) this.checkoutError = result.fatal ? '券核销事务恢复失败，请联系平台处理' : '数据未完成，请重试'
      return result.ok
    },
    async refundVoucher(id: string) {
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      const stable = readStableFarmhouseSnapshot('voucher', farmId)
      if (!stable) return false
      const original = stable.snapshot
      const voucher = original.vouchers![id]
      if (!voucher || voucher.farmId !== farmId || voucher.status === 'refunded') return false
      const operationId = `farmhouse-voucher:${id}:refund`
      const now = new Date().toLocaleString('zh-CN')
      const entryId = id + ':commission'
      const entry = original.ledger![entryId]
      const target = reusableFarmhouseTarget(operationId, original) || { variant: 'voucher' as const, farmId, vouchers: { ...original.vouchers!, [id]: { ...voucher, status: 'refunded' as const, refundedAt: now } }, ledger: entry ? { ...original.ledger!, [entryId]: { ...entry, status: 'reversed' as const, reversalOf: entry.id, updatedAt: now } } : cloneSeed(original.ledger!) }
      const result = await runLockedPlatformTransaction({ operationId, collections: farmhouseCollections('voucher'), original, target, recoveryHandlerKey: FARMHOUSE_COMMERCE_RECOVERY_HANDLER_KEY, recoverySchema: FARMHOUSE_COMMERCE_RECOVERY_SCHEMA, revisionChecks: farmhouseCollections('voucher').map((key) => ({ key, expectedRevision: stable.revisions[key] })), steps: [{ key: 'vouchers', apply: () => writePlatformVoucherOrders(target.vouchers!), rollback: () => writePlatformVoucherOrders(original.vouchers!) }, { key: 'ledger', apply: () => writePlatformCommissionLedger(target.ledger!), rollback: () => writePlatformCommissionLedger(original.ledger!) }] })
      if (!result.ok) this.checkoutError = result.fatal ? '券退款事务恢复失败，请联系平台处理' : '数据未完成，请重试'
      return result.ok
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
        else this.cart.push({ productId: product.id, skuId: sku.id, skuName: sku.name, name: product.name, image: product.image, price: sku.price, stock: sku.stock, quantity, minimumOrderQuantity: normalizeMinimumOrderQuantity(sku.minimumOrderQuantity), unavailable: !validateCatalogSkuOrderQuantity(sku, quantity).ok })
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
        link: buildPortalUrl('user', 'pages/index/index', { promoter: 'member', activity: `farm:${this.tenant?.code || 'store'}` }, import.meta.env.VITE_PORTAL_ORIGIN || ''), shareCount: 1, lockedFans: 0,
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
        link: buildPortalUrl('user', 'pages/index/index', { activity: `product:${product.id}`, store: this.tenant?.code || 'store' }, import.meta.env.VITE_PORTAL_ORIGIN || ''), shareCount: 1, lockedFans: 0,
        estimatedCommission: 0, createdAt: new Date().toLocaleString('zh-CN')
      }
      this.promotionRecords.unshift(record)
      return record
    },
    async wechatLogin() {
      const { openid } = await simulateWechatLogin()
      this.auth = { isLoggedIn: true, openid }
      this.setAuthorizedIdentity(openid)
      return true
    },
    setAuthorizedIdentity(openid: string) {
      if (!openid.trim()) return null
      const linked = resolveUserIdByOpenid(openid)
      this.currentUserId = linked || resolveUserIdentity(openid)
      this.pendingUserId = ''
      if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', this.currentUserId)
      this.applyReferrerBinding()
      return this.currentUserId
    },
    loginWithAccount(account: string, password: string) {
      const match = this.storeAccounts.find((item) => item.farmId === this.tenant?.farmId && item.account === account && item.password === password && item.enabled)
      if (!match) return false
      this.auth = { isLoggedIn: true, openid: `mock_account_${account}` }
      this.role = match.role === 'owner' ? 'manager' : 'staff'
      this.loggedAccountId = match.id
      return true
    },
    buildOrderShareSideEffects(orderId: string, itemsOrAmount: number | Array<{ productId: string; quantity: number; price: number }>, checkoutSnapshot?: FarmhouseCommerceSnapshot, customerUserId = ''): { userBinding?: UserBinding; shareRecord?: ShareRecord } {
      const resolvedCustomerUserId = customerUserId || this.currentUserId
      const bindings = checkoutSnapshot?.bindings ?? readUserBindings() ?? {}
      const binding = bindings[resolvedCustomerUserId]
      const boundBinding = binding ? { ...binding, status: 'bound' as const, boundAt: binding.boundAt || new Date().toLocaleString('zh-CN') } : null
      if (typeof itemsOrAmount === 'number') {
        const share = resolveShare(boundBinding, readShareConfig(), itemsOrAmount)
        if (!share) return { userBinding: boundBinding || undefined }
        const beneficiary = boundBinding?.promoterId ? { promoterId: boundBinding.promoterId } : boundBinding?.staffAccountId ? { staffAccountId: boundBinding.staffAccountId } : {}
        return { userBinding: boundBinding || undefined, shareRecord: { id: `SR-${orderId}`, userId: resolvedCustomerUserId, orderId, orderAmount: itemsOrAmount, role: share.role, ...beneficiary, rate: share.rate, amount: share.amount, status: 'pending', createdAt: new Date().toLocaleString('zh-CN') } }
      }
      const orderAmount = round2(itemsOrAmount.reduce((sum, item) => sum + item.price * item.quantity, 0))
      if (orderAmount <= 0) return { userBinding: boundBinding || undefined }
      const promoterId = boundBinding?.promoterId
      const staffAccountId = boundBinding?.staffAccountId || (!promoterId
        ? (checkoutSnapshot?.storeAccounts ?? this.storeAccounts).find((account) => account.farmId === (checkoutSnapshot?.farmId || this.tenant?.farmId || this.farm?.id || 'F001') && account.role === 'owner' && account.enabled)?.id
        : undefined)
      const allocation = allocateStoreCatalogCommission(itemsOrAmount.map((item) => {
        const product = checkoutSnapshot?.catalog?.products.find((candidate) => candidate.id === item.productId) || this.products.find((candidate) => candidate.id === item.productId)
        return {
          unitPrice: item.price,
          quantity: item.quantity,
          promoterCommissionRate: product?.promoterCommissionRate ?? 0,
          storeCommissionRate: product?.storeCommissionRate ?? 0
        }
      }), promoterId ? { type: 'promoter', beneficiaryId: promoterId } : staffAccountId && boundBinding?.staffAccountId ? { type: 'staff', beneficiaryId: staffAccountId } : null, staffAccountId || '')
      if (!allocation || allocation.amount <= 0) return { userBinding: boundBinding || undefined }
      return { userBinding: boundBinding || undefined, shareRecord: {
        id: `SR-${orderId}`, userId: resolvedCustomerUserId, orderId, orderAmount,
        role: allocation.beneficiaryType === 'promoter' ? 'promoter' : 'staff',
        ...(allocation.beneficiaryType === 'promoter' ? { promoterId: allocation.beneficiaryId } : { staffAccountId: allocation.beneficiaryId }),
        rate: round2(allocation.amount / orderAmount * 100), amount: allocation.amount, status: 'pending',
        createdAt: new Date().toLocaleString('zh-CN')
      } }
    },
    resolveOrderShare(orderId: string, itemsOrAmount: number | Array<{ productId: string; quantity: number; price: number }>): boolean {
      const sideEffects = this.buildOrderShareSideEffects(orderId, itemsOrAmount)
      return applyFarmhouseTransactionSideEffects({ userBinding: sideEffects.userBinding, shareRecords: sideEffects.shareRecord ? [sideEffects.shareRecord] : undefined })
    },
    setReferrer(referrer: { type?: 'promoter' | 'staff'; name?: string; promoterId?: string; staffAccountId?: string; liveId?: string }) {
      this.referrer = referrer || {}
      this.applyReferrerBinding()
    },
    applyReferrerBinding() {
      if (!this.currentUserId) return false
      const bindings = readUserBindings() ?? {}
      const existing = bindings[this.currentUserId]
      if (existing && existing.status === 'bound') return false
      if (this.referrer.promoterId) {
        const promoter = promoters.find((item) => item.id === this.referrer.promoterId && item.status === 'active')
        if (!promoter) return false
        return upsertUserBinding({ userId: this.currentUserId, promoterId: promoter.id, status: 'pending' })
      } else if (this.referrer.staffAccountId) {
        const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
        const account = this.storeAccounts.find((item) => item.id === this.referrer.staffAccountId)
        if (!account || !account.enabled || !account.promoEnabled || account.farmId !== farmId) return false
        return upsertUserBinding({ userId: this.currentUserId, staffAccountId: account.id, status: 'pending' })
      }
      return false
    },
    addStoreAccount(payload: { name: string; account: string; password: string; role: StoreAccount['role']; promoEnabled?: boolean }) {
      const farmId = this.tenant?.farmId || this.farm?.id || 'F001'
      if (!payload.name.trim() || !payload.account.trim() || !payload.password.trim()) return false
      if (this.storeAccounts.some((item) => item.farmId === farmId && item.account === payload.account)) return false
      const nextAccounts = [{ id: createId('SA'), farmId, name: payload.name.trim(), account: payload.account.trim(), password: payload.password.trim(), role: payload.role, enabled: true, promoEnabled: payload.promoEnabled ?? false, createdAt: new Date().toLocaleString('zh-CN') }, ...this.storeAccounts]
      if (!writePlatformStoreAccounts(nextAccounts)) return false
      this.storeAccounts = nextAccounts
      return true
    },
    updateStoreAccount(id: string, payload: { name?: string; account?: string; password?: string; role?: StoreAccount['role']; enabled?: boolean; promoEnabled?: boolean }) {
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      if (!item) return false
      const nextItem = { ...item }
      if (payload.name !== undefined && payload.name.trim()) nextItem.name = payload.name.trim()
      if (payload.account !== undefined && payload.account.trim()) nextItem.account = payload.account.trim()
      if (payload.password !== undefined && payload.password.trim()) nextItem.password = payload.password.trim()
      if (payload.role !== undefined) nextItem.role = payload.role
      if (payload.enabled !== undefined) nextItem.enabled = payload.enabled
      if (payload.promoEnabled !== undefined) nextItem.promoEnabled = payload.promoEnabled
      const nextAccounts = this.storeAccounts.map((candidate) => candidate.id === id ? nextItem : candidate)
      if (!writePlatformStoreAccounts(nextAccounts)) return false
      this.storeAccounts = nextAccounts
      return true
    },
    toggleStoreAccount(id: string) {
      const item = this.storeAccounts.find((candidate) => candidate.id === id)
      if (!item) return false
      const nextAccounts = this.storeAccounts.map((candidate) => candidate.id === id ? { ...candidate, enabled: !candidate.enabled } : candidate)
      if (!writePlatformStoreAccounts(nextAccounts)) return false
      this.storeAccounts = nextAccounts
      return true
    },
    setDeliveryAddress(address: string) {
      this.deliveryAddress = address.trim()
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, openid: '' }
      this.currentUserId = ''
      this.pendingUserId = ''
      this.role = 'customer'
    }
  }
})
