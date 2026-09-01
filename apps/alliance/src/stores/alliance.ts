import { defineStore } from 'pinia'
import type { AllianceBooking, CommissionEntry, CommissionLedgerEntry, CommissionRule, FarmStore, LiveRoom, MockScenario, PlatformJournalEntry, PlatformPrincipal, Product, Promoter, PromoterAccount, PromotionRecord, TravelRoute, WithdrawalRequest } from '@agritainment/shared'
import { PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_RECOVERY_QUEUE_STORAGE_KEY, PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY, applyPlatformMedia, authenticatePromoter, buildPortalUrl, buildPromoterAccountSeeds, cloneSeed, commissionRules as seedCommissionRules, createId, createStrictSnapshotRecoveryHandlerRegistration, initializePlatformRecoveryHandlers, mergeEntitySeeds, mergePersistedDefaults, mergePlatformEntities, mergePlatformPromoterAccounts, promoters, readPlatformCollectionRevision, readPlatformCommissionSettlement, readPlatformEntities, readPlatformPromoterAccountState, readPlatformBookings, readPlatformCommissionLedger, readPlatformPromoterAccounts, readPlatformWithdrawals, readUserBindings, reconcilePendingPlatformTransactions, runLockedPlatformCollectionTask, runLockedPlatformTransaction, validateSmsCode, writePlatformBooking, writePlatformCommissionLedger, writePlatformPromoterAccounts, writePlatformWithdrawal, round2 } from '@agritainment/shared'
import { allianceRepository } from '../services/repository'

interface FanRecord {
  id: string
  name: string
  source: string
  lockedAt: string
}

const ALLIANCE_WITHDRAWAL_RECOVERY_HANDLER_KEY = 'alliance-withdrawal-v1'
const ALLIANCE_WITHDRAWAL_RECOVERY_SCHEMA = 'alliance-withdrawal-snapshot-v1'
const ALLIANCE_WITHDRAWAL_COLLECTIONS = [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY] as const
type AllianceWithdrawalSubmissionResult = 'pending' | 'duplicate' | 'invalid' | 'insufficient' | false

interface AllianceWithdrawalSnapshot {
  ledger: Record<string, CommissionLedgerEntry>
  request: WithdrawalRequest
}

interface AllianceWithdrawalRevisionToken {
  ledger: number
  withdrawals: number
}

function sameSnapshotValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function reservedPromoterWithdrawalAmount(
  promoterId: string,
  withdrawals: readonly WithdrawalRequest[],
  ledger: Record<string, CommissionLedgerEntry>
): number {
  return round2(withdrawals
    .filter((item) => item.requesterType === 'promoter' && item.requesterId === promoterId)
    .reduce((sum, item) => {
      if (item.status === 'pending') return sum + item.amount
      if (item.status !== 'approved') return sum
      const consumed = ledger[`WD-${item.requestKey}`]
      return consumed
        && consumed.sourceOrderId === item.requestKey
        && consumed.beneficiaryId === promoterId
        && consumed.role === 'withdrawal'
        && consumed.amount === -item.amount
        ? sum
        : sum + item.amount
    }, 0))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isAllianceWithdrawalSnapshot(value: unknown): value is AllianceWithdrawalSnapshot {
  return isRecord(value) && isRecord(value.ledger) && isRecord(value.request)
}

function isAllianceWithdrawalJournal(journal: PlatformJournalEntry): boolean {
  if (journal.recoveryHandlerKey !== ALLIANCE_WITHDRAWAL_RECOVERY_HANDLER_KEY
    || journal.recoverySchema !== ALLIANCE_WITHDRAWAL_RECOVERY_SCHEMA
    || !isAllianceWithdrawalSnapshot(journal.original)
    || !isAllianceWithdrawalSnapshot(journal.target)) return false
  const businessCollections = journal.collections.filter((key) => key !== PLATFORM_TRANSACTION_JOURNAL_STORAGE_KEY && key !== PLATFORM_RECOVERY_QUEUE_STORAGE_KEY)
  if (businessCollections.length !== ALLIANCE_WITHDRAWAL_COLLECTIONS.length || ALLIANCE_WITHDRAWAL_COLLECTIONS.some((key) => !businessCollections.includes(key))) return false
  const original = journal.original
  const target = journal.target
  const request = original.request
  if (!sameSnapshotValue(request, target.request)
    || request.requesterType !== 'promoter'
    || request.status !== 'approved'
    || !request.id?.trim()
    || !request.requesterId?.trim()
    || !request.requestKey?.trim()
    || !Number.isFinite(request.amount)
    || request.amount <= 0
    || journal.operationId !== `alliance-withdrawal-consume:${request.requestKey}`) return false
  const entryId = `WD-${request.requestKey}`
  const changedLedgerIds = [...new Set([...Object.keys(original.ledger), ...Object.keys(target.ledger)])]
    .filter((id) => !sameSnapshotValue(original.ledger[id], target.ledger[id]))
  if (changedLedgerIds.length !== 1 || changedLedgerIds[0] !== entryId || original.ledger[entryId]) return false
  return sameSnapshotValue(target.ledger[entryId], {
    id: entryId,
    sourceOrderId: request.requestKey,
    beneficiaryType: 'promoter',
    beneficiaryId: request.requesterId,
    role: 'withdrawal',
    amount: -request.amount,
    status: 'settled',
    createdAt: request.reviewedAt || request.createdAt
  })
}

function readStableAllianceWithdrawalSnapshot(requestId: string): { snapshot: AllianceWithdrawalSnapshot; token: AllianceWithdrawalRevisionToken } | null {
  const before = {
    ledger: readPlatformCollectionRevision(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY),
    withdrawals: readPlatformCollectionRevision(PLATFORM_WITHDRAWALS_STORAGE_KEY)
  }
  const ledger = cloneSeed(readPlatformCommissionLedger() || {})
  const persistedRequest = readPlatformWithdrawals()?.[requestId]
  const request = persistedRequest ? cloneSeed(persistedRequest) : null
  const after = {
    ledger: readPlatformCollectionRevision(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY),
    withdrawals: readPlatformCollectionRevision(PLATFORM_WITHDRAWALS_STORAGE_KEY)
  }
  return request && sameSnapshotValue(before, after) ? { snapshot: { ledger, request }, token: after } : null
}

const allianceWithdrawalRecovery = createStrictSnapshotRecoveryHandlerRegistration<AllianceWithdrawalSnapshot, AllianceWithdrawalRevisionToken>({
  key: ALLIANCE_WITHDRAWAL_RECOVERY_HANDLER_KEY,
  fields: ['ledger', 'request'],
  validateJournal: isAllianceWithdrawalJournal,
  readStable: (journal) => readStableAllianceWithdrawalSnapshot((journal.original as AllianceWithdrawalSnapshot).request.id),
  isStillStable: (token) => token.ledger === readPlatformCollectionRevision(PLATFORM_COMMISSION_LEDGER_STORAGE_KEY)
    && token.withdrawals === readPlatformCollectionRevision(PLATFORM_WITHDRAWALS_STORAGE_KEY),
  writeSnapshot: (snapshot) => writePlatformCommissionLedger(snapshot.ledger)
})

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
      const ledger = readPlatformCommissionLedger() || {}
      const entries = Object.values(ledger).filter((item) => item.beneficiaryId === state.promoter?.id && (item.status === 'available' || (item.amount < 0 && item.status !== 'reversed')))
      const gross = Math.round(entries.reduce((sum, item) => sum + item.amount, 0) * 100) / 100 + 0 * touch
      const reserved = state.promoter?.id ? reservedPromoterWithdrawalAmount(state.promoter.id, Object.values(readPlatformWithdrawals() || {}), ledger) : 0
      return Math.max(0, round2(gross - reserved) + 0 * state.withdrawalsTick)
    },
    pendingWithdrawalAmount: (state) => Object.values(readPlatformWithdrawals() || {}).filter((item) => item.requesterId === state.promoter?.id && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) + 0 * state.withdrawalsTick,
    withdrawalRecords: (state): WithdrawalRequest[] => {
      void state.withdrawalsTick
      return Object.values(readPlatformWithdrawals() || {})
        .filter((item) => item.requesterType === 'promoter' && item.requesterId === state.promoter?.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    },
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
    promoterDirectory(): Promoter[] {
      return mergePlatformEntities(cloneSeed(promoters), readPlatformEntities()?.promoters)
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      const hasPersistedData = !force && this.mockScenario === 'normal' && this.farms.length > 0 && this.products.length > 0
      this.loading = true
      this.error = ''
      try {
        initializePlatformRecoveryHandlers([allianceWithdrawalRecovery])
        const reconciliation = reconcilePendingPlatformTransactions({ handlerKey: ALLIANCE_WITHDRAWAL_RECOVERY_HANDLER_KEY, matches: isAllianceWithdrawalJournal })
        if (!reconciliation.ok) throw new Error(reconciliation.message)
        const data = await allianceRepository.loadDiscovery(this.mockScenario)
        this.$patch({
          farms: hasPersistedData ? mergeEntitySeeds(data.farms, this.farms) : data.farms,
          liveRooms: hasPersistedData ? mergeEntitySeeds(data.liveRooms, this.liveRooms) : data.liveRooms,
          products: hasPersistedData ? mergeEntitySeeds(data.products, this.products) : data.products,
          promoter: this.auth.promoterId
            ? cloneSeed(this.promoterDirectory().find((item) => item.id === this.auth.promoterId) || null)
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
    async withdraw(amount: number, method: string, requestKey: string): Promise<AllianceWithdrawalSubmissionResult> {
      const promoterId = this.promoter?.id
      if (!promoterId || !Number.isFinite(amount) || amount <= 0) return 'invalid'
      const result = await runLockedPlatformCollectionTask<AllianceWithdrawalSubmissionResult>({
        collections: [PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, PLATFORM_WITHDRAWALS_STORAGE_KEY],
        execute: () => {
          const withdrawals = Object.values(readPlatformWithdrawals() || {})
          if (withdrawals.some((item) => item.requesterType === 'promoter' && item.requesterId === promoterId && item.status === 'pending')) return 'duplicate'
          if (requestKey && (this.commissionEntries.some((item) => item.type === 'withdrawal' && item.requestKey === requestKey) || withdrawals.some((item) => item.requestKey === requestKey && item.requesterId === promoterId))) return 'duplicate'
          const ledger = readPlatformCommissionLedger() || {}
          const gross = round2(Object.values(ledger)
            .filter((item) => item.beneficiaryId === promoterId && (item.status === 'available' || (item.amount < 0 && item.status !== 'reversed')))
            .reduce((sum, item) => sum + item.amount, 0))
          const reserved = reservedPromoterWithdrawalAmount(promoterId, withdrawals, ledger)
          if (amount > Math.max(0, round2(gross - reserved))) return 'insufficient'
          const id = requestKey || createId('WD')
          return writePlatformWithdrawal({ id, requesterType: 'promoter', requesterId: promoterId, amount, method, status: 'pending', requestKey: id, createdAt: new Date().toISOString() }) ? 'pending' : false
        }
      })
      if (!result.ok) {
        this.error = result.message
        return false
      }
      if (result.value === 'pending') this.withdrawalsTick += 1
      return result.value ?? false
    },
    async syncWithdrawals() {
      if (!this.promoter?.id) return
      const promoterId = this.promoter.id
      const requests = Object.values(readPlatformWithdrawals() || {})
        .filter((item) => item.requesterType === 'promoter' && item.requesterId === promoterId && item.status === 'approved')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      for (const request of requests) {
        const entryId = `WD-${request.requestKey}`
        const stable = readStableAllianceWithdrawalSnapshot(request.id)
        if (!stable) continue
        const { ledger } = stable.snapshot
        const persistedRequest = stable.snapshot.request
        if (persistedRequest.status !== 'approved' || persistedRequest.requesterType !== 'promoter' || persistedRequest.requesterId !== promoterId || persistedRequest.requestKey !== request.requestKey) continue
        const existing = ledger[entryId]
        if (existing) {
          if (existing.sourceOrderId !== persistedRequest.requestKey || existing.beneficiaryId !== promoterId || existing.role !== 'withdrawal' || existing.amount !== -persistedRequest.amount) this.error = '提现账本记录冲突，请联系平台处理'
          continue
        }
        const entry = { id: entryId, sourceOrderId: persistedRequest.requestKey, beneficiaryType: 'promoter' as const, beneficiaryId: promoterId, role: 'withdrawal' as const, amount: -persistedRequest.amount, status: 'settled' as const, createdAt: persistedRequest.reviewedAt || persistedRequest.createdAt }
        const targetLedger = { ...ledger, [entryId]: entry }
        const result = await runLockedPlatformTransaction({
          operationId: `alliance-withdrawal-consume:${persistedRequest.requestKey}`,
          collections: [...ALLIANCE_WITHDRAWAL_COLLECTIONS],
          original: stable.snapshot,
          target: { ledger: targetLedger, request: persistedRequest },
          recoveryHandlerKey: ALLIANCE_WITHDRAWAL_RECOVERY_HANDLER_KEY,
          recoverySchema: ALLIANCE_WITHDRAWAL_RECOVERY_SCHEMA,
          revisionChecks: [
            { key: PLATFORM_COMMISSION_LEDGER_STORAGE_KEY, expectedRevision: stable.token.ledger },
            { key: PLATFORM_WITHDRAWALS_STORAGE_KEY, expectedRevision: stable.token.withdrawals }
          ],
          validate: () => {
            const current = readPlatformWithdrawals()?.[persistedRequest.id]
            return sameSnapshotValue(current, persistedRequest) && !readPlatformCommissionLedger()?.[entryId]
          },
          steps: [{ key: 'commission-ledger', apply: () => writePlatformCommissionLedger(targetLedger), rollback: () => writePlatformCommissionLedger(ledger) }]
        })
        if (!result.ok && result.code !== 'revision_conflict' && result.code !== 'validation_failed') this.error = result.message
      }
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
      const defaults = buildPromoterAccountSeeds(this.promoterDirectory())
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
      const result = authenticatePromoter(this.promoterAccounts(), this.promoterDirectory(), phone, password)
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
      await this.syncWithdrawals()
    },
    logout() {
      this.saveCurrentPromoterSession()
      this.auth = { isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' }
    }
  }
})
