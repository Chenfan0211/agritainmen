import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as shared from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

type LockedTransactionRunner = <T>(input: {
  operationId: string
  collections: string[]
  value?: T
  original?: unknown
  target?: unknown
  revisionChecks?: Array<{ key: string; expectedRevision: number }>
  steps: Array<{ key: string; apply: () => boolean; rollback?: () => boolean }>
}) => Promise<{ ok: boolean; operationId?: string; code?: string; value?: T }>

type LockedMutationRunner = <T>(input: {
  operationId: string
  collectionKeys: string[]
  revisionChecks: Record<string, number>
  recoveryHandlerKey: 'user-payment-v1'
  build: (currentSnapshots: Record<string, unknown>, revisions: Record<string, number>) => {
    targetSnapshots: Record<string, unknown>
    steps: Array<{ key: string; apply: () => boolean; rollback?: () => boolean }>
    value?: T
  }
}) => Promise<{ ok: boolean; operationId?: string; code?: string; value?: T }>

const runLockedPlatformTransaction = (shared as unknown as { runLockedPlatformTransaction?: LockedTransactionRunner }).runLockedPlatformTransaction
const runLockedPlatformMutation = (shared as unknown as { runLockedPlatformMutation?: LockedMutationRunner }).runLockedPlatformMutation

