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
import { PLATFORM_BOOKINGS_STORAGE_KEY, readPlatformBookings, writePlatformBooking } from './index'

function booking(overrides: Partial<SharedBooking> = {}): SharedBooking {
  return { id: 'B1', farmId: 'F002', farmName: '云上人家', userId: 'ALLIANCE-1', source: 'alliance', date: '2026-08-25', session: '午市', people: 4, status: 'submitted', createdAt: '2026-08-24 12:00', ...overrides }
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
})
