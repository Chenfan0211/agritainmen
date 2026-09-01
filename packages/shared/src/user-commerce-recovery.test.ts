import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_SCHEMA_VERSION,
  PLATFORM_CATALOG_STORAGE_KEY,
  PLATFORM_COMMISSION_LEDGER_STORAGE_KEY,
  PLATFORM_C_ORDERS_STORAGE_KEY,
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_RECOVERY_QUEUE_STORAGE_KEY,
  PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
  PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY,
  PLATFORM_VOUCHERS_STORAGE_KEY,
  cloneSeed,
  createUserAtomicRecoveryHandlerRegistrations,
  enqueuePlatformRecovery,
  initializePlatformRecoveryHandlers,
  isValidUserAtomicRecoveryJournal,
  preparePlatformJournal,
  publishCSubOrderToSupplier,
  readCOrders,
  readPlatformCollectionRevision,
  readPlatformCommissionLedger,
  readPlatformJournal,
  readPlatformOrders,
  readPlatformRecoveryQueue,
  readUserCommercePurchaseIntents,
  resolvePlatformJournal,
  retryPlatformRecoveryTask,
  writeCOrders,
  writePlatformCommissionLedger,
  writePlatformOrders,
  writeUserCommercePurchaseIntents
} from './index'
import type { COrder, UserCommercePurchaseIntent } from './index'

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

