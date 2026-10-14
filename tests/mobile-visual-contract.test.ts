import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const mobilePages = [
  'apps/user/src/pages/index/index.vue',
  'apps/user/src/pages/operations/index.vue',
  'apps/store/src/pages/index/index.vue',
  'apps/supplier/src/pages/index/index.vue'
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
    for (const app of ['user', 'store', 'supplier']) {
      const source = readFileSync(resolve(root, `apps/${app}/src/styles/global.scss`), 'utf8')
      expect(source, app).toContain('packages/ui/src/mobile-theme.scss')
    }
  })

  it('uses one mobile page background and explicit primary/compact touch targets', () => {
    // user 端自带 --color-user-bg (#F4F6F1)，其余端沿用全站 --color-bg (#F4F7F2)；
    // store 端为专属底色 #f7f3ee。pages.json 启动底色须与各端 --mobile-bg 一致。
    const backgrounds: Record<string, string> = {
      user: '#F4F6F1',
      store: '#f7f3ee',
      supplier: '#F4F7F2'
    }
    for (const app of ['user', 'store', 'supplier']) {
      const pages = JSON.parse(readFileSync(resolve(root, `apps/${app}/src/pages.json`), 'utf8')) as {
        globalStyle?: { backgroundColor?: string }
      }
      expect(pages.globalStyle?.backgroundColor, app).toBe(backgrounds[app])
    }

    const theme = readFileSync(resolve(root, 'packages/ui/src/mobile-theme.scss'), 'utf8')
    expect(theme).toContain('--mobile-control-primary: 44px')
    expect(theme).toContain('--mobile-control-compact: 40px')
    expect(theme).toContain('--mobile-touch-target: var(--mobile-control-primary)')
  })

  it('locks each portal to its own Uni primary color', () => {
    const storeUni = readFileSync(resolve(root, 'apps/store/src/uni.scss'), 'utf8')
    const userUni = readFileSync(resolve(root, 'apps/user/src/uni.scss'), 'utf8')
    expect(storeUni).toContain('$uni-color-primary: #f0810f')
    expect(storeUni).not.toContain('#17633f')
    expect(userUni).toContain('$uni-color-primary: #2F7A4D')
    expect(userUni).not.toContain('#c83245')
  })

  it('locks supplier tab chrome to the shared tab token', () => {
    const styles = readFileSync(resolve(root, 'apps/supplier/src/styles/global.scss'), 'utf8')
    expect(styles).toMatch(/\.page-pad \{[^}]*var\(--mobile-tab-height\)/)
    expect(styles).toMatch(/\.tabbar \{[^}]*min-height: var\(--mobile-tab-height\)/)
  })

  it('locks B-side login pages to the shared theme hero', () => {
    const store = readFileSync(resolve(root, 'apps/store/src/pages/index/index.vue'), 'utf8')
    const supplier = readFileSync(resolve(root, 'apps/supplier/src/pages/index/index.vue'), 'utf8')
    expect(store).toMatch(/class="pc-login-hero(?:\s|")/)
    expect(store).toContain('class="pc-login-mark"')
    expect(store).not.toContain('class="login-logo"')
    expect(store).toMatch(/\.login-page\{[^}]*padding:0/)
    expect(supplier).toMatch(/class="pc-login-hero(?:\s|")/)
    expect(supplier).not.toContain('class="login-banner"')
  })

  it('keeps the user portal on its dedicated WeChat auth entry', () => {
    const user = readFileSync(resolve(root, 'apps/user/src/pages/index/index.vue'), 'utf8')
    expect(user).toContain('class="auth-page"')
    expect(user).toContain('class="auth-brand"')
    expect(user).toContain('class="auth-mark"')
    expect(user).toContain('class="auth-card"')
    expect(user).toContain('class="auth-btn"')
    expect(user).toContain('class="auth-wxbadge"')
    expect(user).toContain('微信一键授权')
    expect(user).not.toContain('class="pc-login-hero"')
    expect(user).not.toContain('class="pc-login-mark"')
  })

  it('locks the 430px preview frame behind H5 compilation', () => {
    const theme = readFileSync(resolve(root, 'packages/ui/src/mobile-theme.scss'), 'utf8')
    const store = readFileSync(resolve(root, 'apps/store/src/pages/index/index.vue'), 'utf8')
    expect(theme).toMatch(/\/\* #ifdef H5 \*\/\s*@media\s*\(min-width:\s*431px\)/)
    expect(store).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*@media \(min-width:431px\)/)
  })
})
