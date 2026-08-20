import { defineStore } from 'pinia'
import type { AllianceBooking, CommissionEntry, CommissionRule, FarmStore, LiveRoom, MockScenario, Product, Promoter, PromotionRecord, TravelRoute } from '@agritainment/shared'
import { DEMO_PASSWORD, DEMO_SMS_CODE, applyPlatformMedia, cloneSeed, commissionRules as seedCommissionRules, createId, mergeEntitySeeds, mergePersistedDefaults, readPlatformCommissionSettlement, readUserBindings, validatePhone, validateSmsCode } from '@agritainment/shared'
import { allianceRepository } from '../services/repository'

interface FanRecord {
  id: string
  name: string
  source: string
  lockedAt: string
}

interface AllianceState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  city: string
  cityOptions: string[]
  farms: FarmStore[]
  liveRooms: LiveRoom[]
  products: Product[]
  promoter: Promoter | null
  joinedRoutes: string[]
  sharedProductIds: string[]
  promoterRanking: Promoter[]
  commissionRules: CommissionRule[]
  fans: FanRecord[]
  commissionEntries: CommissionEntry[]
  promotionRecords: PromotionRecord[]
  bookings: AllianceBooking[]
  watchedLiveIds: string[]
  routes: TravelRoute[]
  auth: { isLoggedIn: boolean; phone: string }
}


const CITY_REGION: Record<string, string> = {
  '张家界永定区': '张家界市',
  '长沙岳麓区': '长沙市',
  '湘西州': '湘西州',
  '常德桃源县': '常德市',
}

