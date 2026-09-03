import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('mobile portal build contract', () => {
  it('keeps H5 and WeChat builds available for every mobile portal', () => {
    for (const app of ['farmhouse', 'user', 'store', 'supplier', 'promoter']) {
      const manifest = JSON.parse(readFileSync(resolve(root, `apps/${app}/package.json`), 'utf8')) as {
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
      }
      expect(manifest.scripts?.['build:h5'] || '', `${app} H5`).toContain('uni build -p h5')
      expect(manifest.scripts?.['build:mp-weixin'] || '', `${app} MP`).toContain('uni build -p mp-weixin')
      expect(manifest.dependencies?.['@dcloudio/uni-mp-weixin'], `${app} MP dependency`).toBeTruthy()
    }
  })

  it('resolves shared UI through workspace packages for WeChat builds', () => {
    for (const app of ['farmhouse', 'user', 'store', 'supplier', 'promoter']) {
      const viteConfig = readFileSync(resolve(root, `apps/${app}/vite.config.ts`), 'utf8')
      expect(viteConfig, `${app} preserves workspace package paths`).toContain('preserveSymlinks: true')
      expect(viteConfig, `${app} avoids cross-root UI chunks`).not.toContain("{ find: '@agritainment/ui'")
    }
  })
})
