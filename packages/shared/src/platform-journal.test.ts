import { beforeEach, describe, expect, it } from 'vitest'
import { enqueuePlatformRecovery, markPlatformJournalStep, preparePlatformJournal, readPlatformJournal, readPlatformRecoveryQueue, resolvePlatformJournal } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, get length() { return storage.size } } as unknown as Storage
}

describe('platform transaction journal', () => {
  beforeEach(() => localStorage.clear())

  it('stores an idempotent journal, tracks completed steps and queues recovery', () => {
    const input = { operationId: 'OP-1', collections: ['orders', 'commissions'], original: { orders: { O1: { status: 'pending' } } }, target: { orders: { O1: { status: 'delivered' } } } }
    expect(preparePlatformJournal(input)).toBe(true)
    expect(preparePlatformJournal({ ...input, target: { changed: true } })).toBe(false)
    expect(readPlatformJournal()['OP-1']).toMatchObject({ status: 'prepared', completedSteps: [] })
    expect(markPlatformJournalStep('OP-1', 'orders')).toBe(true)
    expect(readPlatformJournal()['OP-1'].completedSteps).toEqual(['orders'])
    expect(enqueuePlatformRecovery({ operationId: 'OP-1', reason: '佣金写入失败', failedStep: 'commissions' })).toBe(true)
    expect(readPlatformRecoveryQueue()).toMatchObject([{ operationId: 'OP-1', failedStep: 'commissions', retryCount: 0, status: 'pending' }])
    expect(resolvePlatformJournal('OP-1', 'committed')).toBe(true)
    expect(readPlatformJournal()['OP-1'].status).toBe('committed')
  })
})
