import { beforeEach, describe, expect, it } from 'vitest'
import { applyPlatformMedia, cProducts, emptyPlatformMedia, writeCDistributorProfiles, writeCProducts, writePlatformCommissionSettlement, writePlatformMedia, writeUserLink } from './index'

if (!globalThis.localStorage) {
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => storage.clear(), key: () => null,
    get length() { return storage.size }
  } as unknown as Storage
}

describe('shared write contracts', () => {
  beforeEach(() => localStorage.clear())

  it('returns a boolean result for every cross-portal write helper', () => {
    expect(writePlatformMedia(emptyPlatformMedia())).toBe(true)
    expect(writePlatformCommissionSettlement('T001', { commission: 10, settled: true, settledAt: new Date().toISOString() })).toBe(true)
    expect(writeUserLink('openid-contract', 'U-CONTRACT')).toBe(true)
    expect(writeCProducts(cProducts.slice(0, 1))).toBe(true)
    expect(writeCDistributorProfiles({})).toBe(true)
    expect(typeof applyPlatformMedia).toBe('function')
  })
})
