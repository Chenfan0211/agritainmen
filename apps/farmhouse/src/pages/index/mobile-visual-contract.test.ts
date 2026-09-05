import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>') + '<template>'.length, source.lastIndexOf('</template>'))
const stylePath = resolve(import.meta.dirname, '../../styles/index-page.scss')
const styles = existsSync(stylePath) ? readFileSync(stylePath, 'utf8') : ''

const workViews = ['select', 'verify', 'design-rooms', 'design-foods', 'design-experiences', 'staff-admin', 'orders', 'bookings', 'ledger', 'help']
const sheets = ['login', 'cart', 'orders', 'bookings', 'room-form', 'food-form', 'experience-form', 'share', 'product', 'contact', 'foods', 'ledger', 'recharge', 'identity', 'help', 'booking-form', 'after-sale', 'service', 'staff-form', 'staff-promo']

describe('农家乐移动端视觉契约', () => {
  it('保留门店、预订、商城和会员四个主导航', () => {
    expect(source.match(/\{ key: '(home|reserve|shop|member)'/g)).toEqual([
      "{ key: 'home'",
      "{ key: 'reserve'",
      "{ key: 'shop'",
      "{ key: 'member'"
    ])
    expect(template).toContain(':data-visual-view="activeTab"')
  })

  it('为全部经营页和弹层提供稳定的视觉状态标记', () => {
    for (const view of workViews) expect(source, view).toContain(`'${view}'`)
    for (const sheet of sheets) expect(source, sheet).toContain(`'${sheet}'`)
    expect(template).toContain(':data-visual-view="workView"')
    expect(template).toContain(':data-visual-state="sheet"')
  })

  it('可见模板不再使用装饰 Emoji', () => {
    expect(template.match(/\p{Extended_Pictographic}/gu)).toBeNull()
  })

  it('门店、菜品、包厢、服务和商品图片使用裁切填充', () => {
    for (const className of ['hero-media', 'food-thumb', 'room-emoji', 's-emoji', 'rimg', 'ci', 'product-emoji', 'select-emoji']) {
      expect(template, className).toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFill"`))
    }
    expect(template).toMatch(/:src="item\.image" mode="aspectFill"/)
    expect(template).toMatch(/:src="selectedProduct\.image" mode="aspectFill"/)
  })

  it('特产商城使用双列瀑布流并隐藏购买端起订量', () => {
    expect(template).toContain('class="waterfall-grid"')
    expect(template).toContain('class="waterfall-column"')
    expect(template).not.toContain('起订')
    expect(styles).toMatch(/\.waterfall-grid\s*\{[^}]*display:\s*flex/s)
    expect(styles).toMatch(/\.waterfall-column\s*\{[^}]*flex:\s*1/s)
  })

  it('使用稳定的移动端宽度和安全区布局', () => {
    expect(source).toContain('<style scoped lang="scss" src="../../styles/index-page.scss"></style>')
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*width:\s*100%[^}]*max-width:\s*430px[^}]*overflow-x:\s*hidden/s)
    expect(styles).toMatch(/\.tabbar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/s)
    expect(styles).toMatch(/\.tab-page\s*\{[^}]*padding-bottom:[^;}]*env\(safe-area-inset-bottom\)/s)
    expect(styles).toMatch(/\.sheet\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(styles).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/s)
  })

  it('登录卡在扣除底部导航后的可用区域内居中', () => {
    expect(styles).toMatch(/\.login-prompt\s*\{[^}]*min-height:\s*calc\(100dvh\s*-\s*var\(--mobile-tab-height\)[^}]*place-items:\s*center/s)
  })

  it('主交互至少 44px，紧凑次级操作为 40px', () => {
    expect(styles).toMatch(/--farm-touch-primary:\s*44px/)
    expect(styles).toMatch(/--farm-touch-compact:\s*40px/)
    expect(styles).toMatch(/button,\s*uni-button\s*\{[^}]*min-height:\s*var\(--farm-touch-primary\)/s)
    expect(styles).toMatch(/\.compact-action[^}]*min-height:\s*var\(--farm-touch-compact\)/s)
  })

  it('主要卡片、表单和弹层圆角不超过 8px', () => {
    for (const className of ['store-summary', 'food-card', 'room-card', 'room', 'combo', 'product-card', 'member-hero', 'promotion', 'login-prompt-card', 'sheet']) {
      expect(styles, className).toMatch(new RegExp(`\\.${className}\\s*\\{[^}]*border-radius:\\s*(?:6|7|8)px`, 's'))
    }
    expect(styles).toMatch(/\.form-field\s+input[^}]*border-radius:\s*(?:6|7|8)px/s)
    expect(styles).toMatch(/\.sheet-head button[^}]*border-radius:\s*(?:6|7|8)px/s)
    expect(styles).not.toMatch(/\.sheet-head button[^}]*border-radius:\s*50%/s)
  })

  it('长文本容器可收缩且固定栏为正文预留空间', () => {
    for (const className of ['item-title', 'page-sub', 'design-main', 'rec-b', 'sheet-head']) {
      expect(styles, className).toMatch(new RegExp(`\\.${className}[^}]*min-width:\\s*0`, 's'))
    }
    expect(styles).toMatch(/\.tab-page\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*16px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
    expect(styles).toMatch(/\.shop-page\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*16px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
  })

  it('核销卡片将金额和操作放到独立行，避免窄屏挤压标题', () => {
    expect(template).toContain('class="verify-item voucher-verify"')
    expect(template).toContain('class="verify-item booking-verify"')
    expect(styles).toMatch(/\.booking-verify\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/s)
    expect(styles).toMatch(/\.booking-verify \.verify-amount\s*\{[^}]*grid-column:\s*2/s)
    expect(styles).toMatch(/\.booking-verify \.verify-btn\s*\{[^}]*grid-column:\s*3/s)
  })

  it('按角色隔离推广中心并在顾客身份下退出经营工作页', () => {
    expect(source).toContain("const canPromote = computed(() => store.role !== 'customer')")
    expect(template).toContain('<view v-if="canPromote" class="promotion">')
    expect(source).toMatch(/function chooseRole\(role: Role\)\s*\{[\s\S]*?if \(role === 'customer'\)[\s\S]*?workView\.value = null/)
  })

  it('工作台和业务按钮使用稳定的居中布局契约', () => {
    expect(styles).toMatch(/button,\s*uni-button\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*text-align:\s*center/s)
    for (const selector of ['.identity-row button', '.choice-row button', '.member-hero .recharge', '.cats button', '.chips button']) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(styles, selector).toMatch(new RegExp(`${escaped}[^}]*justify-content:\\s*center`, 's'))
    }
    expect(styles).not.toMatch(/\.record-link[^}]*justify-content:\s*center/s)
    expect(styles).toMatch(/\.workbench\s*\{[^}]*background:\s*var\(--farm-panel\)/s)
  })

  it('会员中心采用资产卡 + 快捷宫格并移除重复充值', () => {
    expect(template).toContain('class="member-hero pc-hero"')
    expect(template).toContain('class="mine-list pc-tile-grid"')
    expect(template).toContain('class="recharge pc-hero-action"')
    expect(template).toContain('class="member-footer pc-footer"')
    expect(template).toMatch(/class="pc-tile pc-tile--[a-z]+"/)
    expect(template).not.toContain('class="recharge-options"')
    expect(template).not.toContain('class="identity-row"')
  })
  it('店铺经营工作台采用图二风格白色圆角卡宫格', () => {
    expect(template).toContain('class="workbench pc-tile-grid"')
    expect(template).toContain('class="pc-tile-icon"')
    expect(template).toContain('class="pc-tile-label">订单核销<')
    expect(template).toContain('class="pc-tile-label">选品上架<')
    expect(styles).toMatch(/\.workbench\.pc-tile-grid \.pc-tile\s*\{[^}]*border-radius:\s*14px/)
  })
})
