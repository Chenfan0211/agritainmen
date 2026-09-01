import { describe, expect, it, beforeEach } from 'vitest'
import { haversineKm, PLATFORM_WITHDRAWALS_STORAGE_KEY, readPlatformWithdrawals, transitionPlatformWithdrawal, writePlatformWithdrawal, type WithdrawalRequest } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size }
  } as Storage
}


function request(id: string, overrides: Partial<WithdrawalRequest> = {}): WithdrawalRequest {
  return { id, requesterType: 'promoter', requesterId: 'T001', amount: 100, method: '微信', status: 'pending', requestKey: 'key-' + id, createdAt: '2026-08-27T10:00:00.000Z', ...overrides }
}

describe('withdrawal review', () => {
  beforeEach(() => localStorage.clear())

  it('persists and reads a pending withdrawal request', () => {
    expect(writePlatformWithdrawal(request('WD1'))).toBe(true)
    expect(readPlatformWithdrawals()?.['WD1']).toMatchObject({ id: 'WD1', status: 'pending', amount: 100 })
    expect(localStorage.getItem(PLATFORM_WITHDRAWALS_STORAGE_KEY)).not.toBeNull()
  })

  it('rejects invalid withdrawal payloads', () => {
    expect(writePlatformWithdrawal({ ...request('WD2'), amount: 0 })).toBe(false)
    expect(writePlatformWithdrawal({ ...request('WD3'), requesterId: '' })).toBe(false)
  })

  it('transitions pending to approved / rejected only once', () => {
    writePlatformWithdrawal(request('WD4'))
    expect(transitionPlatformWithdrawal('WD4', 'approved', 'admin')?.status).toBe('approved')
    expect(transitionPlatformWithdrawal('WD4', 'rejected', 'admin')).toBeNull()
    writePlatformWithdrawal(request('WD5'))
    expect(transitionPlatformWithdrawal('WD5', 'rejected', 'admin', '资料不符')?.reviewedNote).toBe('资料不符')
  })

  it('blocks transitions for non-pending or invalid status', () => {
    writePlatformWithdrawal(request('WD6', { status: 'approved' }))
    expect(transitionPlatformWithdrawal('WD6', 'rejected', 'admin')).toBeNull()
    expect(transitionPlatformWithdrawal('WD7', 'approved', 'admin')).toBeNull()
    expect(transitionPlatformWithdrawal('WD8', 'pending', 'admin')).toBeNull()
  })

  it('returns null when persisting a transition fails', () => {
    writePlatformWithdrawal(request('WD-WRITE-FAIL'))
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_WITHDRAWALS_STORAGE_KEY) throw new Error('quota')
      originalSetItem(key, value)
    }) as Storage['setItem']

    expect(transitionPlatformWithdrawal('WD-WRITE-FAIL', 'approved', 'admin')).toBeNull()

    localStorage.setItem = originalSetItem
    expect(readPlatformWithdrawals()?.['WD-WRITE-FAIL'].status).toBe('pending')
  })

  it('returns null when another reviewer replaces the snapshot during transition', () => {
    writePlatformWithdrawal(request('WD-CAS'))
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let replaced = false
    localStorage.setItem = ((key: string, value: string) => {
      originalSetItem(key, value)
      if (!replaced && key === PLATFORM_WITHDRAWALS_STORAGE_KEY) {
        replaced = true
        const snapshot = JSON.parse(value)
        snapshot['WD-CAS'] = { ...snapshot['WD-CAS'], status: 'rejected', revision: 1, operator: 'other-admin' }
        originalSetItem(key, JSON.stringify(snapshot))
      }
    }) as Storage['setItem']
    expect(transitionPlatformWithdrawal('WD-CAS', 'approved', 'admin')).toBeNull()
    localStorage.setItem = originalSetItem
  })

  it('allows only one reviewer when a transition is re-entered during persistence', () => {
    writePlatformWithdrawal(request('WD-CONCURRENT'))
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let nestedResult: WithdrawalRequest | null = null
    let reentered = false
    localStorage.setItem = ((key: string, value: string) => {
      if (!reentered && key === PLATFORM_WITHDRAWALS_STORAGE_KEY) {
        reentered = true
        nestedResult = transitionPlatformWithdrawal('WD-CONCURRENT', 'rejected', 'other-admin')
      }
      originalSetItem(key, value)
    }) as Storage['setItem']

    const outerResult = transitionPlatformWithdrawal('WD-CONCURRENT', 'approved', 'admin')

    localStorage.setItem = originalSetItem
    expect(nestedResult).toBeNull()
    expect(outerResult?.status).toBe('approved')
    expect([outerResult, nestedResult].filter(Boolean)).toHaveLength(1)
    expect(readPlatformWithdrawals()?.['WD-CONCURRENT'].status).toBe('approved')
  })
})

describe('haversineKm', () => {
  it('computes straight-line distance rounded to 0.1km', () => {
    // Changsha ~112.94,28.23 ; Zhuzhou ~113.13,27.83 -> ~50km
    const d = haversineKm(28.23, 112.94, 27.83, 113.13)
    expect(d).toBeGreaterThan(45)
    expect(d).toBeLessThan(55)
    expect(haversineKm(0, 0, 0, 0)).toBe(0)
  })
})
