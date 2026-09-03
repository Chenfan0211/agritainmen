export type PlatformActorType = 'admin' | 'farmhouse' | 'store' | 'promoter' | 'user' | 'supplier'

export interface PlatformPrincipal {
  actorType: PlatformActorType
  actorId: string
  tenantId?: string
  status: 'active' | 'disabled'
}

export interface PlatformRepositoryEntry<T = unknown> {
  key: string
  value: T
}

export interface PlatformRepositoryTransaction {
  get<T>(collection: string, key: string): Promise<T | null>
  put<T>(collection: string, key: string, value: T): Promise<void>
  delete(collection: string, key: string): Promise<void>
  list<T>(collection: string): Promise<PlatformRepositoryEntry<T>[]>
}

export interface PlatformTransactionResult<T> {
  applied: boolean
  value: T | undefined
}

export interface PlatformOperationRetentionOptions {
  retentionMs: number
  now?: string | number | Date
}

export interface PlatformRepository extends PlatformRepositoryTransaction {
  /**
   * The callback may be retried after a revision conflict. It must only mutate
   * the supplied staging transaction and must not perform external side effects.
   */
  runTransaction<T>(
    operationId: string,
    requestFingerprint: string,
    collections: string[],
    execute: (transaction: PlatformRepositoryTransaction) => Promise<T> | T
  ): Promise<PlatformTransactionResult<T>>
  compactOperations(options: PlatformOperationRetentionOptions): Promise<number>
}

interface StoredOperation<T = unknown> {
  operationId: string
  collections: string
  fingerprint: string
  completedAt: string
  value?: T
}

interface IndexedDbRecord {
  collection: string
  key: string
  value: unknown
}

interface IndexedDbCollectionVersion {
  collection: string
  revision: number
}

interface RepositorySnapshot {
  records: Map<string, Map<string, unknown>>
  revisions: Map<string, number>
}

const RECORDS_STORE = 'records'
const OPERATIONS_STORE = 'operations'
const COLLECTIONS_STORE = 'collections'
const COLLECTION_INDEX = 'collection'

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function transactionCollections(collections: string[]): { names: string[]; signature: string } {
  const names = [...new Set(collections.map((name) => name.trim()).filter(Boolean))].sort()
  if (!names.length) throw new Error('A transaction requires at least one collection')
  return { names, signature: names.join('\u0000') }
}

function assertTransactionCollection(allowed: Set<string>, collection: string): void {
  if (!allowed.has(collection)) throw new Error(`Collection "${collection}" is not part of this transaction`)
}

function operationCutoff(options: PlatformOperationRetentionOptions): number {
  if (!Number.isFinite(options.retentionMs) || options.retentionMs < 0) throw new Error('retentionMs must be a non-negative finite number')
  const now = options.now instanceof Date ? options.now.getTime() : options.now === undefined ? Date.now() : new Date(options.now).getTime()
  if (!Number.isFinite(now)) throw new Error('now must be a valid date')
  return now - options.retentionMs
}

function assertOperationReplay(operation: StoredOperation, signature: string, fingerprint: string): void {
  if (operation.collections !== signature) throw new Error(`operationId "${operation.operationId}" was already used for different collections`)
  if (operation.fingerprint !== fingerprint) throw new Error(`operationId "${operation.operationId}" was already used with a different fingerprint`)
}

function createStagingTransaction(staged: Map<string, Map<string, unknown>>, names: string[]): PlatformRepositoryTransaction {
  const allowed = new Set(names)
  return {
    get: async <T>(collection: string, key: string) => {
      assertTransactionCollection(allowed, collection)
      const value = staged.get(collection)?.get(key)
      return value === undefined ? null : cloneValue(value as T)
    },
    put: async <T>(collection: string, key: string, value: T) => {
      assertTransactionCollection(allowed, collection)
      staged.get(collection)!.set(key, cloneValue(value))
    },
    delete: async (collection: string, key: string) => {
      assertTransactionCollection(allowed, collection)
      staged.get(collection)!.delete(key)
    },
    list: async <T>(collection: string) => {
      assertTransactionCollection(allowed, collection)
      return [...staged.get(collection)!.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value: cloneValue(value as T) }))
    }
  }
}

