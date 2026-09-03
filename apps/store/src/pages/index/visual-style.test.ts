import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
const styles = source.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''

function expectRule(selector: string, declarations: RegExp) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  expect(styles).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*${declarations.source}[^}]*\\}`, 's'))
}

describe('门店端现代供应链视觉契约', () => {
  it('使用业务图标表达门店、位置、供应链策略和电话操作', () => {
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)

    expect(template).toContain('<UiIcon name="store"')
    expect(template).toContain('<UiIcon name="map-pin"')
    expect(template).toContain('<UiIcon name="factory"')
    expect(template).toContain('<UiIcon name="badge-percent"')
    expect(template).toContain('<UiIcon name="phone"')
  })

  it('商品和订单缩略图统一使用裁切填充', () => {
    for (const className of ['product-emoji', 'order-emoji', 'hot-emoji', 'product-detail-emoji']) {
      expect(template).toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFill"`))
      expect(template).not.toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFit"`))
    }
  })

  it('使用跨端双列瀑布流并限制商品卡在窄屏内收缩', () => {
    expectRule('.mall-hero', /padding:\s*calc\(18px\s*\+\s*env\(safe-area-inset-top\)\)\s*16px\s*16px/)
    expectRule('.mall-hero', /background:\s*var\(--farm-green-deep\)/)
    expectRule('.app-shell', /overflow-x:\s*hidden/)
    expect(template).toContain('class="waterfall-grid"')
    expect(template).toContain('class="waterfall-column"')
    expectRule('.waterfall-grid', /display:\s*flex/)
    expectRule('.waterfall-column', /flex:\s*1/)
  })

  it('购买端商品模板不直接展示起订量', () => {
    expect(template).not.toContain('起订')
  })

  it('主要卡片使用不超过八像素的统一圆角和克制阴影', () => {
    for (const selector of ['.product-card', '.order-card', '.hot-list', '.login-card']) {
      expectRule(selector, /border-radius:\s*var\(--mobile-radius-card\)/)
      expectRule(selector, /box-shadow:\s*var\(--mobile-shadow-card\)/)
    }
  })

  it('主要按钮和图标按钮保留至少四十四像素触控区', () => {
    expectRule('.chips button', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.product-foot button', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.cart-count', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.cart-bar>button:last-child', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.sheet-head button', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.stepper', /height:\s*44px/)
    expectRule('.outline-button', /height:\s*var\(--mobile-touch-target\)/)
    expectRule('.login-tabs button', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.logout-button', /min-height:\s*var\(--mobile-touch-target\)/)
  })

  it('六类业务弹层都有稳定的视觉验收入口', () => {
    for (const state of ['product', 'cart', 'checkout', 'order', 'contact', 'address']) {
      expect(template).toContain(`data-visual-state="store-${state}"`)
    }
    expectRule('.sheet', /max-width:\s*430px/)
    expectRule('.sheet', /overflow-x:\s*hidden/)
    expectRule('.sheet', /max-height:\s*var\(--mobile-sheet-max-height\)/)
  })

  it('购物车栏和不透明底部导航拥有独立正文占位', () => {
    expect(template).toContain(`:class="{ 'has-cart-bar': activeTab === 'shop' && store.cartCount }"`)
    expectRule('.app-shell.has-cart-bar', /padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*16px\s*\+\s*env\(safe-area-inset-bottom\)\)/)
    expectRule('.tabbar', /background:\s*var\(--mobile-surface\)/)
  })

  it('紧凑次级操作使用共享 40px 契约且长内容可收缩', () => {
    expectRule('.stock-actions .compact-button', /min-height:\s*var\(--mobile-control-compact\)/)
    expectRule('.sheet-line > view:nth-child\(2\)', /min-width:\s*0/)
    expectRule('.order-detail-head > text', /overflow-wrap:\s*anywhere/)
    expectRule('.checkout-line > text', /min-width:\s*0[^}]*overflow-wrap:\s*anywhere/)
  })
})
