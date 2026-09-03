import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const mobilePages = [
  'apps/farmhouse/src/pages/index/index.vue',
  'apps/user/src/pages/index/index.vue',
  'apps/user/src/pages/operations/index.vue',
  'apps/store/src/pages/index/index.vue',
  'apps/supplier/src/pages/index/index.vue',
  'apps/promoter/src/pages/index/index.vue'
]

function templateOf(path: string): string {
  const source = readFileSync(resolve(root, path), 'utf8')
  return source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
}

describe('mobile portal visual contract', () => {
  it('uses real icons instead of decorative emoji in visible templates', () => {
    for (const page of mobilePages) {
      const template = templateOf(page)
      expect(template, page).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })

  it('keeps every mobile portal on the shared theme entry', () => {
    for (const app of ['farmhouse', 'user', 'store', 'supplier', 'promoter']) {
      const source = readFileSync(resolve(root, `apps/${app}/src/styles/global.scss`), 'utf8')
      expect(source, app).toContain('packages/ui/src/mobile-theme.scss')
    }
  })

  it('uses one mobile page background and explicit primary/compact touch targets', () => {
    for (const app of ['farmhouse', 'user', 'store', 'supplier', 'promoter']) {
      const pages = JSON.parse(readFileSync(resolve(root, `apps/${app}/src/pages.json`), 'utf8')) as {
        globalStyle?: { backgroundColor?: string }
      }
      expect(pages.globalStyle?.backgroundColor, app).toBe('#f4f7f5')
    }

    const theme = readFileSync(resolve(root, 'packages/ui/src/mobile-theme.scss'), 'utf8')
    expect(theme).toContain('--mobile-control-primary: 44px')
    expect(theme).toContain('--mobile-control-compact: 40px')
    expect(theme).toContain('--mobile-touch-target: var(--mobile-control-primary)')
  })
})
