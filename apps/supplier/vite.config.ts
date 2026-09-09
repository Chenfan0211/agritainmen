import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { createTencentMapVitePlugin } from '../../packages/tencent-map-gateway/src/index.mjs'

const publicBase = process.env.VITE_PUBLIC_BASE || '/'
const buildOutDir = process.env.VITE_OUT_DIR

export default defineConfig({
  base: publicBase,
  build: buildOutDir ? { outDir: buildOutDir } : undefined,
  plugins: [uni(), createTencentMapVitePlugin()],
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: '@agritainment/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) }
    ]
  }
})
