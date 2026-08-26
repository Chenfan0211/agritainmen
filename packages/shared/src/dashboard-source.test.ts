import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removePlatformLive, writePlatformLive, type LiveRoom } from './index'
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

const room: LiveRoom = {
  id: 'LIVE-FRESHNESS', title: '直播数据新鲜度', host: '测试主播', viewers: 100,
  productName: '测试套餐', productPrice: 99, status: 'live', reminded: false,
  image: '', farmId: 'F001', city: '湘西州'
}

describe('platform dashboard data source freshness', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it('uses the live dataset write time instead of the unrelated entity time', () => {
    vi.setSystemTime(new Date('2026-08-25T08:00:00.000Z'))
    expect(writePlatformLive(room)).toBe(true)

    expect(createPlatformDashboardDataSource().domainUpdatedAt?.lives).toBe('2026-08-25T08:00:00.000Z')
    expect(localStorage.getItem('agritainment-platform-lives-updated-at')).toBe('"2026-08-25T08:00:00.000Z"')
  })

  it('advances the live dataset write time when a room is removed', () => {
    vi.setSystemTime(new Date('2026-08-25T08:00:00.000Z'))
    writePlatformLive(room)
    vi.setSystemTime(new Date('2026-08-25T09:00:00.000Z'))
    removePlatformLive(room.id)

    expect(createPlatformDashboardDataSource().domainUpdatedAt?.lives).toBe('2026-08-25T09:00:00.000Z')
  })
})
