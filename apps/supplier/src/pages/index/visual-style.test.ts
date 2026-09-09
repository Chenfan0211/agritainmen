import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const supplierRoot = resolve(import.meta.dirname, '../../..')
const pageSource = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const globalStyles = readFileSync(resolve(supplierRoot, 'src/styles/global.scss'), 'utf8')
const pageConfig = readFileSync(resolve(supplierRoot, 'src/pages.json'), 'utf8')
const template = pageSource.slice(pageSource.indexOf('<template>'), pageSource.indexOf('<script setup'))
const styles = pageSource.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''
const allStyles = `${globalStyles}\n${styles}`

const visualViews = [
  'supplier-dashboard',
  'supplier-orders',
  'supplier-products',
  'supplier-mine',
  'driver-today',
  'driver-history',
  'driver-mine',
  'workspace-drivers',
  'workspace-routes',
  'workspace-settlements',
  'workspace-handovers',
  'workspace-warehouse',
  'workspace-account'
]

const visualSheets = [
  'order',
  'assign-reassign',
  'courier',
  'handover-out',
  'handover-in',
  'driver-form-edit',
  'driver-reset',
  'driver-toggle-confirm',
  'reset-confirm',
  'category-picker'
]

describe('supplier mobile visual contract', () => {
  it('uses a flat B2B surface without decorative gradients or emoji', () => {
    expect(allStyles).not.toMatch(/(?:linear|radial)-gradient\s*\(/)
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(template).not.toMatch(/\sstyle="/)
  })

  it('renders every product image with a stable aspect-fill crop', () => {
    const productImages = [...template.matchAll(/<BusinessImage\b[^>]*>/g)].map(([tag]) => tag)

    expect(productImages.length).toBeGreaterThan(0)
    for (const tag of productImages) expect(tag).toContain('mode="aspectFill"')
  })

  it('keeps touch targets at least 44px and business cards at no more than 8px', () => {
    expect(globalStyles).toMatch(/\.primary-button\s*\{[^}]*min-height:\s*44px/)
    expect(globalStyles).toMatch(/\.outline-button\s*\{[^}]*min-height:\s*44px/)
    expect(globalStyles).toMatch(/\.mini-button\s*\{[^}]*min-height:\s*40px/)
    expect(globalStyles).toMatch(/\.chip\s*\{[^}]*min-height:\s*40px/)
    expect(globalStyles).toMatch(/\.icon-button\s*\{[^}]*width:\s*44px;\s*height:\s*44px/)
    expect(allStyles).toMatch(/\.sku-card-head button\s*\{[^}]*min-height:\s*40px/)
    expect(allStyles).toMatch(/\.checkbox-field\s*\{[^}]*min-height:\s*40px/)
    expect(globalStyles).toMatch(/\.list-card\s*\{[^}]*border-radius:\s*\$sup-radius/)
    expect(globalStyles).toContain('$sup-radius: 8px;')
    expect(styles).toMatch(/\.supplier-product-card\s*\{[^}]*border-radius:\s*8px/)
  })

  it('defines semantic status colors and protects narrow mobile layouts', () => {
    expect(allStyles).toContain('#2f5bb3')
    expect(allStyles).toContain('#a05a12')
    expect(globalStyles).toContain('$sup-green')
    expect(globalStyles).toContain('$sup-red')
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/)
    expect(styles).toContain('@media (max-width: 375px)')
  })

  it('marks every supplier, driver and secondary workspace for visual regression', () => {
    for (const view of visualViews) expect(template).toContain(`data-visual-view="${view}"`)
  })

  it('marks every business sheet and category picker for visual regression', () => {
    for (const sheet of visualSheets) expect(template).toContain(`data-visual-sheet="${sheet}"`)
  })

  it('keeps fixed navigation and sheets clear of content and mobile safe areas', () => {
    expect(globalStyles).toMatch(/\.page-pad\s*\{[^}]*padding:[^;}]*calc\(var\(--mobile-tab-height\)/)
    expect(globalStyles).toMatch(/\.tabbar\s*\{[^}]*min-height:\s*var\(--mobile-tab-height\)/)
    expect(globalStyles).toMatch(/\.hero \{[^}]*padding: 0 8px 12px/)
    expect(globalStyles).toMatch(/\.tabbar\s*\{[^}]*position:\s*fixed[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/)
    expect(globalStyles).toMatch(/\.sheet-panel\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)[^}]*overflow:\s*hidden/)
    expect(globalStyles).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/)
    expect(styles).toMatch(/\.secondary-workspace\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/)
    expect(styles).toMatch(/\.secondary-body\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/)
    expect(styles).toMatch(/\.product-work-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/)
    expect(styles).toMatch(/\.product-work-body\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/)
  })

  it('在 390px 及以下将五项经营指标重排为三列加两列', () => {
    expect(allStyles).toMatch(/@media\s*\(max-width:\s*390px\)[\s\S]*?\.hero-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(allStyles).toMatch(/@media\s*\(max-width:\s*390px\)[\s\S]*?\.hero-stat:nth-child\(4\)\s*\{[^}]*border-left:\s*0/)
  })

  it('shrinks long business text without pushing status and action controls away', () => {
    expect(allStyles).toMatch(/\.row-top\s*\{[^}]*min-width:\s*0/)
    expect(allStyles).toMatch(/\.row-top\s*>\s*(?:text|\.order-no)[^{]*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/)
    expect(allStyles).toMatch(/\.driver-option-name\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/)
    expect(allStyles).toMatch(/\.work-link\s+\.row-main\s*\{[^}]*min-width:\s*0/)
    expect(allStyles).toMatch(/\.sheet-title\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis/)
  })

  it('uses the shared mobile background in H5 and mini program page configuration', () => {
    expect(JSON.parse(pageConfig).globalStyle.backgroundColor).toBe('#f4f7f5')
    expect(globalStyles).not.toMatch(/(^|,)\s*select(?:\s|,|\{)/m)
  })

  it('页头和二级工作台避开小程序胶囊', () => {
    expect(globalStyles).toMatch(/\.hero \{ padding-top: calc\(12px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toMatch(/\.product-work-head,\s*\.secondary-head \{[\s\S]*padding-right: 96px;/)
    expect(pageSource).toMatch(/\.login-page \{ padding-top: calc\(24px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toContain('class="pc-login-hero"')
    expect(pageSource).not.toContain('class="login-banner"')
    expect(pageSource).toMatch(/\.login-card \{[^}]*max-width: 340px/)
    expect(pageSource).toMatch(/\.login-body \{ padding: 16px 12px 18px; \}/)
    expect(globalStyles).not.toMatch(/\.secondary-workspace \{[^}]*left:\s*50%/)
    expect(globalStyles).not.toMatch(/\.secondary-workspace \{[^}]*transform:\s*translateX\(-50%\)/)
  })

  it('全屏态避开胶囊，商品管理和二级页不再叠两层状态栏', () => {
    expect(globalStyles).toMatch(/\.page-state \{ padding-top: calc\(80px \+ var\(--status-bar-height\)\); padding-right: 96px; \}/)
    expect(pageSource).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.product-work-page \{ padding-top: 16px; \}/)
    expect(pageSource).not.toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.product-work-page \{ padding-top: calc\(16px \+ var\(--status-bar-height\)\)/)
    expect(pageSource).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.secondary-workspace \{[\s\S]*min-height: calc\(100vh/)
    expect(pageSource).not.toMatch(/\.secondary-head \{[^}]*margin: -14px/)
  })

  it('首页五卡展示当日农家乐数量，二级页留在框内且返回是方箭头', () => {
    expect(template).toContain('今日门店')
    expect(template).toContain('今日件数')
    expect(template).toContain('待发货件')
    expect(template).toContain('缺货件数')
    expect(template).toContain('配送中件')
    expect(template).toContain('todayFarmhouseQuantities')
    expect(template).not.toMatch(/hero-stat-label">今日缺货/)
    expect(template).toMatch(/v-if="store\.auth\.role === 'supplier' && !secondaryWorkspace"/)
    expect(styles).not.toMatch(/\.secondary-workspace\s*\{[^}]*position:\s*fixed/)
    expect(styles).toMatch(/\.secondary-workspace\s*\{[^}]*min-height:\s*calc\(100vh/)
    expect(template).toMatch(/class="page-back" aria-label="返回"/)
    expect(template).not.toMatch(/<text>返回<\/text>/)
    expect(globalStyles).toMatch(/\.hero-logout \{[^}]*background: \$sup-red/)
  })

  it('我的业务入口两列纵排，空态不再撑满半屏', () => {
    expect(pageSource).toMatch(/\.mine-tile-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    expect(pageSource).toMatch(/\.mine-tile-grid \.work-link \{ flex-direction: column/)
    expect(globalStyles).toMatch(/\.empty-state \{[^}]*min-height: 120px/)
    expect(pageSource).toMatch(/class="empty-state compact-empty pc-empty"/)
    expect(pageSource).toMatch(/class="empty-state compact-empty pc-empty"[\s\S]*暂无交接记录/)
    expect(globalStyles).toMatch(/\.sheet-panel \{[^}]*padding: 12px 12px 0/)
    expect(pageSource).toMatch(/:class="driverStatusTarget\.status === 'active' \? 'danger-button' : 'primary-button'"/)
  })

  it('业务弹层操作贴底，标题不再负 margin，品类选择器左右 12px', () => {
    expect(pageSource).toMatch(/class="sheet-actions sheet-foot"/)
    expect(globalStyles).toMatch(/\.sheet-head \{[^}]*margin: 0/)
    expect(globalStyles).not.toMatch(/\.sheet-head \{[^}]*margin: -14px/)
    expect(styles).not.toMatch(/\.sheet-actions \{[^}]*position:\s*relative/)
    expect(styles).toMatch(/\.category-picker-sheet > \.sheet-head \{ padding: 6px 12px/)
  })

  it('短弹层和品类选择器随内容收缩，不再写死 80vh 高度', () => {
    expect(globalStyles).toMatch(/\.sheet-scroll \{[^}]*height: auto;[^}]*max-height: calc\(80vh/)
    expect(styles).toMatch(/\.category-picker-list \{[^}]*height: auto;[^}]*max-height: calc\(80vh/)
    expect(globalStyles).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
    expect(styles).not.toMatch(/(?<!max-)height:\s*calc\(80vh/)
  })

  it('二级页和商品编辑是 head / 内容滚动 / 主按钮贴底', () => {
    expect(template).toMatch(/class="secondary-head"[\s\S]*class="secondary-body"[\s\S]*class="secondary-foot"/)
    expect(template).toMatch(/class="product-work-head"[\s\S]*class="product-work-body"[\s\S]*class="product-form-actions"/)
    expect(styles).toMatch(/\.secondary-foot\s*\{[^}]*flex:\s*none/)
    expect(styles).toMatch(/\.product-form-actions\s*\{[^}]*flex:\s*none/)
    expect(styles).not.toMatch(/\.secondary-workspace\s*\{[^}]*overflow-y:\s*auto/)
    expect(styles).not.toMatch(/\.product-work-page\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('订单与交接弹层是 head / scroll-view / foot 三段式', () => {
    expect(template).toMatch(/data-visual-sheet="order"[\s\S]*class="sheet-head"[\s\S]*<scroll-view class="sheet-scroll"[\s\S]*class="sheet-actions sheet-foot"/)
    expect(template).toMatch(/data-visual-sheet="assign-reassign"[\s\S]*<scroll-view class="sheet-scroll"/)
    expect(template).toMatch(/data-visual-sheet="handover-out"[\s\S]*<scroll-view class="sheet-scroll"/)
    expect(globalStyles).not.toMatch(/\.sheet-panel > view,\s*\.sheet-panel > scroll-view \{[^}]*overflow-y:\s*auto/)
    expect(template).toContain('class="sheet-handle"')
    expect(globalStyles).toMatch(/\.compact-empty \{[^}]*min-height:\s*96px/)
  })
})
