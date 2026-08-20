import { defineStore } from 'pinia'
import type { FarmStore, LiveRoom, MockScenario, Product, Promoter, ShareRecord, UserBinding } from '@agritainment/shared'
import { DEMO_PASSWORD, createId, readPlatformCommissionSettlement, readShareRecords, readUserBindings, removePlatformLive, seedPlatformDemoData, validatePhone, writePlatformLive } from '@agritainment/shared'
import { promoterRepository } from '../services/repository'

interface PromoterState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  promoter: Promoter | null
  auth: { isLoggedIn: boolean; phone: string }
  farms: FarmStore[]
  products: Product[]
  liveRooms: LiveRoom[]
}

export const usePromoterStore = defineStore('promoter', {
  state: (): PromoterState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    promoter: null,
    auth: { isLoggedIn: false, phone: '' },
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
    myBoundUsers: (): Array<UserBinding> => {
      const bindings = readUserBindings() ?? {}
      return Object.values(bindings).filter((item) => item.promoterId)
    }
  },
  actions: {
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
          promoter: data.promoter,
          initialized: true
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
    login(phone: string, password: string) {
      if (!validatePhone(phone) || password !== DEMO_PASSWORD) return false
      this.auth = { isLoggedIn: true, phone }
      return true
    },
    logout() {
      this.auth = { isLoggedIn: false, phone: '' }
    },
    createLive(payload: { title: string; image: string; status: LiveRoom['status']; linkedFarms: NonNullable<LiveRoom['linkedFarms']> }) {
      if (!this.promoter || !payload.title.trim()) return false
      if (!payload.linkedFarms.length) return false
      if (payload.linkedFarms.some((item) => !item.packageIds.length)) return false
      const room: LiveRoom = {
        id: createId('PL'),
        title: payload.title.trim(),
        host: this.promoter.name,
        hostRole: '推客主播',
        viewers: 0,
        productName: '',
        productPrice: 0,
        status: payload.status,
        reminded: false,
        image: payload.image || '/static/images/farmhouse.webp',
        promoterId: this.promoter.id,
        linkedFarms: payload.linkedFarms,
        city: '湘西州'
      }
      this.liveRooms.unshift(room)
      writePlatformLive(room)
      return true
    },
    updateLive(id: string, payload: { title: string; image: string; status: LiveRoom['status']; linkedFarms: NonNullable<LiveRoom['linkedFarms']> }) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room || !payload.title.trim()) return false
      room.title = payload.title.trim()
      room.image = payload.image
      room.status = payload.status
      room.linkedFarms = payload.linkedFarms
      writePlatformLive(room)
      return true
    },
    toggleLiveStatus(id: string) {
      const room = this.liveRooms.find((item) => item.id === id)
      if (!room) return false
      room.status = room.status === 'live' ? 'preview' : 'live'
      writePlatformLive(room)
      return true
    },
    removeLive(id: string) {
      const index = this.liveRooms.findIndex((item) => item.id === id)
      if (index < 0) return false
      this.liveRooms.splice(index, 1)
      removePlatformLive(id)
      return true
    }
  }
})
