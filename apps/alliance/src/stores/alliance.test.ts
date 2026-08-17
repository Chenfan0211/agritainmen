import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { cloneSeed, farms, liveRooms, products, promoters } from '@agritainment/shared'
import { useAllianceStore } from './alliance'

describe('alliance store interactions', () => {
  beforeEach(() => setActivePinia(createPinia()))

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
    expect(store.fans).toHaveLength(fanCount + 2)
    expect(store.promoter!.fans).toBe(promoterFans + 2)
    expect(store.joinRoute('RT01')).toBe(true)
    expect(store.joinRoute('RT01')).toBe(false)
    expect(store.withdraw(100, '微信钱包', 'WD-001')).toBe('success')
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
store.shareProduct('P001')
    expect(store.pendingCommission).toBe(10.78)
    expect(store.availableCommission).toBe(0)
    expect(store.commissionEntries[0]).toMatchObject({ status: 'pending', targetType: 'product', targetId: 'P001' })
    expect(store.withdraw(1, '微信钱包', 'WD-002')).toBe('insufficient')
  })

  it('deduplicates withdrawal requests without changing the wallet twice', () => {
    const store = useAllianceStore()
    const before = store.availableCommission
    expect(store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('success')
    expect(store.withdraw(100, '微信钱包', 'WD-SAME')).toBe('duplicate')
    expect(store.availableCommission).toBe(before - 100)
    expect(store.commissionEntries.filter((item) => item.requestKey === 'WD-SAME')).toHaveLength(1)
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
  beforeEach(() => setActivePinia(createPinia()))

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
    expect(store.auth).toEqual({ isLoggedIn: false, phone: '' })
  })
})
