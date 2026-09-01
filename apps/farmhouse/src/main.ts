import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { initializePlatformRecoveryHandlers, migratePersistedState, persistedEnvelope, reconcilePendingPlatformTransactions } from '@agritainment/shared'
import './media-runtime'
import App from './App.vue'
import { resolveRuntimeTenant } from './config/tenant'
import { createFarmhouseAtomicRecoveryHandlerRegistrations } from './stores/farmhouse'

const persistedKeys = ['tenant', 'farm', 'member', 'role', 'products', 'selectableProducts', 'overrides', 'cart', 'bookings', 'orders', 'rooms', 'experiences', 'shares', 'balanceEntries', 'promotionRecords', 'foods', 'deliveryAddress', 'auth'] as const

export function createApp() {
  const recoveryHandlers = createFarmhouseAtomicRecoveryHandlerRegistrations()
  initializePlatformRecoveryHandlers(recoveryHandlers)
  recoveryHandlers.forEach(({ key }) => reconcilePendingPlatformTransactions({ handlerKey: key }))
  const app = createSSRApp(App)
  const pinia = createPinia()
  const tenantCode = resolveRuntimeTenant().code
  pinia.use(({ store }) => {
    const key = `agritainment-farmhouse-${tenantCode}-${store.$id}`
    const saved = uni.getStorageSync(key)
    if (saved) store.$patch(migratePersistedState(saved, store.$state))
    store.$subscribe((_mutation, state) => uni.setStorageSync(key, persistedEnvelope(state, persistedKeys)), { detached: true })
  })
  app.use(pinia)
  return { app }
}
