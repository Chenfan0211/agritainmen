import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import './media-runtime'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
