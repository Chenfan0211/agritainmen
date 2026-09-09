import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readPlatformWithdrawals } from '@agritainment/shared'
import { seedAdminDemoDataOnce, demoAdminExportRecords } from './demo-admin'
import { useAdminStore } from '../stores/admin'

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

describe('admin demo seed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('writes pending T001 withdrawals once and exposes export fixtures', () => {
    expect(demoAdminExportRecords.length).toBeGreaterThanOrEqual(2)
    expect(seedAdminDemoDataOnce()).toBe(true)
    expect(seedAdminDemoDataOnce()).toBe(false)
    const pending = Object.values(readPlatformWithdrawals() || {}).filter((item) => item.status === 'pending' && item.requesterId === 'T001')
    expect(pending.length).toBeGreaterThanOrEqual(1)
  })

  it('prefills export records after initialize without wiping later exports', async () => {
    const store = useAdminStore()
    await store.login('admin', '123456')
    await store.initialize()
    expect(store.exportRecords.length).toBeGreaterThanOrEqual(2)
    await store.recordExport('订单履约', 4)
    expect(store.exportRecords[0]).toMatchObject({ module: '订单履约', count: 4 })
  })
})