export const useAllianceStore = defineStore('discovery', {
  state: (): AllianceState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    city: '张家界永定区',
    cityOptions: [],
    farms: [],
    liveRooms: [],
    products: [],
    promoter: null,
    joinedRoutes: [],
    sharedProductIds: [],
    promoterRanking: [],
    commissionRules: cloneSeed(seedCommissionRules),
    fans: [
      { id: 'FN001', name: '湘西小满', source: '石板溪农家乐分享', lockedAt: '2026-08-10 09:32' },
      { id: 'FN002', name: '山水游客', source: '炎陵黄桃推广', lockedAt: '2026-08-09 18:20' },
      { id: 'FN003', name: '桃源人家', source: '乡村路线分享', lockedAt: '2026-08-08 12:05' }
    ],
    commissionEntries: [
      { id: 'CM000', type: 'income', amount: 2460.44, description: '历史推广佣金结转', createdAt: '2026-08-01 09:00', status: 'available' },
      { id: 'CM001', type: 'income', amount: 17.9, description: '湘西烟熏柴火腊肉推广佣金', createdAt: '2026-08-10 10:02', status: 'available', targetType: 'product', targetId: 'P001' },
      { id: 'CM002', type: 'income', amount: 8.16, description: '炎陵黄桃礼盒推广佣金', createdAt: '2026-08-09 19:16', status: 'available', targetType: 'product', targetId: 'P002' },
      { id: 'CM003', type: 'income', amount: 36.8, description: '东江湖鲜开捕节直播推广佣金', createdAt: '2026-08-12 16:20', status: 'pending', targetType: 'live', targetId: 'L005' }
    ],
    promotionRecords: [
      { id: 'PR-SEED', targetType: 'farm' as const, targetId: 'F001', targetName: '石板溪农家乐', link: 'https://demo.local/farm/F001?promoter=T001', shareCount: 3, lockedFans: 1, estimatedCommission: 78, createdAt: '2026-08-11 09:20' },
      { id: 'PR-002', targetType: 'product' as const, targetId: 'P001', targetName: '湘西烟熏柴火腊肉', link: 'https://demo.local/product/P001?promoter=T001', shareCount: 5, lockedFans: 2, estimatedCommission: 42.8, createdAt: '2026-08-10 10:12' },
      { id: 'PR-003', targetType: 'farm' as const, targetId: 'F002', targetName: '云上人家山景农庄', link: 'https://demo.local/farm/F002?promoter=T001', shareCount: 2, lockedFans: 1, estimatedCommission: 36, createdAt: '2026-08-10 14:36' },
      { id: 'PR-004', targetType: 'live' as const, targetId: 'L001', targetName: '石板溪掌柜带你吃土鸡宴', link: 'https://demo.local/live/L001?promoter=T001', shareCount: 8, lockedFans: 3, estimatedCommission: 96, createdAt: '2026-08-11 11:05' },
      { id: 'PR-005', targetType: 'product' as const, targetId: 'P002', targetName: '炎陵黄桃 5斤礼盒', link: 'https://demo.local/product/P002?promoter=T001', shareCount: 6, lockedFans: 2, estimatedCommission: 24.5, createdAt: '2026-08-11 19:44' },
      { id: 'PR-006', targetType: 'farm' as const, targetId: 'F006', targetName: '衡山南岳农家乐', link: 'https://demo.local/farm/F006?promoter=T001', shareCount: 3, lockedFans: 1, estimatedCommission: 28, createdAt: '2026-08-12 09:52' },
      { id: 'PR-007', targetType: 'live' as const, targetId: 'L005', targetName: '东江湖鲜开捕节 · 刁子鱼直发', link: 'https://demo.local/live/L005?promoter=T001', shareCount: 4, lockedFans: 2, estimatedCommission: 64, createdAt: '2026-08-12 16:18' }
    ],
    bookings: [
      { id: 'AB2026080101', farmId: 'F001', farmName: '石板溪农家乐', date: '8/12', session: '午市 11:30', people: 4, status: 'confirmed', createdAt: '2026-08-10 09:12' },
      { id: 'AB2026080201', farmId: 'F002', farmName: '云上人家山景农庄', date: '8/13', session: '晚市 17:30', people: 6, status: 'submitted', createdAt: '2026-08-10 15:40' },
      { id: 'AB2026080301', farmId: 'F003', farmName: '稻香村生态农庄', date: '8/14', session: '午市 11:30', people: 8, status: 'submitted', createdAt: '2026-08-11 10:05' },
      { id: 'AB2026080401', farmId: 'F005', farmName: '韶山红色记忆农庄', date: '8/10', session: '晚市 17:30', people: 4, status: 'confirmed', createdAt: '2026-08-08 18:22' },
      { id: 'AB2026080501', farmId: 'F006', farmName: '衡山南岳农家乐', date: '8/15', session: '午市 11:30', people: 5, status: 'submitted', createdAt: '2026-08-11 16:48' },
      { id: 'AB2026080601', farmId: 'F009', farmName: '邵阳崀山人家', date: '8/16', session: '晚市 17:30', people: 4, status: 'submitted', createdAt: '2026-08-12 08:56' },
      { id: 'AB2026080701', farmId: 'F011', farmName: '怀化侗乡渔寨', date: '8/17', session: '午市 11:30', people: 6, status: 'submitted', createdAt: '2026-08-12 13:27' },
      { id: 'AB2026080801', farmId: 'F013', farmName: '常德柳叶湖荷香农庄', date: '8/18', session: '晚市 17:30', people: 5, status: 'confirmed', createdAt: '2026-08-10 19:03' },
      { id: 'AB2026080901', farmId: 'F020', farmName: '郴州东江湖人家', date: '8/19', session: '午市 11:30', people: 4, status: 'submitted', createdAt: '2026-08-12 11:14' },
      { id: 'AB2026081001', farmId: 'F026', farmName: '张家界武陵源溪畔院', date: '8/20', session: '晚市 17:30', people: 2, status: 'submitted', createdAt: '2026-08-12 17:35' }
    ],
    watchedLiveIds: [],
    routes: [],
    auth: { isLoggedIn: false, phone: '' }
  }),
  getters: {
    cumulativeCommission: (state) => state.promoter?.cumulativeCommission ?? Math.round(state.commissionEntries.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    pendingCommission: (state) => Math.round(state.commissionEntries.filter((item) => item.type === 'income' && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    commissionSettled: (state) => !!state.promoter && readPlatformCommissionSettlement(state.promoter.id)?.settled === true,
    allFans: (state) => {
      const bindings = Object.values(readUserBindings() || {}).filter((item) => item.promoterId === state.promoter?.id)
      const platform = bindings.map((item) => ({ id: `B-${item.userId}`, name: `用户 ${item.userId}`, source: '分享推广', lockedAt: item.boundAt || '' }))
      return [...platform, ...state.fans].sort((a, b) => (b.lockedAt || '').localeCompare(a.lockedAt || ''))
    },
    availableCommission: (state) => state.promoter && readPlatformCommissionSettlement(state.promoter.id)?.settled ? 0 : Math.max(0, Math.round(state.commissionEntries.filter((item) => (item.type === 'income' && item.status === 'available') || item.type === 'withdrawal').reduce((sum, item) => sum + item.amount, 0) * 100) / 100),
    withdrawalRecords: (state) => state.commissionEntries.filter((item) => item.type === 'withdrawal').map((item) => ({ amount: Math.abs(item.amount), method: item.description.replace(/提现$/, ''), createdAt: item.createdAt })),
    liveRanking: (state) => [...state.farms.filter((item) => item.city === (CITY_REGION[state.city] || state.city))].sort((a, b) => b.livePopularity - a.livePopularity),
    cityFarms: (state) => state.farms.filter((item) => item.city === (CITY_REGION[state.city] || state.city)),
    cityLiveRooms: (state) => state.liveRooms.filter((item) => item.city === (CITY_REGION[state.city] || state.city)),
    cityRoutes: (state) => state.routes.filter((item) => item.city === (CITY_REGION[state.city] || state.city)),
    hotPromoProducts: (state) => {
      const order = ['P007', 'P002', 'P001', 'P010']
      return order.map((id) => state.products.find((item) => item.id === id)).filter((item): item is Product => !!item)
    }
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.farms.length > 0 && this.products.length > 0
      this.loading = true
      this.error = ''
      try {
        const data = await allianceRepository.loadDiscovery(this.mockScenario)
        this.$patch({
          farms: hasPersistedData ? mergeEntitySeeds(data.farms, this.farms) : data.farms,
          liveRooms: hasPersistedData ? mergeEntitySeeds(data.liveRooms, this.liveRooms) : data.liveRooms,
          products: hasPersistedData ? mergeEntitySeeds(data.products, this.products) : data.products,
          promoter: hasPersistedData ? mergePersistedDefaults(data.promoter, this.promoter) : data.promoter,
          promoterRanking: hasPersistedData ? mergeEntitySeeds(data.promoterRanking, this.promoterRanking) : data.promoterRanking,
          commissionRules: hasPersistedData ? mergeEntitySeeds(data.commissionRules, this.commissionRules) : data.commissionRules,
          cityOptions: [...new Set([...data.cityOptions, ...(hasPersistedData ? this.cityOptions : [])])],
          routes: hasPersistedData ? mergeEntitySeeds(data.routes, this.routes) : data.routes,
          initialized: true
        })
        applyPlatformMedia(this.farms, this.products)
        if (data.farms.length && !data.farms.some((item) => item.city === (CITY_REGION[this.city] || this.city))) this.city = data.farms[0].city
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    setMockScenario(scenario: MockScenario) {
      this.mockScenario = scenario
      this.initialized = false
    },
    changeCity(city: string) {
      if (this.cityOptions.includes(city)) this.city = city
    },
    toggleReminder(id: string) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (room) room.reminded = !room.reminded
    },
    joinRoute(id: string) {
      if (this.joinedRoutes.includes(id)) return false
      this.joinedRoutes.push(id)
      return true
    },
    withdraw(amount: number, method: string, requestKey: string) {
      if (requestKey && this.commissionEntries.some((item) => item.type === 'withdrawal' && item.requestKey === requestKey)) return 'duplicate' as const
      if (!Number.isFinite(amount) || amount <= 0) return 'invalid' as const
      if (amount > this.availableCommission) return 'insufficient' as const
      this.commissionEntries.unshift({ id: createId('CM'), type: 'withdrawal', amount: -amount, description: `${method}提现`, createdAt: new Date().toLocaleString('zh-CN'), status: 'completed', requestKey })
      return 'success' as const
    },
    watchLive(id: string) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room) return
      if (!this.watchedLiveIds.includes(id)) {
        this.watchedLiveIds.push(id)
        room.viewers += 1
      }
    },
    bookFarm(farm: FarmStore, payload: { date: string; session: string; people: number }) {
      if (farm.availability !== 'bookable') return false
      if (!payload.date || !payload.session || payload.people <= 0) return false
      if (this.bookings.some((item) => item.farmId === farm.id && item.date === payload.date && item.session === payload.session && (item.status === 'submitted' || item.status === 'confirmed'))) return false
      const booking: AllianceBooking = {
        id: createId('AB'), farmId: farm.id, farmName: farm.name, date: payload.date, session: payload.session, people: payload.people,
        status: 'submitted', createdAt: new Date().toLocaleString('zh-CN')
      }
      this.bookings.unshift(booking)
      return booking
    },
    shareFarm(id: string) {
      const farm = this.farms.find((item) => item.id === id)
      if (!farm) return
      return this.recordPromotion('farm', farm.id, farm.name, farm.averageSpend)
    },
    shareLive(id: string) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room) return
      return this.recordPromotion('live', room.id, room.title, room.productPrice)
    },
    shareProduct(id: string) {
      const product = this.products.find((item) => item.id === id)
      if (!product) return
      if (!this.sharedProductIds.includes(id)) this.sharedProductIds.push(id)
      return this.recordPromotion('product', id, product.name, product.price)
    },
    recordPromotion(targetType: PromotionRecord['targetType'], id: string, name: string, value: number) {
      const rule = this.commissionRules.find((item) => item.targetType === targetType && item.enabled)
      if (!rule) return
      let rate = rule.rate
      if (targetType === 'product') {
        const product = this.products.find((item) => item.id === id)
        if (product?.commissionRate) rate = product.commissionRate
      }
      const commission = Math.round(value * rate) / 100
      const existing = this.promotionRecords.find((item) => item.targetType === targetType && item.targetId === id)
      if (existing) {
        existing.shareCount += 1
        existing.lockedFans += 1
        existing.estimatedCommission = Math.round((existing.estimatedCommission + commission) * 100) / 100
        existing.createdAt = new Date().toLocaleString('zh-CN')
        const entry = this.commissionEntries.find((item) => item.type === 'income' && item.status === 'pending' && item.targetType === targetType && item.targetId === id)
        if (entry) { entry.amount = existing.estimatedCommission; entry.createdAt = existing.createdAt }
        if (this.promoter) this.promoter.fans += 1
        this.fans.unshift({ id: createId('FN'), name: `新粉丝${this.fans.length + 1}`, source: `${name}推广`, lockedAt: existing.createdAt })
        return existing
      }
      const record: PromotionRecord = {
        id: createId('PR'), targetType, targetId: id, targetName: name,
        link: `https://demo.local/${targetType}/${id}?promoter=${this.promoter?.id || 'guest'}`,
        shareCount: 1, lockedFans: 1, estimatedCommission: commission,
        createdAt: new Date().toLocaleString('zh-CN')
      }
      this.promotionRecords.unshift(record)
      this.commissionEntries.unshift({ id: createId('CM'), type: 'income', amount: commission, description: `${name}预计推广佣金`, createdAt: record.createdAt, status: 'pending', targetType, targetId: id })
      if (this.promoter) this.promoter.fans += 1
      this.fans.unshift({ id: createId('FN'), name: `新粉丝${this.fans.length + 1}`, source: `${name}推广`, lockedAt: record.createdAt })
      return record
    },
    loginWithPassword(phone: string, password: string) {
      if (!validatePhone(phone) || password !== DEMO_PASSWORD) return false
      this.auth = { isLoggedIn: true, phone: phone.trim() }
      return true
    },
    loginWithCode(phone: string, code: string) {
      if (!validatePhone(phone) || !validateSmsCode(code)) return false
      this.auth = { isLoggedIn: true, phone: phone.trim() }
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, phone: '' }
    }
  }
})
