import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { purgeRetiredAllianceData } from '@agritainment/shared'
import './media-runtime'
import App from './App.vue'

export function createApp() {
  purgeRetiredAllianceData()
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
