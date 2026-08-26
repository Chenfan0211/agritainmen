import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  CATALOG_SCHEMA_VERSION,
  IndexedDbPlatformRepository,
  MemoryPlatformRepository,
  PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY,
  PLATFORM_CATALOG_STORAGE_KEY,
  PlatformEventBus,
  readPlatformRoutes,
  applyCatalogStockOperation,
  cProducts,
  compactCatalogAppliedOperations,
  compactCatalogTransactionJournal,
  ensureCatalogState,
  maintainPlatformRepository,
  products,
  readCInventoryState,
  readCatalogState,
  readCatalogLegacyMigrationMarker,
  writeCInventoryState,
  writeCatalogState,
  writePlatformRoute,
  mergePlatformRoutes,
  removePlatformRoute,
  createPlatformRepository
} from './index'
import type { CatalogState, CatalogStockOperation, CatalogTransactionJournalEntry, PlatformPrincipal, PlatformRepository } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size }
  } as Storage
}

describe('PlatformPrincipal', () => {
  it('公开七端主体与启停状态契约', () => {
    const principal = {
      actorType: 'supplier',
      actorId: 'S002',
      tenantId: 'S002',
      status: 'active'
    } satisfies PlatformPrincipal

    expectTypeOf(principal).toMatchTypeOf<PlatformPrincipal>()
    expect(principal).toEqual({ actorType: 'supplier', actorId: 'S002', tenantId: 'S002', status: 'active' })
  })
})

describe('MemoryPlatformRepository', () => {
  it('支持命名集合的 get、put、delete 和 list', async () => {
    const repository: PlatformRepository = new MemoryPlatformRepository()

    await repository.put('orders', 'O002', { amount: 20 })
    await repository.put('orders', 'O001', { amount: 10 })

    expect(await repository.get('orders', 'O001')).toEqual({ amount: 10 })
    expect(await repository.list('orders')).toEqual([
      { key: 'O001', value: { amount: 10 } },
      { key: 'O002', value: { amount: 20 } }
    ])

    await repository.delete('orders', 'O001')
    expect(await repository.get('orders', 'O001')).toBeNull()
  })

  it('在一个事务中原子写入多个集合并在失败时回滚', async () => {
    const repository = new MemoryPlatformRepository()

    await expect(repository.runTransaction('checkout:failed', 'checkout-failed-v1', ['orders', 'commissions'], async (transaction) => {
      await transaction.put('orders', 'O001', { status: 'paid' })
      await transaction.put('commissions', 'C001', { amount: 5 })
      throw new Error('write failed')
    })).rejects.toThrow('write failed')

    expect(await repository.get('orders', 'O001')).toBeNull()
    expect(await repository.get('commissions', 'C001')).toBeNull()
  })

  it('按 operationId 幂等提交且重放返回首次结果', async () => {
    const repository = new MemoryPlatformRepository()
    let executions = 0
    const execute = () => repository.runTransaction('checkout:O001', 'checkout-o001-v1', ['orders', 'commissions'], async (transaction) => {
      executions += 1
      await transaction.put('orders', 'O001', { status: 'paid' })
      await transaction.put('commissions', 'C001', { amount: 5 })
      return 'O001'
    })

    await expect(execute()).resolves.toEqual({ applied: true, value: 'O001' })
    await expect(execute()).resolves.toEqual({ applied: false, value: 'O001' })
    expect(executions).toBe(1)
    expect(await repository.get('commissions', 'C001')).toEqual({ amount: 5 })
  })

  it('拒绝事务访问未声明的集合', async () => {
    const repository = new MemoryPlatformRepository()

    await expect(repository.runTransaction('checkout:O002', 'checkout-o002-v1', ['orders'], (transaction) => (
      transaction.put('commissions', 'C002', { amount: 3 })
    ))).rejects.toThrow('Collection "commissions" is not part of this transaction')
  })

  it('相同 operationId 的集合或 fingerprint 不一致时拒绝重放', async () => {
    const repository = new MemoryPlatformRepository()
    await repository.runTransaction('checkout:O003', 'request-v1', ['orders'], (transaction) => transaction.put('orders', 'O003', { status: 'paid' }))

    await expect(repository.runTransaction('checkout:O003', 'request-v2', ['orders'], () => undefined)).rejects.toThrow('different fingerprint')
    await expect(repository.runTransaction('checkout:O003', 'request-v1', ['orders', 'commissions'], () => undefined)).rejects.toThrow('different collections')
  })
})

