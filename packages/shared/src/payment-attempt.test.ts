import { beforeEach, describe, expect, it } from 'vitest'
import * as shared from './index'

import {
  beginPaymentAttempt,
  PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY,
  readPaymentAttempts,
  transitionPaymentAttempt
} from './index'

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

describe('payment attempt storage', () => {
  beforeEach(() => localStorage.clear())

  it('persists state only through the public begin and transition APIs', async () => {
    expect('writePaymentAttempt' in shared).toBe(false)
    const begun = await beginPaymentAttempt({ orderId: 'CO-1', userId: 'U-1', amount: 45 })
    expect(begun.ok).toBe(true)
    if (!begun.ok) return
    expect(await transitionPaymentAttempt({
      ...begun.attempt,
      status: 'confirmed',
      providerTransactionId: 'TX-1',
      updatedAt: new Date(Date.parse(begun.attempt.updatedAt) + 1).toISOString()
    })).toBe(true)

    expect(readPaymentAttempts()).toEqual({
      'payment:CO-1': {
        operationId: 'payment:CO-1',
        orderId: 'CO-1',
        userId: 'U-1',
        amount: 45,
        status: 'confirmed',
        providerTransactionId: 'TX-1',
        createdAt: begun.attempt.createdAt,
        updatedAt: new Date(Date.parse(begun.attempt.updatedAt) + 1).toISOString()
      }
    })
    expect(JSON.parse(localStorage.getItem(PLATFORM_PAYMENT_ATTEMPTS_STORAGE_KEY) || '{}')).toHaveProperty('payment:CO-1')
  })

  it('rejects invalid begin input without replacing the stored snapshot', async () => {
    expect((await beginPaymentAttempt({ orderId: 'CO-1', userId: 'U-1', amount: 45 })).ok).toBe(true)
    expect((await beginPaymentAttempt({ orderId: 'CO-2', userId: '', amount: 0 })).ok).toBe(false)
    expect(Object.keys(readPaymentAttempts())).toEqual(['payment:CO-1'])
  })

  it('serializes different attempts and never moves a synchronized attempt backward', async () => {
    const begun = await Promise.all([
      beginPaymentAttempt({ orderId: 'CO-1', userId: 'U-CO-1', amount: 45 }),
      beginPaymentAttempt({ orderId: 'CO-2', userId: 'U-CO-2', amount: 45 })
    ])
    expect(begun.every((result) => result.ok)).toBe(true)
    expect(Object.keys(readPaymentAttempts()).sort()).toEqual(['payment:CO-1', 'payment:CO-2'])
    const first = begun[0]
    if (!first.ok) return
    const confirmed = { ...first.attempt, status: 'confirmed' as const, providerTransactionId: 'TX-1', updatedAt: new Date(Date.parse(first.attempt.updatedAt) + 1).toISOString() }
    expect(await transitionPaymentAttempt(confirmed)).toBe(true)
    const synchronized = { ...confirmed, status: 'synchronized' as const, updatedAt: new Date(Date.parse(confirmed.updatedAt) + 1).toISOString() }
    expect(await transitionPaymentAttempt(synchronized)).toBe(true)
    expect(await transitionPaymentAttempt({ ...synchronized, status: 'unknown' })).toBe(false)
    expect(readPaymentAttempts()['payment:CO-1']).toMatchObject({ status: 'synchronized', providerTransactionId: 'TX-1' })
  })

  it('creates one new attempt for concurrent retries after an explicit failure', async () => {
    const first = await beginPaymentAttempt({ orderId: 'CO-RETRY', userId: 'U-RETRY', amount: 45 })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(await transitionPaymentAttempt({ ...first.attempt, status: 'failed', failureReason: 'declined', updatedAt: new Date(Date.parse(first.attempt.updatedAt) + 1).toISOString() })).toBe(true)

    const retries = await Promise.all([
      beginPaymentAttempt({ orderId: 'CO-RETRY', userId: 'U-RETRY', amount: 45 }),
      beginPaymentAttempt({ orderId: 'CO-RETRY', userId: 'U-RETRY', amount: 45 })
    ])
    expect(retries.every((result) => result.ok)).toBe(true)
    if (!retries[0].ok || !retries[1].ok) return
    expect(retries[0].attempt.operationId).toBe(retries[1].attempt.operationId)
    expect(retries[0].attempt.operationId).not.toBe(first.attempt.operationId)
    expect(Object.values(readPaymentAttempts()).filter((attempt) => attempt.orderId === 'CO-RETRY')).toHaveLength(2)
    expect(readPaymentAttempts()[first.attempt.operationId]).toMatchObject({ status: 'failed', failureReason: 'declined' })
    expect(readPaymentAttempts()[retries[0].attempt.operationId]).toMatchObject({ status: 'created' })
  })

  it('rejects transaction changes, timestamp rollback, and synchronized business mutations', async () => {
    const begun = await beginPaymentAttempt({ orderId: 'CO-INVARIANT', userId: 'U-INVARIANT', amount: 45 })
    expect(begun.ok).toBe(true)
    if (!begun.ok) return
    const confirmed = { ...begun.attempt, status: 'confirmed' as const, providerTransactionId: 'TX-1', updatedAt: new Date(Date.parse(begun.attempt.updatedAt) + 2).toISOString() }
    expect(await transitionPaymentAttempt(confirmed)).toBe(true)
    expect(await transitionPaymentAttempt({ ...confirmed, providerTransactionId: 'TX-2', updatedAt: new Date(Date.parse(confirmed.updatedAt) + 1).toISOString() })).toBe(false)
    expect(await transitionPaymentAttempt({ ...confirmed, updatedAt: begun.attempt.updatedAt })).toBe(false)
    const synchronized = { ...confirmed, status: 'synchronized' as const, updatedAt: new Date(Date.parse(confirmed.updatedAt) + 1).toISOString() }
    expect(await transitionPaymentAttempt(synchronized)).toBe(true)
    expect(await transitionPaymentAttempt({ ...synchronized, providerTransactionId: 'TX-2', updatedAt: new Date(Date.parse(synchronized.updatedAt) + 1).toISOString() })).toBe(false)
    expect(await transitionPaymentAttempt({ ...synchronized, failureReason: 'mutated', updatedAt: new Date(Date.parse(synchronized.updatedAt) + 1).toISOString() })).toBe(false)
    expect(readPaymentAttempts()[begun.attempt.operationId]).toEqual(synchronized)
  })
})
