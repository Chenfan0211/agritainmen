import {
  buildDashboardSnapshot,
  createPlatformDashboardDataSource,
  dashboardRegion,
  dashboardRegionAllowed,
  subscribePlatformChanges,
  type DashboardPrincipal,
  type DashboardRange,
  type DashboardRole,
  type DashboardSnapshot
} from '@agritainment/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type DashboardRangeKey = '7d' | '30d' | '90d' | 'year'

export const DASHBOARD_SESSION_KEY = 'agritainment-dashboard-session'

interface DashboardAccount {
  account: string
  password: string
  principal: DashboardPrincipal
}

const dashboardAccounts: DashboardAccount[] = [
  { account: 'leader', password: '123456', principal: { id: 'dashboard-leader', name: '产业发展领导', role: 'leader', regionCodes: ['43'], status: 'active' } },
  { account: 'regulator', password: '123456', principal: { id: 'dashboard-regulator', name: '长沙监管分析员', role: 'regulator', regionCodes: ['4301'], status: 'active' } },
  { account: 'service', password: '123456', principal: { id: 'dashboard-service', name: '长沙产业服务专员', role: 'industry_service', regionCodes: ['4301'], status: 'active' } }
]

export function canSelectDashboardRegion(principal: DashboardPrincipal, regionCode: string): boolean {
  return dashboardRegionAllowed(regionCode, principal.regionCodes)
}

function clonePrincipal(principal: DashboardPrincipal): DashboardPrincipal {
  return { ...principal, regionCodes: [...principal.regionCodes] }
}

function saveSession(principalId: string | null) {
  try {
    if (principalId) localStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({ principalId }))
    else localStorage.removeItem(DASHBOARD_SESSION_KEY)
  } catch {
    // Session persistence is optional in restricted browser environments.
  }
}

function readSessionPrincipalId(): string {
  try {
    const value = JSON.parse(localStorage.getItem(DASHBOARD_SESSION_KEY) || '{}') as { principalId?: unknown }
    return typeof value.principalId === 'string' ? value.principalId : ''
  } catch {
    return ''
  }
}

function rangeFor(key: DashboardRangeKey, now = new Date()): DashboardRange {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  if (key === 'year') start.setMonth(0, 1)
  else start.setDate(start.getDate() - ({ '7d': 6, '30d': 29, '90d': 89 } as const)[key])
  start.setHours(0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

export const useDashboardStore = defineStore('dashboard', () => {
  const principal = ref<DashboardPrincipal | null>(null)
  const regionCode = ref('')
  const rangeKey = ref<DashboardRangeKey>('30d')
  const snapshot = ref<DashboardSnapshot | null>(null)
  const refreshing = ref(false)
  const lastError = ref('')
  const lastSuccessfulAt = ref('')
  let unsubscribe: (() => void) | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshSequence = 0

  const authenticated = computed(() => principal.value?.status === 'active')
  const role = computed<DashboardRole>(() => principal.value?.role || 'leader')

  function applyPrincipal(next: DashboardPrincipal) {
    principal.value = clonePrincipal(next)
    regionCode.value = next.regionCodes[0] || ''
  }

  function login(account: string, password: string): boolean {
    const matched = dashboardAccounts.find((item) => item.account === account.trim() && item.password === password && item.principal.status === 'active')
    if (!matched) return false
    applyPrincipal(matched.principal)
    saveSession(matched.principal.id)
    return true
  }

  function restoreSession(): boolean {
    const principalId = readSessionPrincipalId()
    const matched = dashboardAccounts.find((item) => item.principal.id === principalId && item.principal.status === 'active')
    if (!matched) {
      saveSession(null)
      return false
    }
    applyPrincipal(matched.principal)
    return true
  }

  function logout() {
    stopSubscription()
    principal.value = null
    regionCode.value = ''
    snapshot.value = null
    lastError.value = ''
    saveSession(null)
  }

  async function refresh() {
    const requestSequence = ++refreshSequence
    if (!principal.value) {
      snapshot.value = null
      lastError.value = '请先登录'
      return
    }
    refreshing.value = true
    lastError.value = ''
    try {
      const now = new Date()
      const range = rangeFor(rangeKey.value, now)
      let source = createPlatformDashboardDataSource()
      if (import.meta.env.VITE_DASHBOARD_DEMO_FALLBACK !== 'false') {
        const { supplementDashboardDataSource } = await import('../data/demo-data')
        source = supplementDashboardDataSource(source, range, now)
      }
      const nextSnapshot = buildDashboardSnapshot(source, {
        principal: { ...principal.value, regionCodes: [regionCode.value] },
        range,
        now
      })
      if (requestSequence !== refreshSequence) return
      snapshot.value = nextSnapshot
      lastSuccessfulAt.value = now.toISOString()
    } catch (error) {
      if (requestSequence !== refreshSequence) return
      lastError.value = error instanceof Error ? error.message : '数据加载失败'
    } finally {
      if (requestSequence === refreshSequence) setTimeout(() => { refreshing.value = false }, 180)
    }
  }

  function setRegion(next: string): boolean {
    if (!principal.value || !canSelectDashboardRegion(principal.value, next)) return false
    regionCode.value = next
    refresh()
    return true
  }
  function goToParentRegion(): boolean {
    if (!principal.value) return false
    const parentCode = dashboardRegion(regionCode.value)?.parentCode
    if (!parentCode || !canSelectDashboardRegion(principal.value, parentCode)) return false
    return setRegion(parentCode)
  }
  function setRange(next: DashboardRangeKey) { rangeKey.value = next; refresh() }

  function startSubscription() {
    if (unsubscribe) return
    unsubscribe = subscribePlatformChanges(() => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refresh, 300)
    })
  }

  function stopSubscription() {
    unsubscribe?.()
    unsubscribe = null
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
  }

  return {
    role, regionCode, rangeKey, snapshot, refreshing, lastError, lastSuccessfulAt, principal, authenticated,
    login, restoreSession, logout, refresh, setRegion, goToParentRegion, setRange, startSubscription, stopSubscription
  }
})
