import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { cloneSeed, farms, liveRooms, products, promoters, readPlatformCommissionLedger, readPlatformWithdrawals, readPlatformRoutes, removePlatformRoute, travelRoutes, writePlatformRoute, mergePlatformRoutes, readPlatformPromoterAccountState, transitionPlatformWithdrawal, upsertUserBinding, writePlatformCommissionLedgerEntry, writePlatformPromoterAccounts } from '@agritainment/shared'
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
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

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

  it('updates attribution, route and withdrawal records', () => {
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
    expect(store.withdraw(100, '微信钱包', 'WD-001')).toBe('pending')
    expect(readPlatformWithdrawals()?.['WD-001']?.status).toBe('pending')
    transitionPlatformWithdrawal('WD-001', 'approved', '运营')
    store.syncWithdrawals()
    expect(store.commissionEntries[0].type).toBe('withdrawal')
    expect(store.withdrawalRecords[0]).toMatchObject({ amount: 100, method: '微信钱包' })
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

  it('derives wallet and pending commission from entries and shared rules', () => {
    const store = useAllianceStore()
    store.$patch({ products: cloneSeed(products), promoter: cloneSeed(promoters[0]), promotionRecords: [], commissionEntries: [], sharedProductIds: [] })
writePlatformCommissionLedgerEntry({ id: 'L2', sourceOrderId: 'O2', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 10.78, status: 'pending', createdAt: '2026-08-24 12:00' })
    store.shareProduct('P001')
    expect(store.pendingCommission).toBe(10.78)
    expect(store.availableCommission).toBe(0)
    expect(store.commissionEntries).toHaveLength(0)
    expect(store.withdraw(1, '微信钱包', 'WD-002')).toBe('insufficient')
  })

  it('deduplicates withdrawal requests without changing the wallet twice', () => {
    const store = useAllianceStore()
    store.$patch({ promoter: cloneSeed(promoters[0]) })
    writePlatformCommissionLedgerEntry({ id: 'L3', sourceOrderId: 'O3', beneficiaryType: 'promoter', beneficiaryId: 'T001', role: 'promoter', amount: 100, status: 'available', createdAt: '2026-08-24 12:00' })
    const before = store.availableCommission
    expect(store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('pending')
    expect(store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('duplicate')
    expect(readPlatformWithdrawals()?.['WD-SAME']?.status).toBe('pending')
    expect(store.availableCommission).toBe(before - 100)
    transitionPlatformWithdrawal('WD-SAME', 'approved', '运营')
    store.syncWithdrawals()
    expect(store.commissionEntries.filter((item) => item.requestKey === 'WD-SAME')).toHaveLength(1)
    expect(Object.values(readPlatformCommissionLedger() || {}).find((item) => item.role === 'withdrawal')?.beneficiaryId).toBe('T001')
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
