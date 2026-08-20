import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { migratePersistedState, persistedEnvelope } from '@agritainment/shared'
import App from './App.vue'

const tenantCode = import.meta.env.VITE_TENANT_CODE || 'shibanxi'
const persistedKeys = ['tenant', 'farm', 'member', 'role', 'products', 'selectableProducts', 'overrides', 'cart', 'bookings', 'orders', 'rooms', 'shares', 'balanceEntries', 'promotionRecords', 'foods', 'deliveryAddress', 'auth'] as const

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(({ store }) => {
    const key = `agritainment-farmhouse-${tenantCode}-${store.$id}`
    const saved = uni.getStorageSync(key)
    if (saved) store.$patch(migratePersistedState(saved, store.$state))
    store.$subscribe((_mutation, state) => uni.setStorageSync(key, persistedEnvelope(state, persistedKeys)), { detached: true })
  })
  app.use(pinia)
  return { app }
}
