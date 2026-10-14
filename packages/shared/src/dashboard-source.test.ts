import { beforeEach, describe, expect, it } from 'vitest'
import { writePlatformJson } from './index'
import { createPlatformDashboardDataSource } from './dashboard-source'

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

describe('platform dashboard data source', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the retired booking and live domains empty and untracked', () => {
    const source = createPlatformDashboardDataSource()

    const domainUpdatedAt = source.domainUpdatedAt as Record<string, string | undefined>
  })

  it('still tracks the retained voucher domain from voucher orders', () => {
    expect(writePlatformJson('agritainment-platform-vouchers', {
      V1: {
        id: 'V1', userId: 'U1', farmId: 'F001', productId: 'P1', skuId: 'S1',
        quantity: 1, amount: 10, status: 'paid', createdAt: '2026-08-25T08:00:00.000Z'
      }
    })).toBe(true)

    expect(createPlatformDashboardDataSource().domainUpdatedAt?.vouchers).toBe('2026-08-25T08:00:00.000Z')
  })
})
