import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { migratePersistedState, persistedEnvelope, purgeRetiredAllianceData } from '@agritainment/shared'
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
import App from './App.vue'

const h5MediaRuntime = createH5MediaRuntime()
configureMediaRuntime(h5MediaRuntime)

const persistedKeys = ['suppliers', 'products', 'categories', 'orders', 'afterSales', 'farms', 'promoters', 'policies', 'commissionRules', 'lastSettledAt', 'supplierSettlementRecords', 'commissionSettlementRecords', 'exportRecords', 'notificationsRead', 'auth', 'dictGroups', 'dictItems', 'storeAccounts'] as const

export function createApp() {
  purgeRetiredAllianceData()
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(({ store }) => {
    const key = `agritainment-admin-${store.$id}`
    const saved = uni.getStorageSync(key)
    if (saved) store.$patch(migratePersistedState(saved, store.$state))
    store.$subscribe((_mutation, state) => uni.setStorageSync(key, persistedEnvelope(state, persistedKeys)), { detached: true })
  })
  app.use(pinia)
  return { app }
}
