import { defineStore } from 'pinia'
import type { FarmStore, LiveRoom, MockScenario, Product } from '@agritainment/shared'
import { getOrCreateUserId, readUserBindings, resolveUserIdentity, simulateWechatLogin, upsertUserBinding } from '@agritainment/shared'
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
  auth: { isLoggedIn: boolean; openid: string }
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
    userId: '',
    auth: { isLoggedIn: false, openid: '' }
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
      // 链接参数优先；无参数时复用本地已记录的直播号 / 推客ID（首次进入仍需链接或二维码）
      const savedLive = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-live-id') : ''
      const savedPromoter = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-promoter-id') : ''
      const savedName = typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('agritainment-user-promoter-name') : ''
      this.liveId = query.live || (typeof savedLive === 'string' ? savedLive : '') || ''
      this.promoterId = query.promoter || (typeof savedPromoter === 'string' ? savedPromoter : '') || ''
      this.promoterName = query.promoterName || (typeof savedName === 'string' ? savedName : '') || ''
      if (this.liveId && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-live-id', this.liveId)
      if (this.promoterId && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-id', this.promoterId)
      if (this.promoterName && typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-promoter-name', this.promoterName)
      // 用户ID：URL 传入优先；否则已授权 openid 解析统一 ID；最后本地匿名 ID
      if (query.userId && query.userId.length > 2) {
        this.userId = query.userId
        if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', query.userId)
      } else if (!this.userId) {
        this.userId = this.auth.openid ? resolveUserIdentity(this.auth.openid) : getOrCreateUserId()
      }
      if (!this.userId || !this.promoterId) return
      const bindings = readUserBindings() ?? {}
      const existing = bindings[this.userId]
      if (existing && existing.status === 'bound') return
      upsertUserBinding({ userId: this.userId, promoterId: this.promoterId, status: 'pending' })
    },
    async wechatLogin() {
      const { openid } = await simulateWechatLogin()
      this.auth = { isLoggedIn: true, openid }
      this.userId = resolveUserIdentity(openid)
      if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('agritainment-user-id', this.userId)
      return { openid, userId: this.userId }
    }
  }
})
