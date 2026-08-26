import type { PlatformOperationRetentionOptions, PlatformRepository, PlatformRepositoryEntry, PlatformRepositoryTransaction, PlatformTransactionResult } from '@agritainment/shared'

export interface UniStorageApi {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
}

interface StoredOperation {
  fingerprint: string
  collections: string
  completedAt: string
  value?: unknown
}

interface UniRepositoryState {
  records: Record<string, Record<string, unknown>>
  operations: Record<string, StoredOperation>
}

const emptyState = (): UniRepositoryState => ({ records: {}, operations: {} })

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function collectionSignature(collections: string[]): { names: string[]; signature: string } {
  const names = [...new Set(collections.map((name) => name.trim()).filter(Boolean))].sort()
  if (!names.length) throw new Error('A transaction requires at least one collection')
  return { names, signature: names.join('\u0000') }
}

export class UniStoragePlatformRepository implements PlatformRepository {
  constructor(private readonly storage: UniStorageApi, private readonly storageKey = 'agritainment-platform-repository') {}

  async get<T>(collection: string, key: string): Promise<T | null> {
    const value = this.read().records[collection]?.[key]
    return value === undefined ? null : clone(value as T)
  }

  async put<T>(collection: string, key: string, value: T): Promise<void> {
    const state = this.read()
    state.records[collection] ||= {}
    state.records[collection][key] = clone(value)
    this.write(state)
  }

  async delete(collection: string, key: string): Promise<void> {
    const state = this.read()
    delete state.records[collection]?.[key]
    this.write(state)
  }

  async list<T>(collection: string): Promise<PlatformRepositoryEntry<T>[]> {
    return Object.entries(this.read().records[collection] || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value: clone(value as T) }))
  }

  async runTransaction<T>(operationId: string, requestFingerprint: string, collections: string[], execute: (transaction: PlatformRepositoryTransaction) => Promise<T> | T): Promise<PlatformTransactionResult<T>> {
    if (!operationId.trim() || !requestFingerprint.trim()) throw new Error('operationId and requestFingerprint are required')
    const { names, signature } = collectionSignature(collections)
    const state = this.read()
    const existing = state.operations[operationId]
    if (existing) {
      if (existing.fingerprint !== requestFingerprint || existing.collections !== signature) throw new Error(`operationId "${operationId}" was already used for a different request`)
      return { applied: false, value: clone(existing.value as T) }
    }
    const staged = clone(state)
    const allowed = new Set(names)
    const assertAllowed = (collection: string) => {
      if (!allowed.has(collection)) throw new Error(`Collection "${collection}" is not part of this transaction`)
    }
    const transaction: PlatformRepositoryTransaction = {
      get: async <V>(collection: string, key: string) => {
        assertAllowed(collection)
        const value = staged.records[collection]?.[key]
        return value === undefined ? null : clone(value as V)
      },
      put: async <V>(collection: string, key: string, value: V) => {
        assertAllowed(collection)
        staged.records[collection] ||= {}
        staged.records[collection][key] = clone(value)
      },
      delete: async (collection: string, key: string) => {
        assertAllowed(collection)
        delete staged.records[collection]?.[key]
      },
      list: async <V>(collection: string) => {
        assertAllowed(collection)
        return Object.entries(staged.records[collection] || {}).map(([key, value]) => ({ key, value: clone(value as V) }))
      }
    }
    const value = await execute(transaction)
    staged.operations[operationId] = { fingerprint: requestFingerprint, collections: signature, completedAt: new Date().toISOString(), value: clone(value) }
    this.write(staged)
    return { applied: true, value: clone(value) }
  }

  async compactOperations(options: PlatformOperationRetentionOptions): Promise<number> {
    const now = options.now === undefined ? Date.now() : new Date(options.now).getTime()
    if (!Number.isFinite(now) || !Number.isFinite(options.retentionMs) || options.retentionMs < 0) throw new Error('Invalid operation retention options')
    const cutoff = now - options.retentionMs
    const state = this.read()
    let removed = 0
    for (const [id, operation] of Object.entries(state.operations)) {
      if (Date.parse(operation.completedAt) < cutoff) {
        delete state.operations[id]
        removed += 1
      }
    }
    if (removed) this.write(state)
    return removed
  }

  private read(): UniRepositoryState {
    const saved = this.storage.getStorageSync(this.storageKey)
    if (!saved) return emptyState()
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved
      if (!parsed || typeof parsed !== 'object') return emptyState()
      const state = parsed as Partial<UniRepositoryState>
      return { records: clone(state.records || {}), operations: clone(state.operations || {}) }
    } catch {
      return emptyState()
    }
  }

  private write(state: UniRepositoryState): void {
    this.storage.setStorageSync(this.storageKey, clone(state))
  }
}