describe('shared user atomic recovery handlers', () => {
  beforeEach(() => {
    localStorage.clear()
    initializePlatformRecoveryHandlers(createUserAtomicRecoveryHandlerRegistrations())
  })

  it('filters corrupted persisted package purchase intents', () => {
    const valid = { ownerUserId: 'U-VALID', productId: 'P-VALID', skuId: 'SKU-VALID', quantity: 1, amount: 100, operationId: 'package-payment:VO-VALID' }
    localStorage.setItem(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, JSON.stringify({
      [valid.operationId]: valid,
      mismatch: { ...valid, operationId: 'package-payment:VO-MISMATCH' },
      unsafe: { ...valid, operationId: 'javascript:alert(1)' },
      extra: { ...valid, operationId: 'package-payment:VO-EXTRA', secret: 'must-not-survive' },
      zero: { ...valid, operationId: 'package-payment:VO-ZERO', amount: 0 }
    }))

    expect(readUserCommercePurchaseIntents()).toEqual({ [valid.operationId]: valid })
  })

  it('rejects a stale revision when replacing package purchase intents', () => {
    const operationId = 'package-payment:VO-INTENT-CAS'
    const intent: UserCommercePurchaseIntent = { ownerUserId: 'U-INTENT-CAS', productId: 'P-INTENT-CAS', skuId: 'SKU-INTENT-CAS', quantity: 1, amount: 100, operationId }
    expect(writeUserCommercePurchaseIntents({ [operationId]: intent }, 0)).toBe(true)
    const revision = readPlatformCollectionRevision(PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY)
    const concurrent = { ...intent, amount: 125 }
    expect(writeUserCommercePurchaseIntents({ [operationId]: concurrent }, revision)).toBe(true)

    expect(writeUserCommercePurchaseIntents({}, revision)).toBe(false)
    expect(readUserCommercePurchaseIntents()).toEqual({ [operationId]: concurrent })
  })

  it('rejects package recovery snapshots containing a malformed unrelated intent', () => {
    const operationId = 'package-payment:VO-RECOVERY-SAFE'
    const product = {
      id: 'P-PACKAGE-RECOVERY', name: '恢复套餐', category: '套餐', supplierId: 'S001', supplierName: '供应商', source: 'platform' as const,
      status: 'active' as const, image: '', images: [], tags: [], productType: 'package' as const, expressDelivery: false, channel: 'store' as const,
      farmIds: ['F001'], promoterCommissionRate: 0, storeCommissionRate: 0,
      skus: [{ id: 'SKU-PACKAGE-RECOVERY', name: '标准', image: '', retailPrice: 100, cost: 80, stock: 5, level1Amount: 0, level2Amount: 0, status: 'active' as const }]
    }
    const intent: UserCommercePurchaseIntent = { ownerUserId: 'U-PACKAGE-RECOVERY', productId: product.id, skuId: product.skus[0].id, quantity: 1, amount: 100, operationId }
    const original = {
      variant: 'package', ownerUserId: intent.ownerUserId,
      catalog: { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [product], appliedOperations: {} },
      vouchers: {}, ledger: {}, intents: { [operationId]: intent } as Record<string, UserCommercePurchaseIntent>
    }
    const target = cloneSeed(original)
    target.catalog.revision = 3
    target.catalog.products[0].skus[0].stock = 4
    target.catalog.appliedOperations = { [operationId]: { id: operationId, action: 'reserve', requestFingerprint: JSON.stringify({ action: 'reserve', changes: [{ productId: product.id, skuId: product.skus[0].id, quantity: -1 }] }), changes: [], appliedAt: '2026-08-30T00:00:00.000Z' } }
    target.vouchers = { 'VO-RECOVERY-SAFE': { id: 'VO-RECOVERY-SAFE', userId: intent.ownerUserId, farmId: 'F001', productId: product.id, skuId: product.skus[0].id, quantity: 1, amount: 100, status: 'paid', createdAt: '2026-08-30T00:00:00.000Z', providerTransactionId: 'TX-SAFE' } }
    target.intents = {}
    const journal = {
      operationId,
      collections: [PLATFORM_CATALOG_STORAGE_KEY, PLATFORM_VOUCHERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_USER_COMMERCE_INTENTS_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY],
      original, target, recoveryHandlerKey: 'user-package-v1', recoverySchema: 'user-package-snapshot-v1', completedSteps: [], status: 'recovery-pending' as const,
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z'
    }
    expect(isValidUserAtomicRecoveryJournal(journal, 'package')).toBe(true)
    const malformed = cloneSeed(journal)
    const unrelatedKey = 'package-payment:VO-UNRELATED'
    malformed.original.intents[unrelatedKey] = { ...intent, operationId: 'javascript:alert(1)', secret: 'forged' } as never
    malformed.target.intents[unrelatedKey] = cloneSeed(malformed.original.intents[unrelatedKey])

    expect(isValidUserAtomicRecoveryJournal(malformed, 'package')).toBe(false)
  })

  it('recovers a valid partial payment snapshot without loading the user store', async () => {
    const item = { productId: 'P-SHARED-RECOVERY', skuId: 'SKU-SHARED-RECOVERY', name: '恢复商品', skuName: '标准装', image: '', quantity: 1, unitPrice: 45, basePrice: 35, level1Commission: 0, level2Commission: 0, supplierId: 'S001' }
    const order: COrder = {
      id: 'CO-SHARED-RECOVERY', userId: 'U-SHARED-RECOVERY', level: 'normal',
      address: { id: 'ADDR-SHARED-RECOVERY', userId: 'U-SHARED-RECOVERY', receiver: '恢复用户', phone: '13800000000', region: '湖南', detail: '测试地址', isDefault: true },
      amount: 45, items: [item],
      subOrders: [{ id: 'CSO-SHARED-RECOVERY', supplierId: 'S001', supplierName: '供应商', items: [item], amount: 45, status: 'pending_payment', logistics: [] }],
      commissionAllocations: [], status: 'pending_payment', createdAt: '2026-08-30T00:00:00.000Z'
    }
    expect(writeCOrders({ [order.id]: order })).toBe(true)
    const persistedOrder = readCOrders()![order.id]
    const paid = cloneSeed(persistedOrder)
    paid.status = 'paid'
    paid.paidAt = '2026-08-30T00:01:00.000Z'
    paid.providerTransactionId = 'TX-SHARED-RECOVERY'
    paid.subOrders[0].status = 'paid'
    paid.subOrders[0].logistics.push(
      { time: '2026-08-30T00:01:00.000Z', title: '支付成功', detail: '订单已进入供应商备货流程' },
      { time: '2026-08-30T00:01:00.000Z', title: '等待发货', detail: '供应商准备发货，暂无运单号' }
    )
    const supplierOrder = publishCSubOrderToSupplier(paid, paid.subOrders[0])
    const original = { variant: 'payment', ownerUserId: persistedOrder.userId, orders: { [persistedOrder.id]: persistedOrder }, supplierOrders: {}, ledger: {} }
    const target = { ...cloneSeed(original), orders: { [paid.id]: paid }, supplierOrders: { [supplierOrder.id]: supplierOrder } }
    const operationId = `payment:${order.id}`
    expect(writePlatformOrders(target.supplierOrders)).toBe(true)
    expect(writePlatformCommissionLedger({})).toBe(true)
    expect(preparePlatformJournal({
      operationId,
      collections: [PLATFORM_C_ORDERS_STORAGE_KEY, PLATFORM_ORDERS_STORAGE_KEY, PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY],
      original,
      target,
      recoveryHandlerKey: 'user-payment-v1',
      recoverySchema: 'user-payment-snapshot-v1'
    })).toBe(true)
    expect(resolvePlatformJournal(operationId, 'recovery-pending')).toBe(true)
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'c-orders', reason: 'partial payment write', handlerKey: 'user-payment-v1' })).toBe(true)
    expect(isValidUserAtomicRecoveryJournal(readPlatformJournal()[operationId], 'payment')).toBe(true)

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readCOrders()).toEqual(original.orders)
    expect(readPlatformOrders()).toEqual(original.supplierOrders)
    expect(readPlatformCommissionLedger()).toEqual(original.ledger)
  })
})
