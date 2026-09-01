import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, cloneSeed, farms, liveRooms, products, promoters, readPlatformCommissionLedger, readPlatformJournal, readPlatformRecoveryQueue, readPlatformWithdrawals, readPlatformRoutes, removePlatformRoute, retryPlatformRecoveryTask, travelRoutes, writePlatformRoute, mergePlatformRoutes, readPlatformPromoterAccountState, transitionPlatformWithdrawal, upsertUserBinding, writePlatformCommissionLedgerEntry, writePlatformPromoterAccounts, writePlatformWithdrawal } from '@agritainment/shared'
import { useAllianceStore } from './alliance'

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


describe('alliance store interactions', () => {
  beforeEach(() => { vi.unstubAllGlobals(); setActivePinia(createPinia()); localStorage.clear() })

  it('records one viewer and creates a booking', () => {
    const store = useAllianceStore()
    store.$patch({ liveRooms: cloneSeed(liveRooms), farms: cloneSeed(farms), watchedLiveIds: [], bookings: [] })
    const viewers = store.liveRooms[0].viewers
    store.watchLive(store.liveRooms[0].id)
    store.watchLive(store.liveRooms[0].id)
    store.bookFarm(store.farms[0], { date: '明天', session: '晚市', people: 4 })
    expect(store.liveRooms[0].viewers).toBe(viewers + 1)
    expect(store.bookings[0].farmId).toBe(store.farms[0].id)
  })

  it('updates attribution, route and withdrawal records', async () => {
    const store = useAllianceStore()
    store.$patch({ products: cloneSeed(products), promoter: cloneSeed(promoters[0]), promotionRecords: [], sharedProductIds: [], joinedRoutes: [] })
    const fanCount = store.fans.length
    const promoterFans = store.promoter!.fans
    store.shareProduct(store.products[0].id)
    store.shareProduct(store.products[0].id)
    expect(store.promotionRecords[0]).toMatchObject({ shareCount: 2, lockedFans: 2 })
    expect(store.fans).toHaveLength(fanCount)
    expect(store.promoter!.fans).toBe(promoterFans)
    writePlatformCommissionLedgerEntry({ id: 'L1', sourceOrderId: 'O1', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    expect(store.joinRoute('RT01')).toBe(true)
    expect(store.joinRoute('RT01')).toBe(false)
    expect(await store.withdraw(100, '微信钱包', 'WD-001')).toBe('pending')
    expect(readPlatformWithdrawals()?.['WD-001']?.status).toBe('pending')
    transitionPlatformWithdrawal('WD-001', 'approved', '运营')
    await store.syncWithdrawals()
    expect(store.withdrawalRecords[0]).toMatchObject({ amount: 100, method: '微信钱包', status: 'approved', operator: '运营', reviewedAt: expect.any(String) })
  })

  it('uses city, availability and live popularity fields and attributes live sharing', () => {
    const store = useAllianceStore()
    store.$patch({ farms: cloneSeed(farms), liveRooms: cloneSeed(liveRooms), promoter: cloneSeed(promoters[0]), promotionRecords: [], cityOptions: ['张家界市', '湘西州'] })
    store.changeCity('湘西州')
    expect(store.cityFarms.map((item) => item.id)).toEqual(['F001', 'F012', 'F028'])
    expect(store.liveRanking[0].id).toBe('F001')
    expect(store.bookFarm(store.farms.find((item) => item.availability === 'full')!, { date: '明天', session: '晚市', people: 4 })).toBe(false)
    store.shareLive('L001')
    store.shareLive('L001')
    expect(store.promotionRecords[0]).toMatchObject({ targetType: 'live', shareCount: 2, lockedFans: 2 })
  })

  it('derives wallet and pending commission from entries and shared rules', async () => {
    const store = useAllianceStore()
    store.$patch({ products: cloneSeed(products), promoter: cloneSeed(promoters[0]), promotionRecords: [], commissionEntries: [], sharedProductIds: [] })
writePlatformCommissionLedgerEntry({ id: 'L2', sourceOrderId: 'O2', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 10.78, status: 'pending', createdAt: '2026-08-24 12:00' })
    store.shareProduct('P001')
    expect(store.pendingCommission).toBe(10.78)
    expect(store.availableCommission).toBe(0)
    expect(store.commissionEntries).toHaveLength(0)
    expect(await store.withdraw(1, '微信钱包', 'WD-002')).toBe('insufficient')
  })

  it('deduplicates approved withdrawal consumption by requestKey in a locked transaction', async () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    writePlatformCommissionLedgerEntry({ id: 'L3', sourceOrderId: 'O3', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    const before = store.availableCommission
    expect(await store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('pending')
    expect(await store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('duplicate')
    expect(readPlatformWithdrawals()?.['WD-SAME']?.status).toBe('pending')
    expect(store.availableCommission).toBe(before - 100)
    transitionPlatformWithdrawal('WD-SAME', 'approved', '运营')
    await Promise.all([store.syncWithdrawals(), store.syncWithdrawals()])
    const consumed = Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.role === 'withdrawal' && item.sourceOrderId === 'WD-SAME')
    expect(consumed).toHaveLength(1)
    expect(consumed[0]).toMatchObject({ id: 'WD-WD-SAME', beneficiaryId: 'T001', amount: -100 })
    expect(readPlatformJournal()['alliance-withdrawal-consume:WD-SAME']).toMatchObject({ status: 'committed' })
    expect(store.commissionEntries.filter((item) => item.requestKey === 'WD-SAME')).toHaveLength(0)
  })

  it('allows only one pending withdrawal when two tabs submit concurrently', async () => {
    writePlatformCommissionLedgerEntry({ id: 'L-TABS', sourceOrderId: 'O-TABS', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    const acquiredLocks: string[] = []
    const lockTails = new Map<string, Promise<void>>()
    vi.stubGlobal('navigator', { locks: { request: async (name: string, callback: () => Promise<unknown>) => {
      acquiredLocks.push(name)
      const previous = lockTails.get(name) || Promise.resolve()
      let release: () => void = () => undefined
      lockTails.set(name, new Promise<void>((resolve) => { release = resolve }))
      await previous
      try { return await callback() } finally { release() }
    } } })
    setActivePinia(createPinia())
    const first = useAllianceStore()
    first.$patch({ promoter: cloneSeed(promoters[0]) })
    setActivePinia(createPinia())
    const second = useAllianceStore()
    second.$patch({ promoter: cloneSeed(promoters[0]) })

    const submissions = [first.withdraw(100, '微信钱包', 'WD-TAB-A'), second.withdraw(100, '微信钱包', 'WD-TAB-B')]
    expect(submissions.every((submission) => submission instanceof Promise)).toBe(true)
    expect((await Promise.all(submissions)).sort()).toEqual(['duplicate', 'pending'])
    expect(acquiredLocks.filter((name) => name === `agritainment-platform:${PLATFORM_COMMISSION_LEDGER_STORAGE_KEY}`)).toHaveLength(2)
    expect(acquiredLocks.filter((name) => name === `agritainment-platform:${PLATFORM_WITHDRAWALS_STORAGE_KEY}`)).toHaveLength(2)
    expect(Object.values(readPlatformWithdrawals() || {}).filter((item) => item.requesterId === 'T001' && item.status === 'pending')).toHaveLength(1)
  })

  it('reserves an approved withdrawal until its matching ledger consumption is persisted', async () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    writePlatformCommissionLedgerEntry({ id: 'L-APPROVED-RESERVE', sourceOrderId: 'O-APPROVED-RESERVE', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    expect(writePlatformWithdrawal({ id: 'WD-APPROVED-RESERVE', requesterType: 'promoter', requesterId: 'T001', amount: 100, method: '微信钱包', status: 'approved', requestKey: 'WD-APPROVED-RESERVE', createdAt: '2026-08-31T08:00:00.000Z', reviewedAt: '2026-08-31T09:00:00.000Z', operator: '运营' })).toBe(true)

    expect(await store.withdraw(100, '微信钱包', 'WD-NEXT')).toBe('insufficient')
    expect(readPlatformWithdrawals()?.['WD-NEXT']).toBeUndefined()
  })

  it('keeps approved withdrawals reserved in the displayed balance until a strictly matching ledger entry exists', () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    writePlatformCommissionLedgerEntry({ id: 'L-APPROVED-BALANCE', sourceOrderId: 'O-APPROVED-BALANCE', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 300, status: 'available', createdAt: '2026-08-24 12:00' })
    expect(writePlatformWithdrawal({ id: 'WD-APPROVED-BALANCE', requesterType: 'promoter', requesterId: 'T001', amount: 100, method: '微信钱包', status: 'approved', requestKey: 'APPROVED-BALANCE', createdAt: '2026-08-31T08:00:00.000Z', reviewedAt: '2026-08-31T09:00:00.000Z', operator: '运营' })).toBe(true)

    expect(store.availableCommission).toBe(200)

    expect(writePlatformCommissionLedgerEntry({ id: 'WD-APPROVED-BALANCE', sourceOrderId: 'FORGED-SOURCE', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'withdrawal', amount: -100, status: 'settled', createdAt: '2026-08-31T09:00:00.000Z' })).toBe(true)
    store.withdrawalsTick += 1
    expect(store.availableCommission).toBe(100)
  })

  it('recovers a withdrawal after journal commit and ledger rollback both fail without double consumption', async () => {
    const store = useAllianceStore()
    await store.initialize(true)
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    writePlatformCommissionLedgerEntry({ id: 'L-RECOVERY', sourceOrderId: 'O-RECOVERY', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    expect(writePlatformWithdrawal({ id: 'WD-RECOVERY', requesterType: 'promoter', requesterId: 'T001', amount: 100, method: '微信钱包', status: 'approved', requestKey: 'WD-RECOVERY', createdAt: '2026-08-31T08:00:00.000Z', reviewedAt: '2026-08-31T09:00:00.000Z', operator: '运营' })).toBe(true)

    const setItem = localStorage.setItem.bind(localStorage)
    let journalWrites = 0
    let ledgerWrites = 0
    localStorage.setItem = ((key: string, value: string) => {
      if (key === PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && ++journalWrites === 3) throw new Error('journal commit unavailable')
      if (key === PLATFORM_COMMISSION_LEDGER_STORAGE_KEY && ++ledgerWrites === 2) throw new Error('ledger rollback unavailable')
      setItem(key, value)
    }) as Storage['setItem']
    try {
      await store.syncWithdrawals()
    } finally {
      localStorage.setItem = setItem
    }

    const operationId = 'alliance-withdrawal-consume:WD-RECOVERY'
    const task = readPlatformRecoveryQueue().find((item) => item.operationId === operationId)
    expect(task).toMatchObject({ status: 'pending', handlerKey: 'alliance-withdrawal-v1' })
    expect(readPlatformJournal()[operationId]).toMatchObject({ status: 'recovery-pending', recoveryHandlerKey: 'alliance-withdrawal-v1', recoverySchema: 'alliance-withdrawal-snapshot-v1' })
    expect(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.role === 'withdrawal' && item.sourceOrderId === 'WD-RECOVERY')).toHaveLength(1)

    expect(await retryPlatformRecoveryTask(task!.id, 'ADMIN-RECOVERY')).toMatchObject({ ok: true })
    await Promise.all([store.syncWithdrawals(), store.syncWithdrawals()])

    expect(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.role === 'withdrawal' && item.sourceOrderId === 'WD-RECOVERY')).toHaveLength(1)
    expect(readPlatformJournal()[operationId]).toMatchObject({ status: 'committed' })
  })

  it('derives the full withdrawal history from platform requests instead of local commission entries', () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]), commissionEntries: [{ id: 'LOCAL-ONLY', promoterId: 'T001', type: 'withdrawal', amount: -9, description: '本地提现', createdAt: '2026-08-01T00:00:00.000Z', status: 'completed', requestKey: 'LOCAL-ONLY' }] })
    expect(writePlatformWithdrawal({ id: 'WD-PLATFORM', requesterType: 'promoter', requesterId: 'T001', amount: 88, method: '银行卡', status: 'rejected', requestKey: 'WD-PLATFORM', createdAt: '2026-08-31T08:00:00.000Z', reviewedAt: '2026-08-31T09:00:00.000Z', operator: '审核员', reviewedNote: '资料不完整' })).toBe(true)

    expect(store.withdrawalRecords).toEqual([
      expect.objectContaining({ id: 'WD-PLATFORM', amount: 88, method: '银行卡', status: 'rejected', operator: '审核员', reviewedNote: '资料不完整', reviewedAt: '2026-08-31T09:00:00.000Z' })
    ])
  })

  it('filters farms, live rooms and routes by city', () => {
    const store = useAllianceStore()
    store.$patch({ farms: cloneSeed(farms), liveRooms: cloneSeed(liveRooms), routes: cloneSeed([{ id: 'R1', name: '湘西线', description: '', price: 1, city: '湘西州', image: '' }, { id: 'R2', name: '张家界线', description: '', price: 1, city: '张家界市', image: '' }]), cityOptions: ['张家界市', '湘西州'] })
    store.changeCity('湘西州')
    expect(store.cityFarms.every((item) => item.city === '湘西州')).toBe(true)
    expect(store.cityLiveRooms.every((item) => item.city === '湘西州')).toBe(true)
    expect(store.cityRoutes.map((item) => item.id)).toEqual(['R1'])
  })
})

describe('alliance auth', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('logs in with demo phone and password, or sms code, then logs out', () => {
    const store = useAllianceStore()
    expect(store.auth.isLoggedIn).toBe(false)
    expect(store.loginWithPassword('13800000000', 'wrong')).toBe(false)
    expect(store.loginWithPassword('13800000000', '123456')).toBe(true)
    expect(store.auth).toMatchObject({ isLoggedIn: true, phone: '13800000000' })
    store.logout()
    expect(store.loginWithCode('13800000000', '000000')).toBe(false)
    expect(store.loginWithCode('13800000000', '123456')).toBe(true)
    expect(store.auth.isLoggedIn).toBe(true)
    store.logout()
    expect(store.auth).toMatchObject({ isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' })
  })
  it('loads T002 and isolates its promotion, commission and withdrawal session', () => {
    const store = useAllianceStore()
    store.products = cloneSeed(products)

    expect(store.loginWithPassword('13800000020', '123456')).toBe(true)
    expect(store.promoter?.id).toBe('T002')
    expect(store.auth).toMatchObject({ accountId: 'PA002', promoterId: 'T002', principal: { actorType: 'alliance', actorId: 'T002', tenantId: 'T002', status: 'active' } })
    const record = store.shareProduct('P001')!
    expect(record).toMatchObject({ promoterId: 'T002' })
    expect(record.link).toContain('promoter=T002')
    expect(store.commissionEntries).toHaveLength(0)
    writePlatformCommissionLedgerEntry({ id: 'L4', sourceOrderId: 'O4', beneficiaryType: 'promoter', beneficiaryId: 'T002', role: 'promoter', amount: 20, status: 'pending', createdAt: '2026-08-24 12:00' })

    expect(store.loginWithPassword('13800000000', '123456')).toBe(true)
    expect(store.promoter?.id).toBe('T001')
    expect(store.promotionRecords.some((item) => item.promoterId === 'T002')).toBe(false)
    expect(store.ledgerEntries.some((item) => item.beneficiaryId === 'T002')).toBe(false)

    expect(store.loginWithPassword('13800000020', '123456')).toBe(true)
    expect(store.promotionRecords.some((item) => item.promoterId === 'T002')).toBe(true)
    expect(store.ledgerEntries.some((item) => item.beneficiaryId === 'T002')).toBe(true)
  })
  it('invalidates the current session when its shared account is disabled', async () => {
    const store = useAllianceStore()
    expect(store.loginWithPassword('13800000000', '123456')).toBe(true)
    const state = readPlatformPromoterAccountState()!
    expect(writePlatformPromoterAccounts(state.accounts.map((item) => item.id === 'PA001' ? { ...item, enabled: false } : item), state.revision)).toBe(true)

    await store.refreshSharedState()

    expect(store.auth.isLoggedIn).toBe(false)
  })
  it('includes platform bindings in the fan list', () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    upsertUserBinding({ userId: 'BIND1', promoterId: 'T001', status: 'bound', boundAt: '2026-08-19 10:00' })
    expect(store.allFans.some((fan) => fan.id === 'B-BIND1')).toBe(true)
  })
  it('merges platform published travel routes and respects removal', () => {
    const route = { id: 'ROUTE-ALLIANCE', name: '沅江花海线', description: '湿地+农家宴', price: 168, city: '益阳市', image: '/static/images/field.webp' }
    expect(writePlatformRoute(route)).toBe(true)
    expect(mergePlatformRoutes(cloneSeed(travelRoutes)).map((item) => item.id)).toContain('ROUTE-ALLIANCE')
    removePlatformRoute('ROUTE-ALLIANCE')
    expect(mergePlatformRoutes(cloneSeed(travelRoutes)).map((item) => item.id)).not.toContain('ROUTE-ALLIANCE')
  })
})
