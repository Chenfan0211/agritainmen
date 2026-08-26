import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLATFORM_ORDERS_STORAGE_KEY,
  PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY,
  authenticatePromoter,
  buildPromoterAccountSeeds,
  promoters,
  readPlatformPromoterAccountState,
  subscribePlatformChanges,
  upsertUserBinding,
  writePlatformOrder,
  writePlatformPromoterAccounts
} from './index'

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

describe('promoter account directory', () => {
  beforeEach(() => localStorage.clear())

  it('builds independent T001 and T002 seed accounts', () => {
    const accounts = buildPromoterAccountSeeds(promoters)

    expect(accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ promoterId: 'T001', account: '13800000000', password: '123456', enabled: true }),
      expect.objectContaining({ promoterId: 'T002', account: '13800000020', password: '123456', enabled: true })
    ]))
    expect(new Set(accounts.map((item) => item.account)).size).toBe(accounts.length)
  })

  it('persists a versioned directory and rejects duplicate accounts', () => {
    const accounts = buildPromoterAccountSeeds(promoters.slice(0, 2))

    expect(writePlatformPromoterAccounts(accounts, 0)).toBe(true)
    expect(readPlatformPromoterAccountState()).toMatchObject({ schemaVersion: 1, revision: 1, accounts })
    expect(writePlatformPromoterAccounts([{ ...accounts[0] }, { ...accounts[1], account: accounts[0].account }], 1)).toBe(false)
    expect(localStorage.getItem(PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY)).not.toBeNull()
  })

  it('authenticates only an enabled account for an active promoter', () => {
    const accounts = buildPromoterAccountSeeds(promoters.slice(0, 2))

    expect(authenticatePromoter(accounts, promoters, '13800000000', '123456')).toMatchObject({ ok: true, promoter: { id: 'T001' } })
    expect(authenticatePromoter([{ ...accounts[0], enabled: false }], promoters, '13800000000', '123456')).toEqual({ ok: false, reason: 'inactive' })
    expect(authenticatePromoter([{ ...accounts[0], promoterId: 'T013' }], promoters, '13800000000', '123456')).toEqual({ ok: false, reason: 'inactive' })
    expect(authenticatePromoter(accounts, promoters, '13800000000', 'bad')).toEqual({ ok: false, reason: 'invalid-credentials' })
  })
})

describe('binding ownership lock', () => {
  beforeEach(() => localStorage.clear())

  it('allows idempotent bound writes but rejects a different promoter or staff owner', () => {
    expect(upsertUserBinding({ userId: 'U-LOCK', promoterId: 'T001', status: 'bound', boundAt: '2026-08-24 10:00' })).toBe(true)
    expect(upsertUserBinding({ userId: 'U-LOCK', promoterId: 'T001', status: 'bound', boundAt: '2026-08-24 10:01' })).toBe(true)
    expect(upsertUserBinding({ userId: 'U-LOCK', promoterId: 'T002', status: 'pending' })).toBe(false)
    expect(upsertUserBinding({ userId: 'U-LOCK', staffAccountId: 'SA002', status: 'pending' })).toBe(false)
  })
})

describe('platform change subscription', () => {
  const originalDocument = globalThis.document

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalDocument) vi.stubGlobal('document', originalDocument)
  })

  it('publishes the written storage key and supports key filtering', () => {
    const listener = vi.fn()
    const ignored = vi.fn()
    const unsubscribe = subscribePlatformChanges(listener, [PLATFORM_ORDERS_STORAGE_KEY])
    const unsubscribeIgnored = subscribePlatformChanges(ignored, [PLATFORM_PROMOTER_ACCOUNTS_STORAGE_KEY])

    expect(writePlatformOrder({ id: 'O-STAGE3', productName: '商品', quantity: 1, amount: 10, customer: '门店', channel: 'purchase', status: 'pending', createdAt: '2026-08-24 10:00' })).toBe(true)

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ key: PLATFORM_ORDERS_STORAGE_KEY, source: 'write' }))
    expect(ignored).not.toHaveBeenCalled()
    unsubscribe()
    unsubscribeIgnored()
  })

  it('replays watched keys when the page becomes visible', () => {
    const listeners = new Set<EventListener>()
    const documentStub = {
      visibilityState: 'hidden',
      addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener)
    }
    vi.stubGlobal('document', documentStub)
    const listener = vi.fn()
    const unsubscribe = subscribePlatformChanges(listener, [PLATFORM_ORDERS_STORAGE_KEY])

    documentStub.visibilityState = 'visible'
    listeners.forEach((handle) => handle(new Event('visibilitychange')))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ key: PLATFORM_ORDERS_STORAGE_KEY, source: 'visibility' }))
    unsubscribe()
    expect(listeners.size).toBe(0)
  })
})
