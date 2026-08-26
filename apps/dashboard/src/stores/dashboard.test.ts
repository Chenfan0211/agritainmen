import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { canSelectDashboardRegion, useDashboardStore } from './dashboard'

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

describe('dashboard authenticated principal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('rejects invalid credentials without creating a session', () => {
    const store = useDashboardStore() as ReturnType<typeof useDashboardStore> & { login: (account: string, password: string) => boolean; authenticated: boolean }

    expect(() => store.login('regulator', 'wrong')).not.toThrow()
    expect(store.login('regulator', 'wrong')).toBe(false)
    expect(store.authenticated).toBe(false)
  })

  it('binds role and root region to the authenticated account', () => {
    const store = useDashboardStore() as ReturnType<typeof useDashboardStore> & { login: (account: string, password: string) => boolean; authenticated: boolean }

    expect(store.login('regulator', '123456')).toBe(true)
    expect(store.authenticated).toBe(true)
    expect(store.principal).toMatchObject({ role: 'regulator', regionCodes: ['4301'], status: 'active' })
    expect(store.regionCode).toBe('4301')
    expect(store.setRegion('43')).toBe(false)
    expect(store.regionCode).toBe('4301')
    expect(store.setRegion('430104')).toBe(true)
    expect(store.regionCode).toBe('430104')
    expect(store.goToParentRegion()).toBe(true)
    expect(store.regionCode).toBe('4301')
    expect(store.goToParentRegion()).toBe(false)
    expect(store.regionCode).toBe('4301')
  })

  it('rejects malformed and unrelated region codes before aggregation', () => {
    const principal = { id: 'P1', name: '监管员', role: 'regulator' as const, regionCodes: ['4301'], status: 'active' as const }
    expect(canSelectDashboardRegion(principal, '430104')).toBe(true)
    expect(canSelectDashboardRegion(principal, '430199')).toBe(false)
    expect(canSelectDashboardRegion(principal, '4302')).toBe(false)
  })

  it('restores and clears the authenticated session', () => {
    const first = useDashboardStore() as ReturnType<typeof useDashboardStore> & { login: (account: string, password: string) => boolean; logout: () => void }
    expect(first.login('service', '123456')).toBe(true)

    setActivePinia(createPinia())
    const restored = useDashboardStore() as ReturnType<typeof useDashboardStore> & { restoreSession: () => boolean; authenticated: boolean; logout: () => void }
    expect(restored.restoreSession()).toBe(true)
    expect(restored.principal).toMatchObject({ role: 'industry_service', regionCodes: ['4301'] })

    restored.logout()
    expect(restored.authenticated).toBe(false)
    setActivePinia(createPinia())
    expect((useDashboardStore() as ReturnType<typeof useDashboardStore> & { restoreSession: () => boolean }).restoreSession()).toBe(false)
  })

  it('supplements empty consumer datasets without writing demo records to shared storage', async () => {
    const store = useDashboardStore()
    expect(store.login('leader', '123456')).toBe(true)
    const storedKeysBeforeRefresh = localStorage.length

    await store.refresh()

    expect(store.snapshot?.overview.storeCount).toBe(30)
    expect(store.snapshot?.overview.transactionAmount).toBeGreaterThan(0)
    expect(store.snapshot?.overview.transactionOrderCount).toBeGreaterThan(30)
    console.log('cityCodes', store.snapshot?.cityProfiles.map((c) => c.cityCode).join(','))
    expect(store.snapshot?.cityProfiles).toHaveLength(14)
    expect(store.snapshot?.cityProfiles.every((city) => city.transactionAmount > 0)).toBe(true)
    expect(store.snapshot?.demoSupplement).toMatchObject({ enabled: true })
    expect(store.snapshot?.demoSupplement?.datasets).toEqual(expect.arrayContaining([
      'consumerOrders', 'vouchers', 'bookings', 'afterSales', 'supplierSettlements', 'commissionLedger'
    ]))
    expect(localStorage.length).toBe(storedKeysBeforeRefresh)
  })
})