export class MemoryPlatformRepository implements PlatformRepository {
  private collections = new Map<string, Map<string, unknown>>()
  private operations = new Map<string, StoredOperation>()
  private tail: Promise<void> = Promise.resolve()

  private async afterPendingWrites(): Promise<void> {
    await this.tail
  }

  private withWriteLock<T>(execute: () => Promise<T>): Promise<T> {
    const result = this.tail.then(execute)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  async get<T>(collection: string, key: string): Promise<T | null> {
    await this.afterPendingWrites()
    const value = this.collections.get(collection)?.get(key)
    return value === undefined ? null : cloneValue(value as T)
  }

  put<T>(collection: string, key: string, value: T): Promise<void> {
    return this.withWriteLock(async () => {
      const records = this.collections.get(collection) ?? new Map<string, unknown>()
      records.set(key, cloneValue(value))
      this.collections.set(collection, records)
    })
  }

  delete(collection: string, key: string): Promise<void> {
    return this.withWriteLock(async () => {
      this.collections.get(collection)?.delete(key)
    })
  }

  async list<T>(collection: string): Promise<PlatformRepositoryEntry<T>[]> {
    await this.afterPendingWrites()
    return [...(this.collections.get(collection) ?? new Map()).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value: cloneValue(value as T) }))
  }

  runTransaction<T>(
    operationId: string,
    requestFingerprint: string,
    collections: string[],
    execute: (transaction: PlatformRepositoryTransaction) => Promise<T> | T
  ): Promise<PlatformTransactionResult<T>> {
    if (!operationId.trim()) return Promise.reject(new Error('operationId is required'))
    if (!requestFingerprint.trim()) return Promise.reject(new Error('requestFingerprint is required'))
    const { names, signature } = transactionCollections(collections)
    return this.withWriteLock(async () => {
      const existing = this.operations.get(operationId)
      if (existing) {
        assertOperationReplay(existing, signature, requestFingerprint)
        return { applied: false, value: cloneValue(existing.value as T) }
      }
      const staged = new Map<string, Map<string, unknown>>()
      for (const name of names) {
        staged.set(name, new Map([...(this.collections.get(name) ?? new Map()).entries()].map(([key, value]) => [key, cloneValue(value)])))
      }
      const value = await execute(createStagingTransaction(staged, names))
      for (const [name, records] of staged) this.collections.set(name, records)
      this.operations.set(operationId, {
        operationId,
        collections: signature,
        fingerprint: requestFingerprint,
        completedAt: new Date().toISOString(),
        value: cloneValue(value)
      })
      return { applied: true, value: cloneValue(value) }
    })
  }

  compactOperations(options: PlatformOperationRetentionOptions): Promise<number> {
    const cutoff = operationCutoff(options)
    return this.withWriteLock(async () => {
      let compacted = 0
      for (const [id, operation] of this.operations) {
        if ('value' in operation && Date.parse(operation.completedAt) < cutoff) {
          const { value: _value, ...summary } = operation
          this.operations.set(id, summary)
          compacted += 1
        }
      }
      return compacted
    })
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

export interface IndexedDbPlatformRepositoryOptions {
  indexedDB: IDBFactory
  databaseName?: string
  maxTransactionRetries?: number
}

type CommitResult<T> =
  | { kind: 'applied'; value: T }
  | { kind: 'replayed'; value: T | undefined }
  | { kind: 'conflict' }

export class IndexedDbPlatformRepository implements PlatformRepository {
  private readonly database: Promise<IDBDatabase>
  private readonly maxTransactionRetries: number

  constructor(options: IndexedDbPlatformRepositoryOptions) {
    this.maxTransactionRetries = Math.max(0, Math.floor(options.maxTransactionRetries ?? 3))
    this.database = new Promise((resolve, reject) => {
      const request = options.indexedDB.open(options.databaseName ?? 'agritainment-platform', 2)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(RECORDS_STORE)) {
          const records = database.createObjectStore(RECORDS_STORE, { keyPath: ['collection', 'key'] })
          records.createIndex(COLLECTION_INDEX, 'collection', { unique: false })
        }
        if (!database.objectStoreNames.contains(OPERATIONS_STORE)) database.createObjectStore(OPERATIONS_STORE, { keyPath: 'operationId' })
        if (!database.objectStoreNames.contains(COLLECTIONS_STORE)) database.createObjectStore(COLLECTIONS_STORE, { keyPath: 'collection' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
    })
  }

  async get<T>(collection: string, key: string): Promise<T | null> {
    const database = await this.database
    const transaction = database.transaction(RECORDS_STORE, 'readonly')
    const record = await requestResult(transaction.objectStore(RECORDS_STORE).get([collection, key])) as IndexedDbRecord | undefined
    return record ? cloneValue(record.value as T) : null
  }

  async put<T>(collection: string, key: string, value: T): Promise<void> {
    await this.mutateRecord(collection, (records) => records.put({ collection, key, value: cloneValue(value) }))
  }

  async delete(collection: string, key: string): Promise<void> {
    await this.mutateRecord(collection, (records) => records.delete([collection, key]))
  }

  async list<T>(collection: string): Promise<PlatformRepositoryEntry<T>[]> {
    const database = await this.database
    const transaction = database.transaction(RECORDS_STORE, 'readonly')
    const records = await requestResult(transaction.objectStore(RECORDS_STORE).index(COLLECTION_INDEX).getAll(collection)) as IndexedDbRecord[]
    return records
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((record) => ({ key: record.key, value: cloneValue(record.value as T) }))
  }

  async runTransaction<T>(
    operationId: string,
    requestFingerprint: string,
    collections: string[],
    execute: (transaction: PlatformRepositoryTransaction) => Promise<T> | T
  ): Promise<PlatformTransactionResult<T>> {
    if (!operationId.trim()) throw new Error('operationId is required')
    if (!requestFingerprint.trim()) throw new Error('requestFingerprint is required')
    const { names, signature } = transactionCollections(collections)

    for (let attempt = 0; attempt <= this.maxTransactionRetries; attempt += 1) {
      const existing = await this.readOperation<T>(operationId)
      if (existing) {
        assertOperationReplay(existing, signature, requestFingerprint)
        return { applied: false, value: cloneValue(existing.value) }
      }
      const snapshot = await this.readSnapshot(names)
      const staged = new Map([...snapshot.records].map(([name, records]) => [
        name,
        new Map([...records].map(([key, value]) => [key, cloneValue(value)]))
      ]))
      const value = await execute(createStagingTransaction(staged, names))
      const committed = await this.commitStaged(operationId, requestFingerprint, signature, names, snapshot, staged, value)
      if (committed.kind === 'applied') return { applied: true, value: cloneValue(committed.value) }
      if (committed.kind === 'replayed') return { applied: false, value: cloneValue(committed.value) }
    }
    throw new Error(`Platform repository revision conflict after ${this.maxTransactionRetries + 1} attempts`)
  }

  async compactOperations(options: PlatformOperationRetentionOptions): Promise<number> {
    const cutoff = operationCutoff(options)
    const database = await this.database
    const transaction = database.transaction(OPERATIONS_STORE, 'readwrite')
    const completed = transactionCompletion(transaction)
    const store = transaction.objectStore(OPERATIONS_STORE)
    const operations = await requestResult(store.getAll()) as StoredOperation[]
    let compacted = 0
    for (const operation of operations) {
      if ('value' in operation && Date.parse(operation.completedAt) < cutoff) {
        const { value: _value, ...summary } = operation
        store.put(summary)
        compacted += 1
      }
    }
    await completed
    return compacted
  }

  private async mutateRecord(collection: string, mutate: (records: IDBObjectStore) => IDBRequest): Promise<void> {
    const database = await this.database
    const transaction = database.transaction([RECORDS_STORE, COLLECTIONS_STORE], 'readwrite')
    const completed = transactionCompletion(transaction)
    const versions = transaction.objectStore(COLLECTIONS_STORE)
    const current = await requestResult(versions.get(collection)) as IndexedDbCollectionVersion | undefined
    mutate(transaction.objectStore(RECORDS_STORE))
    versions.put({ collection, revision: (current?.revision ?? 0) + 1 })
    await completed
  }

  private async readOperation<T>(operationId: string): Promise<StoredOperation<T> | null> {
    const database = await this.database
    const transaction = database.transaction(OPERATIONS_STORE, 'readonly')
    const operation = await requestResult(transaction.objectStore(OPERATIONS_STORE).get(operationId)) as StoredOperation<T> | undefined
    return operation ? cloneValue(operation) : null
  }

  private async readSnapshot(names: string[]): Promise<RepositorySnapshot> {
    const database = await this.database
    const transaction = database.transaction([RECORDS_STORE, COLLECTIONS_STORE], 'readonly')
    const completed = transactionCompletion(transaction)
    const records = transaction.objectStore(RECORDS_STORE)
    const versions = transaction.objectStore(COLLECTIONS_STORE)
    const snapshots = await Promise.all(names.map(async (collection) => {
      const [items, version] = await Promise.all([
        requestResult(records.index(COLLECTION_INDEX).getAll(collection)) as Promise<IndexedDbRecord[]>,
        requestResult(versions.get(collection)) as Promise<IndexedDbCollectionVersion | undefined>
      ])
      return { collection, items, revision: version?.revision ?? 0 }
    }))
    await completed
    return {
      records: new Map(snapshots.map(({ collection, items }) => [collection, new Map(items.map((item) => [item.key, cloneValue(item.value)]))])),
      revisions: new Map(snapshots.map(({ collection, revision }) => [collection, revision]))
    }
  }

  private async commitStaged<T>(
    operationId: string,
    fingerprint: string,
    signature: string,
    names: string[],
    snapshot: RepositorySnapshot,
    staged: Map<string, Map<string, unknown>>,
    value: T
  ): Promise<CommitResult<T>> {
    const database = await this.database
    const transaction = database.transaction([RECORDS_STORE, OPERATIONS_STORE, COLLECTIONS_STORE], 'readwrite')
    const completed = transactionCompletion(transaction)
    const records = transaction.objectStore(RECORDS_STORE)
    const operations = transaction.objectStore(OPERATIONS_STORE)
    const versions = transaction.objectStore(COLLECTIONS_STORE)
    const [existing, ...currentVersions] = await Promise.all([
      requestResult(operations.get(operationId)) as Promise<StoredOperation<T> | undefined>,
      ...names.map((collection) => requestResult(versions.get(collection)) as Promise<IndexedDbCollectionVersion | undefined>)
    ])

    if (existing) {
      assertOperationReplay(existing, signature, fingerprint)
      await completed
      return { kind: 'replayed', value: cloneValue(existing.value) }
    }
    if (names.some((collection, index) => (currentVersions[index]?.revision ?? 0) !== snapshot.revisions.get(collection))) {
      await completed
      return { kind: 'conflict' }
    }

    for (const collection of names) {
      const before = snapshot.records.get(collection) ?? new Map()
      const after = staged.get(collection) ?? new Map()
      for (const key of before.keys()) if (!after.has(key)) records.delete([collection, key])
      for (const [key, recordValue] of after) records.put({ collection, key, value: cloneValue(recordValue) })
      versions.put({ collection, revision: (snapshot.revisions.get(collection) ?? 0) + 1 })
    }
    operations.put({
      operationId,
      collections: signature,
      fingerprint,
      completedAt: new Date().toISOString(),
      value: cloneValue(value)
    })
    await completed
    return { kind: 'applied', value }
  }
}

export interface CreatePlatformRepositoryOptions {
  indexedDB?: IDBFactory
  databaseName?: string
  maxTransactionRetries?: number
  operationRetentionMs?: number
}

export const DEFAULT_PLATFORM_OPERATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function maintainPlatformRepository(
  repository: PlatformRepository,
  options: PlatformOperationRetentionOptions = { retentionMs: DEFAULT_PLATFORM_OPERATION_RETENTION_MS }
): Promise<number> {
  return repository.compactOperations(options)
}

export function createPlatformRepository(options: CreatePlatformRepositoryOptions = {}): PlatformRepository {
  const indexedDB = options.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB
  const repository = indexedDB
    ? new IndexedDbPlatformRepository({ indexedDB, databaseName: options.databaseName, maxTransactionRetries: options.maxTransactionRetries })
    : new MemoryPlatformRepository()
  void maintainPlatformRepository(repository, { retentionMs: options.operationRetentionMs ?? DEFAULT_PLATFORM_OPERATION_RETENTION_MS }).catch(() => undefined)
  return repository
}