describe('IndexedDbPlatformRepository', () => {
  let indexedDB: IDBFactory
  let repository: IndexedDbPlatformRepository

  beforeEach(() => {
    indexedDB = new IDBFactory()
    repository = new IndexedDbPlatformRepository({ indexedDB, databaseName: `platform-test-${crypto.randomUUID()}` })
  })

  it('使用真实 IndexedDB 实现命名集合 CRUD', async () => {
    await repository.put('orders', 'O002', { amount: 20 })
    await repository.put('orders', 'O001', { amount: 10 })
    expect(await repository.get('orders', 'O001')).toEqual({ amount: 10 })
    expect(await repository.list('orders')).toEqual([
      { key: 'O001', value: { amount: 10 } },
      { key: 'O002', value: { amount: 20 } }
    ])
    await repository.delete('orders', 'O001')
    expect(await repository.get('orders', 'O001')).toBeNull()
  })

  it('跨集合事务失败时不保留部分写入', async () => {
    await expect(repository.runTransaction('checkout:rollback', 'rollback-v1', ['orders', 'commissions'], async (transaction) => {
      await transaction.put('orders', 'O001', { status: 'paid' })
      await transaction.put('commissions', 'C001', { amount: 5 })
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect(await repository.get('orders', 'O001')).toBeNull()
    expect(await repository.get('commissions', 'C001')).toBeNull()
  })

  it('事务回调跨异步定时器间隙后仍可原子提交', async () => {
    await expect(repository.runTransaction('checkout:timer', 'timer-v1', ['orders', 'commissions'], async (transaction) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await transaction.put('orders', 'O001', { status: 'paid' })
      await transaction.put('commissions', 'C001', { amount: 5 })
      return 'O001'
    })).resolves.toEqual({ applied: true, value: 'O001' })
    expect(await repository.get('commissions', 'C001')).toEqual({ amount: 5 })
  })

  it('并发相同 operationId 只提交一次', async () => {
    const execute = () => repository.runTransaction('checkout:same', 'same-v1', ['orders'], async (transaction) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await transaction.put('orders', 'O001', { status: 'paid' })
      return 'O001'
    })
    const results = await Promise.all([execute(), execute()])
    expect(results.map((result) => result.applied).sort()).toEqual([false, true])
    expect(await repository.list('orders')).toEqual([{ key: 'O001', value: { status: 'paid' } }])
  })

  it('并发不同 operationId 更新同一集合不会丢失', async () => {
    await repository.put('counters', 'orders', 0)
    const increment = (operationId: string) => repository.runTransaction(operationId, operationId, ['counters'], async (transaction) => {
      const current = await transaction.get<number>('counters', 'orders') ?? 0
      await new Promise((resolve) => setTimeout(resolve, 5))
      await transaction.put('counters', 'orders', current + 1)
    })

    await Promise.all([increment('increment:1'), increment('increment:2')])
    expect(await repository.get('counters', 'orders')).toBe(2)
  })

  it('压缩旧 operation 结果后仍保留 fingerprint 幂等门禁', async () => {
    await repository.runTransaction('checkout:compact', 'compact-v1', ['orders'], (transaction) => {
      transaction.put('orders', 'O001', { status: 'paid' })
      return { orderId: 'O001', largeSnapshot: 'x'.repeat(100) }
    })
    expect(await repository.compactOperations({ retentionMs: 0, now: Date.now() + 1 })).toBe(1)

    await expect(repository.runTransaction('checkout:compact', 'compact-v2', ['orders'], () => undefined)).rejects.toThrow('different fingerprint')
    await expect(repository.runTransaction('checkout:compact', 'compact-v1', ['orders'], () => undefined)).resolves.toEqual({ applied: false, value: undefined })
  })
})

describe('PlatformRepository factory', () => {
  it('无 indexedDB 时退化为内存实现', () => {
    expect(createPlatformRepository({ indexedDB: undefined })).toBeInstanceOf(MemoryPlatformRepository)
  })

  it('有 indexedDB 时创建 H5 IndexedDB 实现', () => {
    const indexedDB = { open: vi.fn(() => ({})) } as unknown as IDBFactory
    expect(createPlatformRepository({ indexedDB })).toBeInstanceOf(IndexedDbPlatformRepository)
  })

  it('创建仓储时 best-effort 触发默认 operations 维护', async () => {
    const compact = vi.spyOn(MemoryPlatformRepository.prototype, 'compactOperations').mockResolvedValue(0)
    createPlatformRepository({ indexedDB: undefined })
    await vi.waitFor(() => expect(compact).toHaveBeenCalledWith({ retentionMs: 30 * 24 * 60 * 60 * 1000 }))
    compact.mockRestore()
  })

  it('提供可等待的 operations 维护函数', async () => {
    const repository = new MemoryPlatformRepository()
    await repository.runTransaction('maintenance:1', 'maintenance-v1', ['orders'], () => ({ large: 'x'.repeat(100) }))
    await expect(maintainPlatformRepository(repository, { retentionMs: 0, now: Date.now() + 1 })).resolves.toBe(1)
    await expect(repository.runTransaction('maintenance:1', 'maintenance-v1', ['orders'], () => undefined)).resolves.toEqual({ applied: false, value: undefined })
  })
})

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>()
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set()
    channels.add(this)
    FakeBroadcastChannel.channels.set(name, channels)
  }

  postMessage(data: unknown): void {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) channel.onmessage?.({ data } as MessageEvent)
    }
  }

  close(): void {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this)
  }
}

