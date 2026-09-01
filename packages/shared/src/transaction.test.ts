import { describe, expect, it, beforeEach } from 'vitest'
import * as shared from './index'
import { abortCatalogTransaction, clearPlatformJson, commitCatalogTransaction, createStrictSnapshotRecoveryHandlerRegistration, enqueuePlatformRecovery, initializePlatformRecoveryHandlers, markCatalogTransactionStockApplied, prepareCatalogTransaction, readCatalogTransactionJournal, readPlatformCollectionRevision, readPlatformCommissionRules, readPlatformCommissionSettlementRecords, readPlatformJson, readPlatformRecoveryQueue, readPlatformJournal, readPlatformSupplierSettlements, reconcilePendingPlatformTransactions, registerPlatformRecoveryHandler, resolveCatalogTransactionForRecovery, retryPlatformRecoveryTask, runLockedPlatformCollectionTask, runPlatformTransaction, subscribePlatformChanges, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, resolvePlatformRecoveryTask, writePlatformCommissionRules, writePlatformCommissionSettlementRecords, writePlatformJson, writePlatformSupplierSettlements, writeVersionedRecord } from './index'
import type { PlatformRecoveryHandlerKey } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('platform transaction adapter', () => {
  beforeEach(() => {
    localStorage.clear()
    clearPlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY)
    clearPlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  })

  it('round-trips admin commission rules and settlement history snapshots', () => {
    const rules = [{ id: 'CR-1', name: '推客佣金', targetType: 'live' as const, rate: 8, enabled: true, updatedAt: '2026-08-30T10:00:00.000Z' }]
    const commissionHistory = { 'CS-SHARED': { id: 'CS-SHARED', promoterIds: ['T001'], amount: 8, createdAt: '2026-08-30T10:01:00.000Z', items: [{ promoterId: 'T001', promoterName: '共享推客', amount: 8 }] } }
    const supplierHistory = { 'ST-SHARED': { id: 'ST-SHARED', period: '2026-08', supplierIds: ['S001'], orderIds: ['O001'], amount: 100, status: 'pending', createdAt: '2026-08-30T10:02:00.000Z', items: [{ supplierId: 'S001', supplierName: '共享供应商', orderIds: ['O001'], amount: 100 }] } }

    expect(writePlatformCommissionRules(rules)).toBe(true)
    expect(writePlatformCommissionSettlementRecords(commissionHistory)).toBe(true)
    expect(writePlatformSupplierSettlements(supplierHistory)).toBe(true)
    expect(readPlatformCommissionRules()).toEqual(rules)
    expect(readPlatformCommissionSettlementRecords()).toEqual(commissionHistory)
    expect(readPlatformSupplierSettlements()).toEqual(supplierHistory)

    expect(writePlatformCommissionRules([])).toBe(true)
    expect(writePlatformCommissionSettlementRecords({})).toBe(true)
    expect(writePlatformSupplierSettlements({})).toBe(true)
    expect(readPlatformCommissionRules()).toEqual([])
    expect(readPlatformCommissionSettlementRecords()).toEqual({})
    expect(readPlatformSupplierSettlements()).toEqual({})
  })

  it('leaves an unowned legacy pending journal for manual verification during legacy reconciliation', () => {
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-LEGACY-MANUAL': { operationId: 'TX-LEGACY-MANUAL', collections: ['unrelated'], original: { value: 0 }, target: { value: 1 }, completedSteps: [], status: 'prepared', createdAt: now, updatedAt: now }
    }))

    expect(reconcilePendingPlatformTransactions('supplier-fulfillment-sync-v1' as PlatformRecoveryHandlerKey)).toMatchObject({ ok: true, value: 0 })
    expect(readPlatformRecoveryQueue()).toEqual([])
  })

  it('migrates a legacy pending journal only through an explicit reconciliation matcher', () => {
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-LEGACY-STORE': { operationId: 'TX-LEGACY-STORE', collections: ['store-return'], original: { value: 0 }, target: { value: 1 }, completedSteps: [], status: 'prepared', createdAt: now, updatedAt: now }
    }))

    expect(reconcilePendingPlatformTransactions({ handlerKey: 'store-return-completion-v1', matches: (journal) => journal.collections.includes('store-return') })).toMatchObject({ ok: true, value: 1 })
    expect(readPlatformRecoveryQueue()).toEqual([expect.objectContaining({ operationId: 'TX-LEGACY-STORE', handlerKey: 'store-return-completion-v1' })])
  })

  it('persists recovery ownership on every new transaction journal', () => {
    expect(runPlatformTransaction({
      operationId: 'TX-OWNED', collections: ['owned'], recoveryHandlerKey: 'owned-handler', recoverySchema: 'owned-v1',
      original: { value: 0 }, target: { value: 1 }, steps: [{ key: 'owned', apply: () => true, rollback: () => true }]
    })).toMatchObject({ ok: true })

    expect(readPlatformJournal()['TX-OWNED']).toMatchObject({ recoveryHandlerKey: 'owned-handler', recoverySchema: 'owned-v1' })
  })

  it('reopens an aborted transaction only when its complete journal identity matches', () => {
    expect(runPlatformTransaction({ operationId: 'TX-RETRY-ABORTED', collections: ['orders'], recoveryHandlerKey: 'retry-handler', recoverySchema: 'retry-v1', original: { value: 0 }, target: { value: 1 }, steps: [{ key: 'orders', apply: () => false }] })).toMatchObject({ ok: false })
    expect(readPlatformJournal()['TX-RETRY-ABORTED'].status).toBe('aborted')
    expect(runPlatformTransaction({ operationId: 'TX-RETRY-ABORTED', collections: ['orders'], recoveryHandlerKey: 'retry-handler', recoverySchema: 'retry-v1', original: { value: 0 }, target: { value: 1 }, steps: [{ key: 'orders', apply: () => true, rollback: () => true }] })).toMatchObject({ ok: true })
    expect(readPlatformJournal()['TX-RETRY-ABORTED'].status).toBe('committed')
  })

  it('allows a stock-applied catalog journal to be aborted after its stock snapshot is restored', () => {
    expect(prepareCatalogTransaction({ id: 'CATALOG-ABORT', channel: 'store', action: 'release', inventoryChanges: [{ productId: 'P1', skuId: 'S1', quantity: 1 }], payload: {} })).toBe(true)
    expect(markCatalogTransactionStockApplied('CATALOG-ABORT')).toBe(true)

    expect(abortCatalogTransaction('CATALOG-ABORT')).toBe(true)
  })

  it('keeps normal catalog transitions closed after commit but allows explicit recovery resolution', () => {
    expect(prepareCatalogTransaction({ id: 'CATALOG-RECOVERY-RESOLVE', channel: 'farmhouse', action: 'release', inventoryChanges: [{ productId: 'P1', skuId: 'S1', quantity: 1 }], payload: {} })).toBe(true)
    expect(markCatalogTransactionStockApplied('CATALOG-RECOVERY-RESOLVE')).toBe(true)
    expect(commitCatalogTransaction('CATALOG-RECOVERY-RESOLVE')).toBe(true)

    expect(abortCatalogTransaction('CATALOG-RECOVERY-RESOLVE')).toBe(false)
    expect(resolveCatalogTransactionForRecovery('CATALOG-RECOVERY-RESOLVE', 'aborted')).toBe(true)
    expect(readCatalogTransactionJournal()['CATALOG-RECOVERY-RESOLVE'].status).toBe('aborted')
  })

  it('reopens an aborted catalog journal only when its complete identity matches', () => {
    const input = { id: 'CATALOG-RETRY-ABORTED', channel: 'farmhouse' as const, action: 'release' as const, inventoryChanges: [{ productId: 'P1', skuId: 'S1', quantity: 1 }], payload: { orderId: 'O1' } }
    expect(prepareCatalogTransaction(input)).toBe(true)
    expect(abortCatalogTransaction(input.id)).toBe(true)

    expect(prepareCatalogTransaction({ ...input, payload: { orderId: 'O2' } })).toBe(false)
    expect(prepareCatalogTransaction(input)).toBe(true)
    expect(readCatalogTransactionJournal()[input.id].status).toBe('prepared')
    expect(markCatalogTransactionStockApplied(input.id)).toBe(true)
  })

  it('increments raw collection sidecar revisions and rejects stale expected revisions', () => {
    const key = 'raw-transaction-orders'

    expect(readPlatformCollectionRevision(key)).toBe(0)
    expect(writePlatformJson(key, { value: 1 }, 0)).toBe(true)
    expect(readPlatformCollectionRevision(key)).toBe(1)
    expect(writePlatformJson(key, { value: 2 }, 0)).toBe(false)
    expect(JSON.parse(localStorage.getItem(key) || '{}')).toEqual({ value: 1 })
    expect(writePlatformJson(key, { value: 2 }, 1)).toBe(true)
    expect(readPlatformCollectionRevision(key)).toBe(2)
  })

  it('restores a raw payload and its sidecar revision when the sidecar write fails', () => {
    const key = 'raw-transaction-sidecar-failure'
    expect(writePlatformJson(key, { value: 'before' }, 0)).toBe(true)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((storageKey: string, value: string) => {
      if (storageKey === `${key}:revision`) throw new Error('sidecar unavailable')
      originalSetItem(storageKey, value)
    }) as Storage['setItem']
    try {
      expect(writePlatformJson(key, { value: 'after' }, 1)).toBe(false)
    } finally {
      localStorage.setItem = originalSetItem
    }

    expect(JSON.parse(localStorage.getItem(key) || '{}')).toEqual({ value: 'before' })
    expect(readPlatformCollectionRevision(key)).toBe(1)
  })

  it('returns false without writing or notifying when the raw payload snapshot read fails', () => {
    const key = 'raw-transaction-payload-read-failure'
    localStorage.setItem(key, JSON.stringify({ value: 'before' }))
    const changes: string[] = []
    const unsubscribe = subscribePlatformChanges((event) => changes.push(event.key))
    const originalGetItem = localStorage.getItem.bind(localStorage)
    localStorage.getItem = ((storageKey: string) => {
      if (storageKey === key) throw new Error('payload unavailable')
      return originalGetItem(storageKey)
    }) as Storage['getItem']
    try {
      expect(writePlatformJson(key, { value: 'after' })).toBe(false)
    } finally {
      localStorage.getItem = originalGetItem
      unsubscribe()
    }

    expect(JSON.parse(localStorage.getItem(key) || '{}')).toEqual({ value: 'before' })
    expect(changes).toEqual([])
  })

  it('returns false without writing or notifying when the sidecar snapshot read fails', () => {
    const key = 'raw-transaction-sidecar-read-failure'
    localStorage.setItem(key, JSON.stringify({ value: 'before' }))
    localStorage.setItem(`${key}:revision`, '1')
    const changes: string[] = []
    const unsubscribe = subscribePlatformChanges((event) => changes.push(event.key))
    const originalGetItem = localStorage.getItem.bind(localStorage)
    localStorage.getItem = ((storageKey: string) => {
      if (storageKey === `${key}:revision`) throw new Error('sidecar unavailable')
      return originalGetItem(storageKey)
    }) as Storage['getItem']
    try {
      expect(writePlatformJson(key, { value: 'after' })).toBe(false)
    } finally {
      localStorage.getItem = originalGetItem
      unsubscribe()
    }

    expect(JSON.parse(localStorage.getItem(key) || '{}')).toEqual({ value: 'before' })
    expect(changes).toEqual([])
  })

  it('never creates a nested revision sidecar for a raw collection', () => {
    const key = 'raw-transaction-no-nested-sidecar'

    expect(writePlatformJson(key, { value: 1 }, 0)).toBe(true)
    expect(localStorage.getItem(`${key}:revision:revision`)).toBeNull()
  })

  it('checks raw collection sidecar revisions before applying a transaction step', () => {
    expect(writePlatformJson('raw-transaction-inventory', { stock: 3 }, 0)).toBe(true)
    let applied = false

    expect(runPlatformTransaction({
      operationId: 'TX-RAW-REVISION-CONFLICT',
      collections: ['raw-transaction-inventory'],
      revisionChecks: [{ key: 'raw-transaction-inventory', expectedRevision: 0 }],
      steps: [{ key: 'inventory', apply: () => { applied = true; return true }, rollback: () => true }]
    })).toMatchObject({ ok: false, reason: 'revision-conflict' })
    expect(applied).toBe(false)
  })

  it('creates recovery tasks for pending journals that have no pending task', () => {
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-PREPARED': { operationId: 'TX-PREPARED', collections: ['orders'], original: { value: 0 }, target: { value: 1 }, recoveryHandlerKey: 'production-reconcile', recoverySchema: 'test-v1', completedSteps: [], status: 'prepared', createdAt: now, updatedAt: now },
      'TX-RECOVERY-PENDING': { operationId: 'TX-RECOVERY-PENDING', collections: ['commissions'], original: { value: 1 }, target: { value: 2 }, recoveryHandlerKey: 'production-reconcile', recoverySchema: 'test-v1', completedSteps: ['commissions'], status: 'recovery-pending', createdAt: now, updatedAt: now }
    }))

    expect(reconcilePendingPlatformTransactions('production-reconcile' as PlatformRecoveryHandlerKey)).toMatchObject({ ok: true, value: 2 })
    expect(readPlatformRecoveryQueue()).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: 'TX-PREPARED', failedStep: 'reconciliation', handlerKey: 'production-reconcile', status: 'pending' }),
      expect.objectContaining({ operationId: 'TX-RECOVERY-PENDING', failedStep: 'reconciliation', handlerKey: 'production-reconcile', status: 'pending' })
    ]))
  })

  it('reconciles idempotently without replacing an existing recovery handler key', () => {
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-EXISTING-RECOVERY': { operationId: 'TX-EXISTING-RECOVERY', collections: ['orders'], original: {}, target: {}, completedSteps: [], status: 'recovery-pending', createdAt: now, updatedAt: now }
    }))
    expect(enqueuePlatformRecovery({ operationId: 'TX-EXISTING-RECOVERY', failedStep: 'orders', reason: 'original failure', handlerKey: 'test-handler' })).toBe(true)

    expect(reconcilePendingPlatformTransactions('production-reconcile' as PlatformRecoveryHandlerKey)).toMatchObject({ ok: true, value: 0 })
    expect(reconcilePendingPlatformTransactions('production-reconcile' as PlatformRecoveryHandlerKey)).toMatchObject({ ok: true, value: 0 })
    expect(readPlatformRecoveryQueue()).toEqual([expect.objectContaining({ operationId: 'TX-EXISTING-RECOVERY', handlerKey: 'test-handler' })])
  })

  it('initializes production handlers without overwriting unrelated registered handlers', async () => {
    const now = new Date().toISOString()
    const unregister = registerPlatformRecoveryHandler('test-only-handler', { execute: () => true, readSnapshot: () => ({ value: 0 }) })
    try {
      localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
        'TX-TEST-HANDLER': { operationId: 'TX-TEST-HANDLER', collections: ['orders'], original: { value: 0 }, target: { value: 1 }, completedSteps: [], status: 'recovery-pending', createdAt: now, updatedAt: now }
      }))
      expect(enqueuePlatformRecovery({ operationId: 'TX-TEST-HANDLER', failedStep: 'orders', reason: 'test recovery', handlerKey: 'test-only-handler' })).toBe(true)

      initializePlatformRecoveryHandlers([{
        key: 'production-handler' as PlatformRecoveryHandlerKey,
        handler: { execute: () => true, readSnapshot: () => ({ value: 1 }) }
      }])

      expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    } finally {
      unregister()
    }
  })

  it('keeps the first production handler when initialization repeats the same key', async () => {
    const key = 'production-idempotent-handler' as PlatformRecoveryHandlerKey
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-PRODUCTION-IDEMPOTENT': { operationId: 'TX-PRODUCTION-IDEMPOTENT', collections: ['orders'], original: { value: 'first' }, target: { value: 'second' }, completedSteps: [], status: 'recovery-pending', createdAt: now, updatedAt: now }
    }))
    expect(enqueuePlatformRecovery({ operationId: 'TX-PRODUCTION-IDEMPOTENT', failedStep: 'orders', reason: 'test recovery', handlerKey: key })).toBe(true)

    initializePlatformRecoveryHandlers([{ key, handler: { execute: () => true, readSnapshot: () => ({ value: 'first' }) } }])
    initializePlatformRecoveryHandlers([{ key, handler: { execute: () => true, readSnapshot: () => ({ value: 'second' }) } }])

    expect(await retryPlatformRecoveryTask(readPlatformRecoveryQueue()[0].id, 'ADMIN-1')).toMatchObject({ ok: true })
    expect(readPlatformJournal()['TX-PRODUCTION-IDEMPOTENT'].status).toBe('aborted')
  })

  it('exposes stable production recovery handler keys and a registration factory', () => {
    type ProductionRecoveryApi = {
      PLATFORM_PRODUCTION_RECOVERY_HANDLER_KEYS?: readonly string[]
      createPlatformProductionRecoveryHandlerRegistration?: (key: string, handler: { execute: () => boolean; readSnapshot: () => unknown }) => { key: string }
    }
    const production = shared as ProductionRecoveryApi

    expect(production.PLATFORM_PRODUCTION_RECOVERY_HANDLER_KEYS).toEqual(expect.arrayContaining([
      'user-receipt-v1', 'user-after-sale-v1', 'user-payment-v1', 'user-package-v1',
      'store-order-v1', 'store-return-completion-v1',
      'farmhouse-refund-v1', 'farmhouse-voucher-v1',
      'supplier-commit-v1', 'supplier-fulfillment-sync-v1',
      'admin-fulfillment-v1', 'admin-settlement-v1', 'admin-after-sale-v1'
    ]))
    expect(production.createPlatformProductionRecoveryHandlerRegistration).toBeTypeOf('function')
    expect(production.createPlatformProductionRecoveryHandlerRegistration!('user-receipt-v1', { execute: () => true, readSnapshot: () => ({}) })).toEqual(expect.objectContaining({ key: 'user-receipt-v1' }))
  })

  it('rolls back completed steps when a later step fails', () => {
    const state = { value: 0 }
    const result = runPlatformTransaction({
      operationId: 'TX-ROLLBACK', collections: ['a', 'b'], original: { value: 0 }, target: { value: 2 },
      steps: [
        { key: 'a', apply: () => { state.value = 1; return true }, rollback: () => { state.value = 0; return true } },
        { key: 'b', apply: () => false }
      ]
    })
    expect(result.ok).toBe(false)
    expect(state.value).toBe(0)
    expect(readPlatformJournal()['TX-ROLLBACK'].status).toBe('aborted')
  })

  it('catches apply exceptions and rolls back completed steps', () => {
    const state = { value: 0 }
    const result = runPlatformTransaction({
      operationId: 'TX-APPLY-THROWS', collections: ['a', 'b'],
      steps: [
        { key: 'a', apply: () => { state.value = 1; return true }, rollback: () => { state.value = 0; return true } },
        { key: 'b', apply: () => { throw new Error('apply exploded') } }
      ]
    })
    expect(result).toMatchObject({ ok: false, failedStep: 'b', reason: 'step-threw' })
    expect(state.value).toBe(0)
    expect(readPlatformJournal()['TX-APPLY-THROWS'].status).toBe('aborted')
  })

  it('continues rolling back earlier steps when a later rollback throws', () => {
    const rolledBack: string[] = []
    const result = runPlatformTransaction({
      operationId: 'TX-ROLLBACK-THROWS', collections: ['a', 'b', 'c'],
      steps: [
        { key: 'a', apply: () => true, rollback: () => { rolledBack.push('a'); return true } },
        { key: 'b', apply: () => true, rollback: () => { rolledBack.push('b'); throw new Error('rollback exploded') } },
        { key: 'c', apply: () => false }
      ]
    })
    expect(result.ok).toBe(false)
    expect(rolledBack).toEqual(['b', 'a'])
    expect(readPlatformJournal()['TX-ROLLBACK-THROWS'].status).toBe('recovery-pending')
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ failedStep: 'c', retryCount: 0, status: 'pending' })
  })

  it('queues recovery and reports failure when a journal step cannot be persisted', () => {
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && ++journalWrites === 2) throw new Error('journal unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      const state = { value: 0 }
      const result = runPlatformTransaction({
        operationId: 'TX-JOURNAL-STEP-FAIL', collections: ['a'],
        steps: [{ key: 'a', apply: () => { state.value = 1; return true }, rollback: () => { state.value = 0; return true } }]
      })
      expect(result).toMatchObject({ ok: false, failedStep: 'a', reason: 'journal-step-write-failed' })
      expect(state.value).toBe(0)
      expect(readPlatformRecoveryQueue()[0]).toMatchObject({ operationId: 'TX-JOURNAL-STEP-FAIL', failedStep: 'a' })
    } finally {
      localStorage.setItem = originalSetItem
    }
  })

  it('treats an applied step without rollback as recovery pending', () => {
    const result = runPlatformTransaction({
      operationId: 'TX-MISSING-ROLLBACK', collections: ['a', 'b'],
      steps: [{ key: 'a', apply: () => true }, { key: 'b', apply: () => false }]
    })
    expect(result).toMatchObject({ ok: false, recoveryQueued: true })
    expect(readPlatformJournal()['TX-MISSING-ROLLBACK'].status).toBe('recovery-pending')
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ operationId: 'TX-MISSING-ROLLBACK' })
  })

  it('reports a fatal recovery persistence failure', () => {
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_RECOVERY_QUEUE_STORAGE_KEY) throw new Error('recovery unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      const result = runPlatformTransaction({
        operationId: 'TX-RECOVERY-WRITE-FAIL', collections: ['a', 'b'],
        steps: [{ key: 'a', apply: () => true }, { key: 'b', apply: () => false }]
      })
      expect(result).toMatchObject({ ok: false, reason: 'recovery-queue-write-failed', recoveryQueued: false, fatal: true })
      expect(readPlatformRecoveryQueue()).toEqual([])
    } finally {
      localStorage.setItem = originalSetItem
    }
  })

  it('queues recovery when the final committed journal status cannot be persisted', () => {
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && ++journalWrites === 3) throw new Error('commit unavailable')
      originalSetItem(key, value)
    }) as Storage['setItem']
    try {
      const result = runPlatformTransaction({
        operationId: 'TX-COMMIT-FAIL', collections: ['a'],
        steps: [{ key: 'a', apply: () => true, rollback: () => true }]
      })
      expect(result).toMatchObject({ ok: false, failedStep: 'journal', reason: 'journal-resolve-failed', recoveryQueued: true })
      expect(readPlatformRecoveryQueue()[0]).toMatchObject({ operationId: 'TX-COMMIT-FAIL', failedStep: 'journal' })
    } finally {
      localStorage.setItem = originalSetItem
    }
  })

  it('rejects a stale repository revision before applying any step', () => {
    expect(writeVersionedRecord('versioned-orders', { revision: 1, updatedAt: new Date().toISOString(), data: { value: 1 } }, 0)).toBe(true)
    let applied = false
    expect(runPlatformTransaction({
      operationId: 'TX-REVISION-CONFLICT', collections: ['orders'], revisionChecks: [{ key: 'versioned-orders', expectedRevision: 0 }],
      steps: [{ key: 'orders', apply: () => { applied = true; return true }, rollback: () => true }]
    })).toMatchObject({ ok: false, reason: 'revision-conflict' })
    expect(applied).toBe(false)
  })

  it('queues recovery when rollback fails and only resolves after retry verification', async () => {
    const snapshot = { value: 1 }
    const result = runPlatformTransaction({
      operationId: 'TX-RECOVERY', collections: ['a', 'b'], original: { value: 0 }, target: { value: 2 }, recoveryHandlerKey: 'restore-value',
      steps: [
        { key: 'a', apply: () => true, rollback: () => false },
        { key: 'b', apply: () => false }
      ]
    })
    expect(result.ok).toBe(false)
    const task = readPlatformRecoveryQueue()[0]
    expect(task).toMatchObject({ status: 'pending', handlerKey: 'restore-value', retryCount: 0 })
    expect(resolvePlatformRecoveryTask(task.id)).toBe(false)

    const unregister = registerPlatformRecoveryHandler('restore-value', {
      execute: () => { snapshot.value = 0; return true },
      readSnapshot: () => ({ ...snapshot })
    })
    expect(await retryPlatformRecoveryTask(task.id, 'ADMIN-1')).toMatchObject({ ok: true })
    unregister()
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ status: 'resolved', retryCount: 1, resolvedBy: 'ADMIN-1' })
    expect(readPlatformRecoveryQueue()[0].resolvedAt).toBeTruthy()
    expect(readPlatformJournal()['TX-RECOVERY'].status).toBe('aborted')
  })

  it('waits for every journal collection and rejects a third state written before recovery acquires the lock', async () => {
    const businessKey = 'recovery-business-lock'
    const operationId = 'TX-RECOVERY-LOCK-WAIT'
    const original = { value: 0 }
    const target = { value: 2 }
    expect(writePlatformJson(businessKey, target)).toBe(true)
    const now = new Date().toISOString()
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      [operationId]: { operationId, collections: [businessKey], original, target, recoveryHandlerKey: 'supplier-commit-v1', recoverySchema: 'lock-wait-v1', completedSteps: ['business'], status: 'recovery-pending', createdAt: now, updatedAt: now }
    }))
    expect(enqueuePlatformRecovery({ operationId, failedStep: 'business', reason: 'lock wait test', handlerKey: 'supplier-commit-v1' })).toBe(true)
    const registration = createStrictSnapshotRecoveryHandlerRegistration<{ value: number }, number>({
      key: 'supplier-commit-v1',
      fields: ['value'],
      validateJournal: (journal) => journal.operationId === operationId && journal.recoverySchema === 'lock-wait-v1',
      readStable: () => {
        const before = readPlatformCollectionRevision(businessKey)
        const snapshot = readPlatformJson<{ value: number }>(businessKey)
        const after = readPlatformCollectionRevision(businessKey)
        return snapshot && before === after ? { snapshot, token: after } : null
      },
      isStillStable: (revision) => readPlatformCollectionRevision(businessKey) === revision,
      writeSnapshot: (snapshot) => writePlatformJson(businessKey, snapshot)
    })
    const unregister = registerPlatformRecoveryHandler(registration.key, registration.handler)
    let releaseLock!: () => void
    let signalLocked!: () => void
    const locked = new Promise<void>((resolve) => { signalLocked = resolve })
    const holder = runLockedPlatformCollectionTask({
      collections: [businessKey],
      execute: async () => {
        signalLocked()
        await new Promise<void>((resolve) => { releaseLock = resolve })
        return true
      }
    })
    await locked
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)!
    const retry = retryPlatformRecoveryTask(task.id, 'ADMIN-LOCK')
    expect(writePlatformJson(businessKey, { value: 3 })).toBe(true)
    const setItem = localStorage.setItem.bind(localStorage)
    let businessWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === businessKey) businessWrites += 1
      setItem(key, value)
    }) as Storage['setItem']
    releaseLock()
    await holder
    try {
      expect(await retry).toMatchObject({ ok: false, code: 'handler-failed' })
    } finally {
      localStorage.setItem = setItem
      unregister()
    }
    expect(businessWrites).toBe(0)
    expect(readPlatformJson(businessKey)).toEqual({ value: 3 })
    expect(readPlatformRecoveryQueue().find((item) => item.id === task.id)).toMatchObject({ status: 'pending', retryCount: 1 })
  })

  it('keeps a recovery task pending when retry readback matches neither snapshot', async () => {
    expect(enqueuePlatformRecovery({ operationId: 'TX-MISMATCH', failedStep: 'orders', reason: 'rollback failed', handlerKey: 'mismatch' })).toBe(true)
    const journals = {
      'TX-MISMATCH': { operationId: 'TX-MISMATCH', collections: ['orders'], original: { value: 0 }, target: { value: 2 }, completedSteps: [], status: 'recovery-pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify(journals))
    const unregister = registerPlatformRecoveryHandler('mismatch', { execute: () => true, readSnapshot: () => ({ value: 1 }) })
    const task = readPlatformRecoveryQueue()[0]
    expect(await retryPlatformRecoveryTask(task.id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'snapshot-mismatch' })
    unregister()
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ status: 'pending', retryCount: 1, lastError: 'snapshot-mismatch' })
  })

  it('requires a note to manually resolve a legacy task without a handler', () => {
    expect(enqueuePlatformRecovery({ operationId: 'TX-LEGACY', failedStep: 'orders', reason: 'legacy task' })).toBe(true)
    const task = readPlatformRecoveryQueue()[0]
    expect(resolvePlatformRecoveryTask(task.id)).toBe(false)
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-LEGACY': { operationId: 'TX-LEGACY', collections: ['orders'], original: {}, target: {}, completedSteps: [], status: 'recovery-pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }))
    expect(resolvePlatformRecoveryTask(task.id, { resolvedBy: 'ADMIN-1', note: '已对照订单与佣金原始快照，数据一致', outcome: 'aborted' })).toBe(true)
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ status: 'resolved', resolvedBy: 'ADMIN-1', resolutionNote: '已对照订单与佣金原始快照，数据一致' })
    expect(readPlatformJournal()['TX-LEGACY'].status).toBe('aborted')
  })

  it('allows manual verification when a named handler is not registered', () => {
    expect(enqueuePlatformRecovery({ operationId: 'TX-UNREGISTERED', failedStep: 'orders', reason: 'handler unavailable', handlerKey: 'not-loaded' })).toBe(true)
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-UNREGISTERED': { operationId: 'TX-UNREGISTERED', collections: ['orders'], original: {}, target: {}, completedSteps: [], status: 'recovery-pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }))
    const task = readPlatformRecoveryQueue()[0]
    expect(resolvePlatformRecoveryTask(task.id, { resolvedBy: 'ADMIN-1', note: '处理器未加载，已人工核验目标快照', outcome: 'committed' })).toBe(true)
    expect(readPlatformJournal()['TX-UNREGISTERED'].status).toBe('committed')
  })

  it('keeps retry failures observable when a snapshot cannot be serialized', async () => {
    expect(enqueuePlatformRecovery({ operationId: 'TX-CIRCULAR', failedStep: 'orders', reason: 'rollback failed', handlerKey: 'circular' })).toBe(true)
    localStorage.setItem(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, JSON.stringify({
      'TX-CIRCULAR': { operationId: 'TX-CIRCULAR', collections: ['orders'], original: {}, target: {}, completedSteps: [], status: 'recovery-pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }))
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const unregister = registerPlatformRecoveryHandler('circular', { execute: () => true, readSnapshot: () => circular })
    const task = readPlatformRecoveryQueue()[0]
    expect(await retryPlatformRecoveryTask(task.id, 'ADMIN-1')).toMatchObject({ ok: false, code: 'snapshot-unreadable' })
    unregister()
    expect(readPlatformRecoveryQueue()[0]).toMatchObject({ status: 'pending', retryCount: 1, lastError: 'snapshot-unreadable' })
  })
})