describe('locked platform transaction', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('serializes duplicate unsorted collection keys before executing the transaction', async () => {
    expect(runLockedPlatformTransaction).toBeTypeOf('function')
    const acquired: string[] = []
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => { acquired.push(name); return callback() } } })

    const result = await runLockedPlatformTransaction!({
      operationId: 'TX-LOCKED-SORTED',
      collections: ['orders', 'audit', 'orders'],
      revisionChecks: [
        { key: 'orders', expectedRevision: shared.readPlatformCollectionRevision('orders') },
        { key: 'audit', expectedRevision: shared.readPlatformCollectionRevision('audit') }
      ],
      value: 'saved',
      steps: [{ key: 'orders', apply: () => true, rollback: () => true }]
    })

    expect(result).toMatchObject({ ok: true, operationId: 'TX-LOCKED-SORTED', value: 'saved' })
    const expected = [shared.PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, shared.PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, 'audit', 'orders'].sort()
    expect(shared.readPlatformJournal()['TX-LOCKED-SORTED'].collections).toEqual(expected)
    expect(acquired).toEqual(expected.map((key) => `agritainment-platform:${key}`))
  })

  it('returns missing_revision_check before preparing a journal or applying business steps', async () => {
    expect(runLockedPlatformTransaction).toBeTypeOf('function')
    let applied = false

    const result = await runLockedPlatformTransaction!({
      operationId: 'TX-LOCKED-MISSING-REVISION',
      collections: ['orders', 'audit'],
      revisionChecks: [{ key: 'orders', expectedRevision: shared.readPlatformCollectionRevision('orders') }],
      steps: [{ key: 'orders', apply: () => { applied = true; return true }, rollback: () => true }]
    })

    expect(result).toMatchObject({ ok: false, operationId: 'TX-LOCKED-MISSING-REVISION', code: 'missing_revision_check' })
    expect(applied).toBe(false)
    expect(shared.readPlatformJournal()['TX-LOCKED-MISSING-REVISION']).toBeUndefined()
  })

  it.each([
    ['a whitespace-padded key', [{ key: ' orders ', expectedRevision: 0 }]],
    ['a duplicate normalized key', [
      { key: 'orders', expectedRevision: 1 },
      { key: 'orders', expectedRevision: 1 }
    ]]
  ])('rejects %s before it can satisfy revision coverage', async (_label, revisionChecks) => {
    expect(runLockedPlatformTransaction).toBeTypeOf('function')
    expect(shared.writePlatformJson('orders', { value: 'concurrent' })).toBe(true)
    let applied = false

    const result = await runLockedPlatformTransaction!({
      operationId: 'TX-LOCKED-INVALID-REVISION-KEY',
      collections: ['orders'],
      revisionChecks,
      steps: [{ key: 'orders', apply: () => { applied = true; return true }, rollback: () => true }]
    })

    expect(result).toMatchObject({ ok: false, operationId: 'TX-LOCKED-INVALID-REVISION-KEY', code: 'missing_revision_check' })
    expect(applied).toBe(false)
    expect(shared.readPlatformJournal()['TX-LOCKED-INVALID-REVISION-KEY']).toBeUndefined()
  })

  it('returns revision_conflict without preparing a journal or applying steps after acquiring locks', async () => {
    expect(runLockedPlatformTransaction).toBeTypeOf('function')
    expect(shared.writePlatformJson('locked-revision', { value: 1 }, 0)).toBe(true)
    let applied = false

    const result = await runLockedPlatformTransaction!({
      operationId: 'TX-LOCKED-CONFLICT',
      collections: ['locked-revision'],
      revisionChecks: [{ key: 'locked-revision', expectedRevision: 0 }],
      steps: [{ key: 'locked-revision', apply: () => { applied = true; return true }, rollback: () => true }]
    })

    expect(result).toMatchObject({ ok: false, operationId: 'TX-LOCKED-CONFLICT', code: 'revision_conflict' })
    expect(applied).toBe(false)
    expect(shared.readPlatformJournal()['TX-LOCKED-CONFLICT']).toBeUndefined()
  })

  it('builds mutation targets from snapshots and revisions read after acquiring every collection lock', async () => {
    expect(runLockedPlatformMutation).toBeTypeOf('function')
    expect(shared.writePlatformJson('mutation-orders', { ids: ['O-1'] }, 0)).toBe(true)
    const expectedRevision = shared.readPlatformCollectionRevision('mutation-orders')
    let built = false

    const result = await runLockedPlatformMutation!({
      operationId: 'TX-LOCKED-MUTATION',
      collectionKeys: ['mutation-orders'],
      revisionChecks: { 'mutation-orders': expectedRevision },
      recoveryHandlerKey: 'user-payment-v1',
      build: (snapshots, revisions) => {
        built = true
        expect(snapshots['mutation-orders']).toEqual({ ids: ['O-1'] })
        expect(revisions).toEqual({ 'mutation-orders': expectedRevision })
        const target = { ids: ['O-1', 'O-2'] }
        return {
          targetSnapshots: { 'mutation-orders': target },
          value: 'O-2',
          steps: [{
            key: 'mutation-orders',
            apply: () => shared.writePlatformJson('mutation-orders', target, expectedRevision),
            rollback: () => shared.writePlatformJson('mutation-orders', { ids: ['O-1'] })
          }]
        }
      }
    })

    expect(built).toBe(true)
    expect(result).toMatchObject({ ok: true, operationId: 'TX-LOCKED-MUTATION', value: 'O-2' })
    expect(shared.readPlatformJson('mutation-orders')).toEqual({ ids: ['O-1', 'O-2'] })
    expect(shared.readPlatformJournal()['TX-LOCKED-MUTATION']).toMatchObject({
      original: { 'mutation-orders': { ids: ['O-1'] } },
      target: { 'mutation-orders': { ids: ['O-1', 'O-2'] } }
    })
  })

  it('rejects a mutation build that omits a participating collection target snapshot', async () => {
    expect(runLockedPlatformMutation).toBeTypeOf('function')
    expect(shared.writePlatformJson('mutation-orders', { ids: ['O-1'] }, 0)).toBe(true)
    let applied = false

    const result = await runLockedPlatformMutation!({
      operationId: 'TX-LOCKED-MUTATION-INCOMPLETE',
      collectionKeys: ['mutation-orders'],
      revisionChecks: { 'mutation-orders': shared.readPlatformCollectionRevision('mutation-orders') },
      recoveryHandlerKey: 'user-payment-v1',
      build: () => ({
        targetSnapshots: {},
        steps: [{ key: 'mutation-orders', apply: () => { applied = true; return true } }]
      })
    })

    expect(result).toMatchObject({ ok: false, code: 'mutation_build_failed', operationId: 'TX-LOCKED-MUTATION-INCOMPLETE' })
    expect(applied).toBe(false)
    expect(shared.readPlatformJournal()['TX-LOCKED-MUTATION-INCOMPLETE']).toBeUndefined()
  })
})
