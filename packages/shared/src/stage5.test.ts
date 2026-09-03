import { beforeEach, describe, expect, it } from 'vitest'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as Storage
}
import type { SharedBooking } from './index'
import {
  PLATFORM_BOOKINGS_STORAGE_KEY,
  PLATFORM_COMMISSION_LEDGER_STORAGE_KEY,
  PLATFORM_RECOVERY_QUEUE_STORAGE_KEY,
  PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY,
  PLATFORM_WITHDRAWALS_STORAGE_KEY,
  purgeRetiredAllianceData,
  readPlatformBookings,
  readPlatformCollectionRevision,
  readPlatformCommissionLedger,
  readPlatformJournal,
  readPlatformRecoveryQueue,
  readPlatformWithdrawals,
  writePlatformBooking,
  writePlatformJson
} from './index'

function booking(overrides: Partial<SharedBooking> = {}): SharedBooking {
  return { id: 'B1', farmId: 'F002', farmName: '云上人家', userId: 'USER-1', source: 'farmhouse', date: '2026-08-25', session: '午市', people: 4, status: 'submitted', createdAt: '2026-08-24 12:00', ...overrides }
}

describe('shared platform bookings', () => {
  beforeEach(() => localStorage.clear())

  it('writes and reads a booking across ends', () => {
    expect(writePlatformBooking(booking())).toBe(true)
    expect(readPlatformBookings()?.['B1']).toMatchObject({ farmId: 'F002', status: 'submitted' })
    expect(localStorage.getItem(PLATFORM_BOOKINGS_STORAGE_KEY)).toContain('云上人家')
  })

  it('updates a booking status idempotently', () => {
    writePlatformBooking(booking())
    expect(writePlatformBooking({ ...booking(), status: 'confirmed', updatedAt: '2026-08-24 13:00' })).toBe(true)
    expect(readPlatformBookings()?.['B1']?.status).toBe('confirmed')
  })

  it('rejects and hides bookings from the retired alliance source', () => {
    const retired = { ...booking(), id: 'B-ALLIANCE', source: 'alliance' } as unknown as SharedBooking

    expect(writePlatformBooking(retired)).toBe(false)
    expect(writePlatformJson(PLATFORM_BOOKINGS_STORAGE_KEY, { 'B-ALLIANCE': retired, B1: booking() })).toBe(true)
    expect(readPlatformBookings()).toEqual({ B1: expect.objectContaining({ source: 'farmhouse' }) })
  })

  it('purges retired alliance state and recovery records without touching promoter finances', () => {
    const retired = { ...booking(), id: 'B-ALLIANCE', source: 'alliance' }
    localStorage.setItem('agritainment-alliance-discovery', JSON.stringify({ version: 7, state: { city: '长沙市' } }))
    writePlatformJson(PLATFORM_BOOKINGS_STORAGE_KEY, { 'B-ALLIANCE': retired, B1: booking() })
    writePlatformJson(PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, {
      'alliance-withdrawal-consume:WD-1': { operationId: 'alliance-withdrawal-consume:WD-1', collections: [], original: {}, target: {}, recoveryHandlerKey: 'alliance-withdrawal-v1', completedSteps: [], status: 'prepared', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
      'user-payment:PAY-1': { operationId: 'user-payment:PAY-1', collections: [], original: {}, target: {}, recoveryHandlerKey: 'user-payment-v1', completedSteps: [], status: 'prepared', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
    })
    writePlatformJson(PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, [
      { id: 'REC-A', operationId: 'alliance-withdrawal-consume:WD-1', failedStep: 'ledger', reason: 'test', handlerKey: 'alliance-withdrawal-v1', retryCount: 0, createdAt: '2026-09-01T00:00:00.000Z', status: 'pending' },
      { id: 'REC-U', operationId: 'user-payment:PAY-1', failedStep: 'payment', reason: 'test', handlerKey: 'user-payment-v1', retryCount: 0, createdAt: '2026-09-01T00:00:00.000Z', status: 'pending' }
    ])
    writePlatformJson(PLATFORM_WITHDRAWALS_STORAGE_KEY, { WD1: { id: 'WD1', requesterType: 'promoter', requesterId: 'T001', amount: 20, method: '微信', status: 'pending', requestKey: 'WD1', createdAt: '2026-09-01T00:00:00.000Z' } })
    writePlatformJson(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, { LE1: { id: 'LE1', sourceOrderId: 'O1', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 20, status: 'available', createdAt: '2026-09-01T00:00:00.000Z' } })

    purgeRetiredAllianceData()

    expect(localStorage.getItem('agritainment-alliance-discovery')).toBeNull()
    expect(readPlatformBookings()).toEqual({ B1: expect.objectContaining({ source: 'farmhouse' }) })
    expect(Object.keys(readPlatformJournal())).toEqual(['user-payment:PAY-1'])
    expect(readPlatformRecoveryQueue().map((task) => task.id)).toEqual(['REC-U'])
    expect(readPlatformWithdrawals()).toHaveProperty('WD1')
    expect(readPlatformCommissionLedger()).toHaveProperty('LE1')

    const revisions = [PLATFORM_BOOKINGS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY]
      .map(readPlatformCollectionRevision)
    purgeRetiredAllianceData()
    expect([PLATFORM_BOOKINGS_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY]
      .map(readPlatformCollectionRevision)).toEqual(revisions)
  })
})
