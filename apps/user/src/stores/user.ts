import { defineStore } from 'pinia'
import type { FarmStore, LiveRoom, MockScenario, Product } from '@agritainment/shared'
import { createId, readUserBindings, upsertUserBinding } from '@agritainment/shared'
import { userRepository } from '../services/repository'

interface UserState {
  initialized: boolean
  loading: boolean
  error: string
  mockScenario: MockScenario
  farms: FarmStore[]
  products: Product[]
  liveRooms: LiveRoom[]
  liveId: string
  promoterId: string
  promoterName: string
  userId: string
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    initialized: false,
    loading: false,
    error: '',
    mockScenario: 'normal',
    farms: [],
    products: [],
    liveRooms: [],
    liveId: '',
    promoterId: '',
    promoterName: '',
    userId: ''
  }),
  getters: {
    currentLive: (state) => state.liveRooms.find((item) => item.id === state.liveId) || null,
    liveFarms: (state) => {
      const live = state.liveRooms.find((item) => item.id === state.liveId)
      if (!live?.linkedFarms?.length) return []
      return live.linkedFarms.map((item) => {
        const farm = state.farms.find((f) => f.id === item.farmId)
        return {
          farm,
          packages: item.packageIds
            .map((id) => state.products.find((p) => p.id === id))
            .filter((p): p is Product => !!p)
        }
      }).filter((item) => item.farm)
    }
  },
  actions: {
    async initialize(force = false) {
      if ((!force && this.initialized) || this.loading) return
      this.loading = true
      this.error = ''
      try {
        const data = await userRepository.loadDashboard(this.mockScenario)
        this.$patch({ farms: data.farms, products: data.products, liveRooms: data.liveRooms, initialized: true })
      } catch (error) {
        this.error = error instanceof Error ? error.message : '数据加载失败'
      } finally {
        this.loading = false
      }
    },
    applyLaunch(query: Record<string, string | undefined>) {
      this.liveId = query.live || ''
      this.promoterId = query.promoter || ''
      this.promoterName = query.promoterName || ''
      if (query.userId && query.userId.length > 2) {
        this.userId = query.userId
        if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', query.userId)
      } else {
        const saved = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-id') : ''
        this.userId = typeof saved === 'string' && saved ? saved : createId('U')
        if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', this.userId)
      }
      const bindings = readUserBindings() ?? {}
      const existing = bindings[this.userId]
      if (existing && existing.status === 'bound') return
      if (this.promoterId) upsertUserBinding({ userId: this.userId, promoterId: this.promoterId, status: 'pending' })
    }
  }
})
