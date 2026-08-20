import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

const publicBase = process.env.VITE_PUBLIC_BASE || '/'
const buildOutDir = process.env.VITE_OUT_DIR

export default defineConfig({
  base: publicBase,
  build: buildOutDir ? { outDir: buildOutDir } : undefined,
  plugins: [uni()],
  resolve: {
    alias: {
      '@agritainment/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))
    }
  }
})
