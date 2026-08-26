import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { migratePersistedState, persistedEnvelope } from '@agritainment/shared'
import { configureMediaRuntime } from '@agritainment/ui'
// #ifdef H5
import { createH5MediaRuntime } from '@agritainment/ui/h5'
// #endif
// #ifdef MP-WEIXIN
import { createMiniProgramMediaRuntime } from '@agritainment/ui/mp'
// #endif
import App from './App.vue'

const persistedKeys = ['farms', 'liveRooms', 'products', 'cProducts', 'auth'] as const

export function createApp() {
  // #ifdef H5
  configureMediaRuntime(createH5MediaRuntime())
  // #endif
  // #ifdef MP-WEIXIN
  configureMediaRuntime(createMiniProgramMediaRuntime())
  // #endif
  const app = createSSRApp(App)
  const pinia = createPinia()
  pinia.use(({ store }) => {
    const key = `agritainment-user-${store.$id}`
    const saved = uni.getStorageSync(key)
    if (saved) store.$patch(migratePersistedState(saved, store.$state))
    store.$subscribe((_mutation, state) => uni.setStorageSync(key, persistedEnvelope(state, persistedKeys)), { detached: true })
  })
  app.use(pinia)
  return { app }
}
