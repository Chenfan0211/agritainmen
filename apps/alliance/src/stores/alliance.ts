import { defineStore } from 'pinia'
import type { AllianceBooking, CommissionEntry, CommissionRule, FarmStore, LiveRoom, MockScenario, PlatformPrincipal, Product, Promoter, PromoterAccount, PromotionRecord, TravelRoute, WithdrawalRequest } from '@agritainment/shared'
import { applyPlatformMedia, authenticatePromoter, buildPortalUrl, buildPromoterAccountSeeds, cloneSeed, commissionRules as seedCommissionRules, createId, mergeEntitySeeds, mergePersistedDefaults, mergePlatformPromoterAccounts, promoters, readPlatformCommissionSettlement, readPlatformPromoterAccountState, readPlatformBookings, readPlatformCommissionLedger, readPlatformPromoterAccounts, readPlatformWithdrawals, readUserBindings, validateSmsCode, writePlatformBooking, writePlatformCommissionLedgerEntry, writePlatformPromoterAccounts, writePlatformWithdrawal, round2 } from '@agritainment/shared'
import { allianceRepository } from '../services/repository'

interface FanRecord {
  id: string
  name: string
  source: string
  lockedAt: string
}

const alliancePortalLink = (targetType: 'farm' | 'product' | 'live', targetId: string, promoterId = 'T001') => buildPortalUrl('user', 'pages/index/index', {
  promoter: promoterId,
  live: targetType === 'live' ? targetId : undefined,
  activity: `${targetType}:${targetId}`
}, import.meta.env.VITE_PORTAL_ORIGIN || '')

