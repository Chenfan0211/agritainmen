import { beforeEach, describe, expect, it } from 'vitest'
import { farmhouseRepository } from './repository'

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

describe('farmhouse storefront seed', () => {
  beforeEach(() => localStorage.clear())

  it('returns F001 experiences in normal and keeps empty scenario empty', async () => {
    const tenant = { farmId: 'F001', name: '石板溪', address: '湘西', phone: '13800000001' }
    const normal = await farmhouseRepository.loadStorefront('normal', tenant as never)
    expect(normal.experiences.map((item) => item.id)).toEqual(['EXP001', 'EXP002', 'EXP003'])

    const empty = await farmhouseRepository.loadStorefront('empty', tenant as never)
    expect(empty.experiences).toEqual([])
    expect(empty.products).toEqual([])
    expect(empty.foods).toEqual([])
  })
})
