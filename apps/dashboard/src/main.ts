import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
import App from './App.vue'

export function createApp() {
  configureMediaRuntime(createH5MediaRuntime())
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