interface AllianceState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  withdrawalsTick: number
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
  auth: { isLoggedIn: boolean; phone: string; principal: PlatformPrincipal | null; accountId: string; promoterId: string }
  promoterSessions: Record<string, { joinedRoutes: string[]; sharedProductIds: string[]; fans: FanRecord[]; commissionEntries: CommissionEntry[]; promotionRecords: PromotionRecord[] }>
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
    withdrawalsTick: 0,
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
      { id: 'CM000', promoterId: 'T001', type: 'income', amount: 2460.44, description: '历史推广佣金结转', createdAt: '2026-08-01 09:00', status: 'available' },
      { id: 'CM001', promoterId: 'T001', type: 'income', amount: 17.9, description: '湘西烟熏柴火腊肉推广佣金', createdAt: '2026-08-10 10:02', status: 'available', targetType: 'product', targetId: 'P001' },
      { id: 'CM002', promoterId: 'T001', type: 'income', amount: 8.16, description: '炎陵黄桃礼盒推广佣金', createdAt: '2026-08-09 19:16', status: 'available', targetType: 'product', targetId: 'P002' },
      { id: 'CM003', promoterId: 'T001', type: 'income', amount: 36.8, description: '东江湖鲜开捕节直播推广佣金', createdAt: '2026-08-12 16:20', status: 'pending', targetType: 'live', targetId: 'L005' }
    ],
    promotionRecords: [
      { id: 'PR-SEED', targetType: 'farm' as const, targetId: 'F001', targetName: '石板溪农家乐', link: alliancePortalLink('farm', 'F001'), shareCount: 3, lockedFans: 1, estimatedCommission: 78, createdAt: '2026-08-11 09:20' },
      { id: 'PR-002', targetType: 'product' as const, targetId: 'P001', targetName: '湘西烟熏柴火腊肉', link: alliancePortalLink('product', 'P001'), shareCount: 5, lockedFans: 2, estimatedCommission: 42.8, createdAt: '2026-08-10 10:12' },
      { id: 'PR-003', targetType: 'farm' as const, targetId: 'F002', targetName: '云上人家山景农庄', link: alliancePortalLink('farm', 'F002'), shareCount: 2, lockedFans: 1, estimatedCommission: 36, createdAt: '2026-08-10 14:36' },
      { id: 'PR-004', targetType: 'live' as const, targetId: 'L001', targetName: '石板溪掌柜带你吃土鸡宴', link: alliancePortalLink('live', 'L001'), shareCount: 8, lockedFans: 3, estimatedCommission: 96, createdAt: '2026-08-11 11:05' },
      { id: 'PR-005', targetType: 'product' as const, targetId: 'P002', targetName: '炎陵黄桃 5斤礼盒', link: alliancePortalLink('product', 'P002'), shareCount: 6, lockedFans: 2, estimatedCommission: 24.5, createdAt: '2026-08-11 19:44' },
      { id: 'PR-006', targetType: 'farm' as const, targetId: 'F006', targetName: '衡山南岳农家乐', link: alliancePortalLink('farm', 'F006'), shareCount: 3, lockedFans: 1, estimatedCommission: 28, createdAt: '2026-08-12 09:52' },
      { id: 'PR-007', targetType: 'live' as const, targetId: 'L005', targetName: '东江湖鲜开捕节 · 刁子鱼直发', link: alliancePortalLink('live', 'L005'), shareCount: 4, lockedFans: 2, estimatedCommission: 64, createdAt: '2026-08-12 16:18' }
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
    auth: { isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' },
    promoterSessions: {}
  }),
  getters: {
    ledgerEntries: (state) => Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    cumulativeCommission: (state) => Math.round(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id && item.amount > 0).reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    pendingCommission: (state) => { const touch = state.commissionEntries.length; return Math.round(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) * 100) / 100 + 0 * touch },
    commissionSettled: (state) => !!state.promoter && readPlatformCommissionSettlement(state.promoter.id)?.settled === true,
    allFans: (state) => {
      const bindings = Object.values(readUserBindings() || {}).filter((item) => item.promoterId === state.promoter?.id)
      const platform = bindings.map((item) => ({ id: `B-${item.userId}`, name: `用户 ${item.userId}`, source: '分享推广', lockedAt: item.boundAt || '' }))
      return [...platform, ...state.fans].sort((a, b) => (b.lockedAt || '').localeCompare(a.lockedAt || ''))
    },
    availableCommission: (state) => {
      const touch = state.commissionEntries.length
      const entries = Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id && (item.status === 'available' || (item.amount < 0 && item.status !== 'reversed')))
      const gross = Math.round(entries.reduce((sum, item) => sum + item.amount, 0) * 100) / 100 + 0 * touch
      const pending = Object.values(readPlatformWithdrawals() || {}).filter((item) => item.requesterId === state.promoter?.id && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
      return Math.max(0, round2(gross - pending) + 0 * state.withdrawalsTick)
    },
    pendingWithdrawalAmount: (state) => Object.values(readPlatformWithdrawals() || {}).filter((item) => item.requesterId === state.promoter?.id && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) + 0 * state.withdrawalsTick,
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
          promoter: this.auth.promoterId
            ? cloneSeed(promoters.find((item) => item.id === this.auth.promoterId) || null)
            : hasPersistedData ? mergePersistedDefaults(data.promoter, this.promoter) : data.promoter,
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
      if (requestKey && (this.commissionEntries.some((item) => item.type === 'withdrawal' && item.requestKey === requestKey) || Object.values(readPlatformWithdrawals() || {}).some((item) => item.requestKey === requestKey && item.requesterId === this.promoter?.id))) return 'duplicate' as const
      if (!Number.isFinite(amount) || amount <= 0) return 'invalid' as const
      if (amount > this.availableCommission) return 'insufficient' as const
      const createdAt = new Date().toISOString()
      const id = requestKey || createId('WD')
      writePlatformWithdrawal({ id, requesterType: 'promoter', requesterId: this.promoter?.id || '', amount, method, status: 'pending', requestKey: id, createdAt })
      this.withdrawalsTick += 1
      return 'pending' as const
    },
    syncWithdrawals() {
      if (!this.promoter?.id) return
      for (const req of Object.values(readPlatformWithdrawals() || {})) {
        if (req.requesterType !== 'promoter' || req.requesterId !== this.promoter.id) continue
        if (req.status === 'approved' && !this.commissionEntries.some((item) => item.type === 'withdrawal' && item.requestKey === req.requestKey)) {
          const createdAt = req.reviewedAt || req.createdAt
          this.commissionEntries.unshift({ id: createId('CM'), promoterId: this.promoter.id, type: 'withdrawal', amount: -req.amount, description: req.method + '提现', createdAt, status: 'completed', requestKey: req.requestKey })
          writePlatformCommissionLedgerEntry({ id: 'WD-' + req.requestKey, sourceOrderId: req.requestKey, beneficiaryType: 'promoter', beneficiaryId: this.promoter.id, role: 'withdrawal', amount: -req.amount, status: 'settled', createdAt })
        }
      }
      this.saveCurrentPromoterSession()
      this.withdrawalsTick += 1
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
      if (!writePlatformBooking({ id: booking.id, farmId: farm.id, farmName: farm.name, userId: this.auth.phone || 'alliance', source: 'alliance', date: payload.date, session: payload.session, people: payload.people, status: 'submitted', createdAt: booking.createdAt })) return false
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
        return existing
      }
      const record: PromotionRecord = {
        id: createId('PR'), targetType, targetId: id, targetName: name,
        link: alliancePortalLink(targetType, id, this.promoter?.id || 'T001'),
        shareCount: 1, lockedFans: 1, estimatedCommission: commission,
        createdAt: new Date().toLocaleString('zh-CN'), promoterId: this.promoter?.id
      }
      this.promotionRecords.unshift(record)
      return record
    },
    promoterAccounts(): PromoterAccount[] {
      const defaults = buildPromoterAccountSeeds(promoters)
      const saved = readPlatformPromoterAccounts()
      if (!saved || saved.length === 0) writePlatformPromoterAccounts(defaults, readPlatformPromoterAccountState()?.revision ?? 0)
      return mergePlatformPromoterAccounts(defaults, readPlatformPromoterAccounts())
    },
    saveCurrentPromoterSession() {
      if (!this.auth.promoterId) return
      this.promoterSessions[this.auth.promoterId] = cloneSeed({
        joinedRoutes: this.joinedRoutes,
        sharedProductIds: this.sharedProductIds,
        fans: this.fans,
        commissionEntries: this.commissionEntries,
        promotionRecords: this.promotionRecords
      })
    },
    activatePromoterAccount(account: PromoterAccount, promoter: Promoter) {
      const previousPromoterId = this.auth.promoterId
      if (previousPromoterId && previousPromoterId !== promoter.id) this.saveCurrentPromoterSession()
      const session = this.promoterSessions[promoter.id]
      if (session) this.$patch(cloneSeed(session))
      else if (previousPromoterId !== promoter.id && promoter.id !== 'T001') {
        this.$patch({ joinedRoutes: [], sharedProductIds: [], fans: [], commissionEntries: [], promotionRecords: [] })
      } else if (previousPromoterId && previousPromoterId !== promoter.id) {
        this.$patch({ joinedRoutes: [], sharedProductIds: [], fans: [], commissionEntries: [], promotionRecords: [] })
      }
      this.promoter = cloneSeed(promoter)
      const principal: PlatformPrincipal = { actorType: 'alliance', actorId: promoter.id, tenantId: promoter.id, status: 'active' }
      this.auth = { isLoggedIn: true, phone: account.account, principal, accountId: account.id, promoterId: promoter.id }
      return true
    },
    loginWithPassword(phone: string, password: string) {
      const result = authenticatePromoter(this.promoterAccounts(), promoters, phone, password)
      return result.ok ? this.activatePromoterAccount(result.account, result.promoter) : false
    },
    loginWithCode(phone: string, code: string) {
      if (!validateSmsCode(code)) return false
      const account = this.promoterAccounts().find((item) => item.account === phone.trim())
      if (!account) return false
      const result = authenticatePromoter([account], promoters, account.account, account.password)
      return result.ok ? this.activatePromoterAccount(result.account, result.promoter) : false
    },
    async refreshSharedState() {
      if (!this.auth.isLoggedIn || !this.auth.accountId) return
      const account = this.promoterAccounts().find((item) => item.id === this.auth.accountId)
      const promoter = promoters.find((item) => item.id === this.auth.promoterId)
      if (!account?.enabled || !promoter || promoter.status !== 'active') {
        this.logout()
        return
      }
      await this.initialize(true)
      this.syncWithdrawals()
    },
    logout() {
      this.saveCurrentPromoterSession()
      this.auth = { isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' }
    }
  }
})