describe('PlatformEventBus', () => {
  afterEach(() => {
    FakeBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it('通过 BroadcastChannel 在实例间发布和取消订阅', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const publisher = new PlatformEventBus('platform-test')
    const subscriber = new PlatformEventBus('platform-test')
    const listener = vi.fn()
    const unsubscribe = subscriber.subscribe('catalog.changed', listener)

    publisher.publish('catalog.changed', { revision: 2 })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ topic: 'catalog.changed', payload: { revision: 2 } }))

    unsubscribe()
    publisher.publish('catalog.changed', { revision: 3 })
    expect(listener).toHaveBeenCalledTimes(1)
    publisher.dispose()
    subscriber.dispose()
  })

  it('缺少 BroadcastChannel 时使用 storage 事件并在 dispose 后停止接收', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const listeners = new Set<(event: StorageEvent) => void>()
    const storage = new Map<string, string>()
    const windowStub = {
      localStorage: {
        setItem(key: string, value: string) { storage.set(key, value) },
        removeItem(key: string) { storage.delete(key) }
      },
      addEventListener(_type: 'storage', listener: (event: StorageEvent) => void) { listeners.add(listener) },
      removeEventListener(_type: 'storage', listener: (event: StorageEvent) => void) { listeners.delete(listener) }
    }
    vi.stubGlobal('window', windowStub)
    const bus = new PlatformEventBus('storage-test')
    const listener = vi.fn()
    bus.subscribe('orders.changed', listener)

    const event = { key: 'agritainment-platform-event:storage-test', newValue: JSON.stringify({ topic: 'orders.changed', payload: { id: 'O001' }, publishedAt: 1 }) } as StorageEvent
    for (const handle of listeners) handle(event)
    expect(listener).toHaveBeenCalledWith({ topic: 'orders.changed', payload: { id: 'O001' }, publishedAt: 1 })

    bus.dispose()
    for (const handle of listeners) handle(event)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('storage fallback 会通知同页面同频道的其他实例', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const listeners = new Set<(event: StorageEvent) => void>()
    vi.stubGlobal('window', {
      localStorage: { setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: (_type: 'storage', listener: (event: StorageEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: 'storage', listener: (event: StorageEvent) => void) => listeners.delete(listener)
    })
    const publisher = new PlatformEventBus('same-page')
    const subscriber = new PlatformEventBus('same-page')
    const listener = vi.fn()
    subscriber.subscribe('catalog.changed', listener)

    publisher.publish('catalog.changed', { revision: 3 })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ topic: 'catalog.changed', payload: { revision: 3 } }))
    publisher.dispose()
    subscriber.dispose()
  })

  it('单个监听器异常不会阻断其他监听器或远端发布', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const publisher = new PlatformEventBus('listener-errors')
    const subscriber = new PlatformEventBus('listener-errors')
    const localListener = vi.fn()
    const remoteListener = vi.fn()
    publisher.subscribe('orders.changed', () => { throw new Error('listener failed') })
    publisher.subscribe('orders.changed', localListener)
    subscriber.subscribe('orders.changed', remoteListener)

    expect(() => publisher.publish('orders.changed', { id: 'O001' })).not.toThrow()
    expect(localListener).toHaveBeenCalledOnce()
    expect(remoteListener).toHaveBeenCalledOnce()
    publisher.dispose()
    subscriber.dispose()
  })
})

