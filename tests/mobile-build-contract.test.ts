import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('mobile portal build contract', () => {
  it('ships every mobile portal as a WeChat mini program only', () => {
    for (const app of ['user', 'store', 'supplier']) {
      const manifest = JSON.parse(readFileSync(resolve(root, `apps/${app}/package.json`), 'utf8')) as {
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
      }
      expect(manifest.scripts?.['build:mp-weixin'] || '', `${app} MP`).toContain('uni build -p mp-weixin')
      expect(manifest.scripts?.['dev:mp-weixin'] || '', `${app} MP dev`).toContain('uni -p mp-weixin')
      expect(manifest.scripts?.['build:h5'], `${app} has no H5 build`).toBeUndefined()
      expect(manifest.scripts?.['dev:h5'], `${app} has no H5 dev server`).toBeUndefined()
      expect(manifest.dependencies?.['@dcloudio/uni-mp-weixin'], `${app} MP dependency`).toBeTruthy()
    }
  })

  it('declares only the mp-weixin platform in every mobile manifest', () => {
    for (const app of ['user', 'store', 'supplier']) {
      const manifest = JSON.parse(readFileSync(resolve(root, `apps/${app}/src/manifest.json`), 'utf8')) as Record<string, unknown>
      expect(manifest['mp-weixin'], `${app} mp-weixin`).toBeTruthy()
      expect(manifest.h5, `${app} has no H5 platform`).toBeUndefined()
    }
  })

  it('keeps the operations console on H5', () => {
    const adminManifest = JSON.parse(readFileSync(resolve(root, 'apps/admin/src/manifest.json'), 'utf8')) as Record<string, unknown>
    const adminPackage = JSON.parse(readFileSync(resolve(root, 'apps/admin/package.json'), 'utf8')) as { scripts?: Record<string, string> }
    expect(adminManifest.h5).toBeTruthy()
    expect(adminManifest['mp-weixin']).toBeUndefined()
    expect(adminPackage.scripts?.['build:h5']).toContain('uni build -p h5')
  })

  it('no longer ships the single-origin H5 build chain or Playwright end-to-end suite', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> }
    for (const script of ['build:single-origin', 'serve:single-origin', 'dev:single-origin', 'check:single-origin', 'test:e2e', 'test:e2e:user', 'test:e2e:supplier', 'test:e2e:integration', 'test:e2e:operational-report']) {
      expect(rootPackage.scripts?.[script], `${script} removed`).toBeUndefined()
    }
    expect(rootPackage.scripts?.build).toContain('build:admin')
    expect(rootPackage.scripts?.['build:store']).toContain('build:mp-weixin')
    expect(rootPackage.devDependencies?.['@playwright/test'], 'playwright removed').toBeUndefined()
  })

  it('resolves shared UI through workspace packages for WeChat builds', () => {
    for (const app of ['user', 'store', 'supplier']) {
      const viteConfig = readFileSync(resolve(root, `apps/${app}/vite.config.ts`), 'utf8')
      expect(viteConfig, `${app} preserves workspace package paths`).toContain('preserveSymlinks: true')
      expect(viteConfig, `${app} avoids cross-root UI chunks`).not.toContain("{ find: '@agritainment/ui'")
    }
  })
})
