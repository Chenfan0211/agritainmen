import { defineStore } from 'pinia'
import type { BusinessMediaValue, FarmStore, LiveRoom, MediaAssetRepository, MockScenario, PlatformPrincipal, Product, Promoter, PromoterAccount, ShareRecord, UserBinding } from '@agritainment/shared'
import { authenticatePromoter, buildPromoterAccountSeeds, cloneSeed, createId, mergePlatformEntities, mergePlatformPromoterAccounts, promoters, readCatalogState, readPlatformCommissionLedger, readPlatformCommissionSettlement, readPlatformEntities, readPlatformPromoterAccountState, readPlatformPromoterAccounts, readShareRecords, readStoreCatalogSelections, readUserBindings, removePlatformLive, replaceMediaReference, seedPlatformDemoData, writePlatformLive, writePlatformPromoterAccounts } from '@agritainment/shared'
import { promoterRepository } from '../services/repository'

const DEFAULT_LIVE_COVER: BusinessMediaValue = { source: 'builtin', path: '/static/images/farmhouse.webp' }
const liveCoverBinding = (liveId: string) => `promoter:live:cover:${liveId}`
const resolveLiveCover = (value: BusinessMediaValue | null | undefined): BusinessMediaValue => value || DEFAULT_LIVE_COVER

interface PromoterState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  promoter: Promoter | null
  auth: { isLoggedIn: boolean; phone: string; principal: PlatformPrincipal | null; accountId: string; promoterId: string }
  farms: FarmStore[]
  products: Product[]
  liveRooms: LiveRoom[]
}

function validLiveSelection(linkedFarms: NonNullable<LiveRoom['linkedFarms']>): boolean {
  const catalog = readCatalogState()
  if (!catalog || !linkedFarms.length || linkedFarms.some((item) => !item.packageIds.length)) return false
  const selections = readStoreCatalogSelections()
  return linkedFarms.every((linked) => linked.packageIds.every((productId) => {
    const selected = selections.some((item) => item.storeId === linked.farmId && item.productId === productId && item.listed)
    const product = catalog.products.find((item) => item.id === productId)
    return selected && product?.status === 'active' && product.productType === 'package' && product.skus.some((sku) => sku.status !== 'retired')
  }))
}

