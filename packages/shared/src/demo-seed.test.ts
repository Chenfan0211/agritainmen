import { beforeEach, describe, expect, it } from 'vitest'
import {
  farmhouseExperiences,
  liveRooms,
  mergePlatformLives,
  readPlatformExperiences,
  readPlatformLives,
  readShareRecords,
  readUserBindings,
  seedPlatformDemoData,
  writeShareRecords,
  writeUserBindings
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

describe('platform demo seed merge', () => {
  beforeEach(() => localStorage.clear())

  it('exports three active F001 farmhouse experiences', () => {
    expect(farmhouseExperiences).toHaveLength(3)
    expect(farmhouseExperiences.map((item) => item.id)).toEqual(['EXP001', 'EXP002', 'EXP003'])
    expect(farmhouseExperiences.every((item) => item.farmId === 'F001' && item.status === 'active')).toBe(true)
  })

  it('merges missing share, binding, experience and T002 live records by id', () => {
    writeShareRecords([{ id: 'SR-KEEP', userId: 'U1', orderId: 'NJ1', orderAmount: 10, role: 'promoter', promoterId: 'T001', rate: 5, amount: 0.5, createdAt: '2026-08-01 10:00' }])
    writeUserBindings({ KEEP: { userId: 'KEEP', promoterId: 'T001', status: 'bound', boundAt: '2026-08-01 10:00' } })

    seedPlatformDemoData()
    seedPlatformDemoData()

    const shares = readShareRecords() || []
    expect(shares.filter((item) => item.id === 'SR-KEEP')).toHaveLength(1)
    expect(shares.filter((item) => item.id === 'SR-D001')).toHaveLength(1)
    expect(shares.filter((item) => item.promoterId === 'T002')).toHaveLength(3)

    const bindings = readUserBindings() || {}
    expect(bindings.KEEP?.promoterId).toBe('T001')
    expect(Object.values(bindings).filter((item) => item.promoterId === 'T002' && item.status === 'bound')).toHaveLength(2)

    expect(readPlatformExperiences()?.EXP001).toMatchObject({ id: 'EXP001', farmId: 'F001', status: 'active' })

    const t002Lives = mergePlatformLives(liveRooms).filter((item) => item.promoterId === 'T002')
    expect(t002Lives.length).toBeGreaterThanOrEqual(1)
    expect(readPlatformLives()?.L015 || t002Lives[0]).toMatchObject({ promoterId: 'T002' })
  })
})