describe('catalog legacy migration marker', () => {
  beforeEach(() => localStorage.clear())

  it('只在首次初始化目录时吸收旧 C 商品并持久化迁移标记', () => {
    const first = ensureCatalogState([products[0]], [cProducts[0]])

    expect(first.products.map((product) => product.id)).toEqual([products[0].id, cProducts[0].id])
    expect(readCatalogLegacyMigrationMarker()).toMatchObject({ schemaVersion: 1, catalogSchemaVersion: CATALOG_SCHEMA_VERSION })
    expect(localStorage.getItem(PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY)).not.toBeNull()

    localStorage.removeItem(PLATFORM_CATALOG_STORAGE_KEY)
    const rebuilt = ensureCatalogState([products[0]], [cProducts[0]])

    expect(rebuilt.products.map((product) => product.id)).toEqual([products[0].id])
  })

  it('忽略与当前 catalog schema 不匹配的迁移标记', () => {
    localStorage.setItem(PLATFORM_CATALOG_LEGACY_MIGRATION_MARKER_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      catalogSchemaVersion: CATALOG_SCHEMA_VERSION - 1,
      migratedAt: '2026-08-01T00:00:00.000Z'
    }))
    expect(readCatalogLegacyMigrationMarker()).toBeNull()
  })

  it('迁移完成后即使旧 c-inventory 存在也不再读取或写入 C 库存', () => {
    ensureCatalogState([products[0]], [cProducts[0]])
    localStorage.setItem('agritainment-platform-c-inventory', JSON.stringify({ revision: 3, products: [cProducts[0]] }))
    localStorage.setItem('agritainment-platform-c-products', JSON.stringify([cProducts[0]]))

    expect(readCInventoryState()).toBeNull()
    expect(JSON.parse(localStorage.getItem('agritainment-platform-c-inventory') || '{}').revision).toBe(3)
    expect(writeCInventoryState({ revision: 1, products: [cProducts[0]] }, 0)).toBe(false)
  })
})

