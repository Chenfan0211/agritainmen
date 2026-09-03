import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { initializePlatformRecoveryHandlers, migratePersistedState, persistedEnvelope, purgeRetiredAllianceData, reconcilePendingPlatformTransactions } from '@agritainment/shared'
import './media-runtime'
import App from './App.vue'
import { createStoreAtomicRecoveryHandlerRegistrations } from './stores/store'

const persistedKeys = ['info', 'products', 'cart', 'orders', 'auth'] as const

export function createApp() {
  purgeRetiredAllianceData()
  const recoveryHandlers = createStoreAtomicRecoveryHandlerRegistrations()
  initializePlatformRecoveryHandlers(recoveryHandlers)
  recoveryHandlers.forEach(({ key }) => reconcilePendingPlatformTransactions({ handlerKey: key }))
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(({ store }) => {
    const key = `agritainment-store-${store.$id}`
    const saved = uni.getStorageSync(key)
    if (saved) store.$patch(migratePersistedState(saved, store.$state))
    store.$subscribe((_mutation, state) => uni.setStorageSync(key, persistedEnvelope(state, persistedKeys)), { detached: true })
  })
  app.use(pinia)
  return { app }
}