export const usePromoterStore = defineStore('promoter', {
  state: (): PromoterState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    promoter: null,
    auth: { isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' },
    farms: [],
    products: [],
    liveRooms: []
  }),
  getters: {
    myLives: (state) => state.liveRooms.filter((item) => item.promoterId === state.promoter?.id),
    myShares: (state): ShareRecord[] => {
      const records = readShareRecords() ?? []
      return records.filter((item) => item.role === 'promoter' && item.promoterId === state.promoter?.id)
    },
    myBoundUsers: (state): Array<UserBinding> => {
      const bindings = readUserBindings() ?? {}
      return Object.values(bindings).filter((item) => item.promoterId === state.promoter?.id)
    },
    ledgerEntries: (state) => Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    pendingLedgerCommission: (state) => Math.round(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id && item.status === 'pending').reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    availableLedgerCommission: (state) => Math.round(Object.values(readPlatformCommissionLedger() || {}).filter((item) => item.beneficiaryId === state.promoter?.id && item.status === 'available').reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  },
  actions: {
    promoterDirectory(): Promoter[] {
      return mergePlatformEntities(cloneSeed(promoters), readPlatformEntities()?.promoters)
    },
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        const data = await promoterRepository.loadDashboard(this.mockScenario)
        this.$patch({
          farms: data.farms,
          products: data.products,
          liveRooms: data.liveRooms,
          promoter: this.auth.promoterId ? cloneSeed(this.promoterDirectory().find((item) => item.id === this.auth.promoterId) || null) : data.promoter,
          initialized: true
        })
        this.liveRooms.forEach((room) => {
          if (room.status !== 'live' || validLiveSelection(room.linkedFarms || [])) return
          room.status = 'preview'
          writePlatformLive(room)
        })
        seedPlatformDemoData()
        const settlement = readPlatformCommissionSettlement(this.promoter?.id || '')
        if (this.promoter && settlement) {
          this.promoter.commission = settlement.commission
          this.promoter.settled = settlement.settled
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    promoterAccounts(): PromoterAccount[] {
      const defaults = buildPromoterAccountSeeds(this.promoterDirectory())
      const saved = readPlatformPromoterAccounts()
      if (!saved || saved.length === 0) writePlatformPromoterAccounts(defaults, readPlatformPromoterAccountState()?.revision ?? 0)
      return mergePlatformPromoterAccounts(defaults, readPlatformPromoterAccounts())
    },
    login(phone: string, password: string) {
      const result = authenticatePromoter(this.promoterAccounts(), this.promoterDirectory(), phone, password)
      if (!result.ok) return false
      this.promoter = cloneSeed(result.promoter)
      const principal: PlatformPrincipal = { actorType: 'promoter', actorId: result.promoter.id, tenantId: result.promoter.id, status: 'active' }
      this.auth = { isLoggedIn: true, phone: result.account.account, principal, accountId: result.account.id, promoterId: result.promoter.id }
      return true
    },
    async refreshSharedState() {
      if (!this.auth.isLoggedIn || !this.auth.accountId) return
      const account = this.promoterAccounts().find((item) => item.id === this.auth.accountId)
      const promoter = this.promoterDirectory().find((item) => item.id === this.auth.promoterId)
      if (!account?.enabled || !promoter || promoter.status !== 'active') {
        this.logout()
        return
      }
      await this.initialize(true)
    },
    logout() {
      this.auth = { isLoggedIn: false, phone: '', principal: null, accountId: '', promoterId: '' }
    },
    async createLive(payload: { title: string; image: BusinessMediaValue; status: LiveRoom['status']; linkedFarms: NonNullable<LiveRoom['linkedFarms']>; hostRole?: string }, storage: MediaAssetRepository) {
      if (!this.promoter || !payload.title.trim()) return false
      if (!validLiveSelection(payload.linkedFarms)) return false
      const room: LiveRoom = {
        id: createId('PL'),
        title: payload.title.trim(),
        host: this.promoter.name,
        hostRole: payload.hostRole || '推客主播',
        viewers: 0,
        productName: '',
        productPrice: 0,
        status: payload.status,
        reminded: false,
        image: resolveLiveCover(payload.image),
        promoterId: this.promoter.id,
        linkedFarms: payload.linkedFarms,
        city: '湘西州'
      }
      try {
        await replaceMediaReference(storage, liveCoverBinding(room.id), undefined, payload.image, async (image) => {
          room.image = resolveLiveCover(image)
          if (!writePlatformLive(room)) throw new Error('直播保存失败')
          return room
        })
      } catch {
        return false
      }
      this.liveRooms.unshift(room)
      return true
    },
    async updateLive(id: string, payload: { title: string; image: BusinessMediaValue; status: LiveRoom['status']; linkedFarms: NonNullable<LiveRoom['linkedFarms']>; hostRole?: string }, storage: MediaAssetRepository) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room || !payload.title.trim() || !validLiveSelection(payload.linkedFarms)) return false
      try {
        const next = await replaceMediaReference(storage, liveCoverBinding(id), room.image, payload.image, async (image) => {
          const saved = { ...room, title: payload.title.trim(), image: resolveLiveCover(image), status: payload.status, linkedFarms: payload.linkedFarms, hostRole: payload.hostRole || room.hostRole || '推客主播' }
          if (!writePlatformLive(saved)) throw new Error('直播保存失败')
          return saved
        })
        Object.assign(room, next)
      } catch {
        return false
      }
      return true
    },
    toggleLiveStatus(id: string) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room) return false
      const status = room.status === 'live' ? 'preview' : 'live'
      if (status === 'live' && !validLiveSelection(room.linkedFarms || [])) return false
      if (!writePlatformLive({ ...room, status })) return false
      room.status = status
      return true
    },
    removeLive(id: string) {
      const index = this.liveRooms.findIndex((item) => item.id === id)
      if (index < 0) return false
      if (!removePlatformLive(id)) return false
      this.liveRooms.splice(index, 1)
      return true
    }
  }
})
