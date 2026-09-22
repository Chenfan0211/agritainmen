import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { createTencentMapVitePlugin } from '../../packages/tencent-map-gateway/src/index.mjs'

const publicBase = process.env.VITE_PUBLIC_BASE || '/'
const buildOutDir = process.env.VITE_OUT_DIR

export default defineConfig(({ mode }) => {
  // 加载应用目录下 .env.local（含不带前缀的 TENCENT_MAP_*，仅服务端网关使用，不进前端 bundle）
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  return {
    base: publicBase,
    build: buildOutDir ? { outDir: buildOutDir } : undefined,
    plugins: [uni(), createTencentMapVitePlugin({ key: env.TENCENT_MAP_KEY, secretKey: env.TENCENT_MAP_SECRET_KEY })],
    resolve: {
      preserveSymlinks: true,
      alias: [
        { find: '@agritainment/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) }
      ]
    }
  }
})