describe('catalog history retention', () => {
  beforeEach(() => localStorage.clear())

  const old = '2026-07-01T00:00:00.000Z'
  const recent = '2026-08-23T00:00:00.000Z'
  const options = { now: '2026-08-24T00:00:00.000Z', retentionMs: 7 * 24 * 60 * 60 * 1000 }
  const entry = (id: string, status: CatalogTransactionJournalEntry['status'], updatedAt: string): CatalogTransactionJournalEntry => ({
    id,
    channel: 'user',
    action: 'reserve',
    status,
    inventoryChanges: [{ productId: 'P001', skuId: 'SKU001', quantity: -1 }],
    payload: { orderId: id },
    createdAt: updatedAt,
    updatedAt
  })
  const operation = (id: string, appliedAt: string): CatalogStockOperation => ({
    id,
    action: 'reserve',
    requestFingerprint: '{"action":"reserve","changes":[{"productId":"P001","skuId":"SKU001","quantity":-1}]}',
    changes: [{ productId: 'P001', skuId: 'SKU001', quantity: -1 }],
    appliedAt
  })

  it('仅压缩超过保留期的已完成和已终止交易', () => {
    const journal = {
      committedOld: entry('committedOld', 'committed', old),
      abortedOld: entry('abortedOld', 'aborted', old),
      committedRecent: entry('committedRecent', 'committed', recent),
      preparedOld: entry('preparedOld', 'prepared', old),
      appliedOld: entry('appliedOld', 'stock-applied', old)
    }

    expect(Object.keys(compactCatalogTransactionJournal(journal, options))).toEqual([
      'committedRecent',
      'preparedOld',
      'appliedOld'
    ])
  })

  it('压缩旧 operationId 时保留未完成交易恢复所需记录', () => {
    const journal = {
      committedOld: entry('committedOld', 'committed', old),
      appliedOld: entry('appliedOld', 'stock-applied', old)
    }
    const appliedOperations: NonNullable<CatalogState['appliedOperations']> = {
      committedOld: operation('committedOld', old),
      appliedOld: operation('appliedOld', old),
      orphanOld: operation('orphanOld', old),
      recent: operation('recent', recent)
    }

    expect(compactCatalogAppliedOperations(appliedOperations, journal, options)).toEqual({
      committedOld: { id: 'committedOld', action: 'reserve', requestFingerprint: operation('committedOld', old).requestFingerprint, changes: [], appliedAt: old },
      appliedOld: operation('appliedOld', old),
      orphanOld: { id: 'orphanOld', action: 'reserve', requestFingerprint: operation('orphanOld', old).requestFingerprint, changes: [], appliedAt: old },
      recent: operation('recent', recent)
    })
  })

  it('带 expectedRevision 的目录提交持久化 operationId 压缩结果', () => {
    const state: CatalogState = {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 0,
      products: [],
      appliedOperations: { old: operation('old', '2020-01-01T00:00:00.000Z') }
    }
    localStorage.setItem(PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify(state))
    expect(writeCatalogState({ ...state, revision: 1 }, 0)).toBe(true)

    expect(JSON.parse(localStorage.getItem(PLATFORM_CATALOG_STORAGE_KEY) || '{}').appliedOperations.old).toEqual({
      id: 'old', action: 'reserve', requestFingerprint: operation('old', '2020-01-01T00:00:00.000Z').requestFingerprint, changes: [], appliedAt: '2020-01-01T00:00:00.000Z'
    })
  })

  it('旧目录读取不会覆盖并发提交的新 revision', () => {
    const oldState = { schemaVersion: 1, revision: 1, products: [], appliedOperations: {} }
    const newState = { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 2, products: [], appliedOperations: {} }
    localStorage.setItem(PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify(oldState))
    const originalGet = localStorage.getItem.bind(localStorage)
    const originalSet = localStorage.setItem.bind(localStorage)
    const get = vi.spyOn(localStorage, 'getItem').mockImplementationOnce((key) => {
      const snapshot = originalGet(key)
      originalSet(PLATFORM_CATALOG_STORAGE_KEY, JSON.stringify(newState))
      return snapshot
    })

    expect(readCatalogState()?.revision).toBe(1)
    expect(JSON.parse(originalGet(PLATFORM_CATALOG_STORAGE_KEY) || '{}').revision).toBe(2)
    get.mockRestore()
  })

  it('Catalog operationId 使用 canonical fingerprint 校验重放请求', () => {
    const state = ensureCatalogState([products[0]], [])
    const product = state.products[0]
    const sku = product.skus[0]
    const changes = [{ productId: product.id, skuId: sku.id, quantity: -1 }]
    const applied = applyCatalogStockOperation('catalog:fingerprint', changes, state.revision)


    expect(applied?.state.appliedOperations?.['catalog:fingerprint'].requestFingerprint).toContain('"quantity":-1')
    expect(applyCatalogStockOperation('catalog:fingerprint', changes, applied!.state.revision)?.applied).toBe(false)
    expect(applyCatalogStockOperation('catalog:fingerprint', [{ ...changes[0], quantity: -2 }], applied!.state.revision)).toBeNull()
  })
  it('publishes and merges platform travel routes with removal marking', () => {
    const route = { id: 'ROUTE-TEST', name: '湘西风情线', description: '古丈茶园+非遗', price: 199, city: '湘西州', image: '/static/images/mountain.webp' }
    expect(writePlatformRoute(route)).toBe(true)
    expect(readPlatformRoutes()?.['ROUTE-TEST']).toMatchObject({ name: '湘西风情线' })
    expect(mergePlatformRoutes([]).map((item) => item.id)).toContain('ROUTE-TEST')
    removePlatformRoute('ROUTE-TEST')
    expect(readPlatformRoutes()?.['ROUTE-TEST']).toBe(null)
    expect(mergePlatformRoutes([route]).map((item) => item.id)).not.toContain('ROUTE-TEST')
  })
})
