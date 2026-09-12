import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexPage = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const operationsPage = readFileSync(resolve(import.meta.dirname, '../operations/index.vue'), 'utf8')
const globalStyle = readFileSync(resolve(import.meta.dirname, '../../styles/global.scss'), 'utf8')
const decorativeEmoji = ['🏪', '🏬', '📍', '⭐', '🎯', '🧑‍💼', '🧑‍🍳', '👑', '💰', '🔗', '🎁', '📦']

function templateOf(source: string) {
  return source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
}

describe('用户端现代零售视觉契约', () => {
  it('两页沿用共享移动主题的品牌、价格和背景变量', () => {
    expect(globalStyle).toContain('packages/ui/src/mobile-theme.scss')
    expect(globalStyle).toContain('design-tokens.css')
    expect(globalStyle).toContain('--mobile-brand: var(--color-brand-primary)')
    for (const page of [indexPage, operationsPage]) {
      expect(page).toContain('var(--mobile-brand)')
      expect(page).toContain('var(--mobile-price)')
      expect(page).toContain('var(--mobile-bg)')
    }
  })

  it('商品、订单、运营面板卡片圆角走 token', () => {
    expect(indexPage).toMatch(/\.product-card\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(indexPage).toMatch(/\.order-card\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\) var\(--mobile-radius-card\) 0 0/s)
    expect(operationsPage).toMatch(/\.metric-grid[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(operationsPage).toMatch(/\.list-row[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
  })

  it('主要购买、结算、授权和提现操作具备 44px 触控高度', () => {
    expect(indexPage).toMatch(/\.auth-btn\s*\{[^}]*min-height:\s*44px/s)
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*min-height:\s*32px/s)
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*width:\s*32px[^}]*border-radius:\s*50%/s)
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*background:\s*var\(--mobile-brand\)/s)
    expect(indexPage).toMatch(/\.product-action\.share\s*\{[^}]*width:\s*auto/s)
    expect(indexPage).toMatch(/\.primary-btn\s*\{[^}]*min-height:\s*44px/s)
    expect(indexPage).toMatch(/\.cart-checkout button\s*\{[^}]*min-height:\s*44px/s)
    expect(operationsPage).toMatch(/\.income-hero button\s*\{[^}]*min-height:\s*44px/s)
  })

  it('筛选、订单操作和数量步进使用 40px 紧凑触控契约', () => {
    expect(indexPage).toMatch(/\.category-item\s*\{[^}]*min-height:\s*var\(--mobile-control-compact\)/s)
    expect(indexPage).toMatch(/\.primary-small,[\s\S]*?min-height:\s*var\(--mobile-control-compact\)/s)
    expect(indexPage).toMatch(/\.stepper button\s*\{[^}]*width:\s*var\(--mobile-control-compact\)[^}]*height:\s*var\(--mobile-control-compact\)/s)
  })

  it('375 到 430px 视口保持单列边界且长内容可收缩', () => {
    expect(indexPage).toContain('max-width: 430px')
    expect(indexPage).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(indexPage).toMatch(/\.product-body\s*\{[^}]*min-width:\s*0/s)
    expect(indexPage).toMatch(/\.cart-line-main\s*\{[^}]*min-width:\s*0/s)
    expect(operationsPage).toMatch(/\.operation-page\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(operationsPage).toMatch(/\.order-row\s*\{[^}]*word-break:\s*break-all/s)
  })

  it('分类商品卡标签与名称竖排，不再挤在同一行', () => {
    expect(indexPage).not.toContain('class="product-name-row"')
    expect(indexPage).toMatch(/class="tag-row"[\s\S]*class="product-name"/)
    expect(indexPage).toMatch(/\.product-body\s*\{[^}]*flex-direction:\s*column[^}]*gap:\s*6px/s)
    expect(indexPage).toMatch(/\.product-name\s*\{[^}]*width:\s*100%[^}]*-webkit-line-clamp:\s*2/s)
    expect(indexPage).not.toMatch(/\.tag-row[\s\S]*max-height:\s*23px/)
  })

  it('商城和分类页使用双列瀑布流且购买端不直接展示起订量', () => {
    expect(indexPage).toContain('class="waterfall-grid"')
    expect(indexPage).toContain('class="waterfall-column"')
    expect(templateOf(indexPage)).not.toContain('起订')
    expect(indexPage).toMatch(/\.waterfall-grid\s*\{[^}]*display:\s*flex/s)
    expect(indexPage).toMatch(/\.waterfall-grid\s*\{[^}]*padding:\s*0 8px/s)
    expect(indexPage).toMatch(/\.waterfall-column\s*\{[^}]*flex:\s*1/s)
  })

  it('为商品、购物车、结算、订单、地址、物流、售后和直播提供视觉验收入口', () => {
    for (const view of ['home', 'category', 'cart', 'orders', 'me']) {
      expect(indexPage).toContain(`data-visual-view="user-${view}"`)
    }
    for (const state of ['detail', 'cart', 'checkout', 'address', 'logistics', 'after-sale', 'live-room']) {
      expect(indexPage).toContain(`data-visual-state="user-${state}"`)
    }
  })

  it('四个运营视图共享稳定的长文本和金额布局', () => {
    expect(operationsPage).toContain(':data-visual-view="`user-operations-${type}`"')
    for (const type of ['income', 'fans', 'orders', 'performance']) {
      expect(operationsPage).toContain(`data-operation-view="${type}"`)
    }
    expect(operationsPage).toMatch(/\.list-row\s*>\s*strong\s*\{[^}]*max-width:/s)
    expect(operationsPage).toMatch(/\.metric-grid strong,[\s\S]*?word-break:\s*break-all/s)
  })

  it('普通用户直接打开运营页时只显示无推广身份空态', () => {
    expect(operationsPage).toContain('v-if="!store.currentDistributor"')
    expect(operationsPage).toContain('data-visual-state="user-operations-no-distributor"')
    expect(operationsPage).toContain('projectDistributorOperations')
    expect(indexPage).toContain('<template v-if="store.currentDistributor">')
    expect(operationsPage).toMatch(/\.no-distributor \.primary-btn\s*\{[^}]*min-height:\s*44px[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s)
    expect(operationsPage).toMatch(/\.no-distributor small\s*\{[^}]*font-size:\s*12px/s)
  })

  it('弹层和底部固定区不会遮挡内容', () => {
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(indexPage).toMatch(/\.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)/s)
    expect(indexPage).toMatch(/\.app-shell\.has-cart-bar \.c-mall,[\s\S]*?\.app-shell\.has-cart-bar \.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*28px/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*bottom:\s*auto/s)
    expect(indexPage).toMatch(/\.bottom-tabs\s*\{[^}]*background:\s*var\(--mobile-surface\)/s)
  })

  it('H5 固定层以可用容器宽度为准，避免可见滚动条引发横向偏移', () => {
    expect(indexPage).toMatch(/@media \(min-width:\s*431px\)[\s\S]*?\.app-shell,[\s\S]*?\.live-room\s*\{[^}]*max-width:\s*430px/s)
    expect(indexPage).not.toContain('width: min(430px, 100vw)')
  })

  it('可见模板使用 UiIcon 或业务图片而不是装饰 Emoji', () => {
    for (const page of [indexPage, operationsPage]) {
      const template = templateOf(page)
      expect(template).toContain('<UiIcon')
      for (const emoji of decorativeEmoji) expect(template).not.toContain(emoji)
    }
  })
  it('首页分类购物车页头用品牌色块，规格和购物车按紧凑行排', () => {
    expect(indexPage).toMatch(/class="mall-header theme-head"/)
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*商品分类/)
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*购物车/)
    expect(indexPage).toMatch(/class="page-heading heading-with-back theme-head">[\s\S]*我的订单/)
    expect(indexPage).toMatch(/class="page-back" aria-label="返回我的"/)
    expect(indexPage).toContain('data-visual-view="product"')
    expect(indexPage).toMatch(/class="page-back" aria-label="返回"/)
    expect(indexPage).toContain("sheet === 'detail' ? '选择规格'")
    expect(indexPage).toContain('logout-danger')
    expect(indexPage).toMatch(/class="page-heading theme-head">[\s\S]*我的</)
    expect(indexPage).not.toContain('>选购<')
    expect(indexPage).toContain('<UiIcon name="plus"')
    expect(indexPage).toContain('>分享<')
    expect(indexPage).toMatch(/\.mall-header,\s*\.page-heading\s*\{[^}]*padding:\s*calc\(12px \+ env\(safe-area-inset-top\)\) 8px 14px/)
    expect(indexPage).toMatch(/\.theme-head\s*\{[^}]*background:\s*var\(--color-brand-primary-dark\)/s)
    expect(operationsPage).toMatch(/\.operation-header\.theme-head\s*\{[^}]*background:\s*var\(--color-brand-primary-dark\)/s)
    expect(operationsPage).toMatch(/\.income-hero,\s*\.performance-hero\s*\{[^}]*background:\s*var\(--color-brand-primary-dark\)/s)
    expect(indexPage).not.toMatch(/\.theme-head\s*\{[^}]*--gradient-brand/s)
    expect(indexPage).toMatch(/\.product-meta\s*\{/)
    expect(indexPage).toMatch(/\.sku-list\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(indexPage).toMatch(/\.detail-thumb\s*\{[^}]*width:\s*72px/s)
    expect(indexPage).toMatch(/\.cart-line-main\s*\{[^}]*flex-direction:\s*column/s)
    expect(indexPage).toMatch(/\.cart-line-foot\s*\{[^}]*margin-top:\s*auto/)
    expect(indexPage).toMatch(/\.live-room-top\s*\{[^}]*padding-right:\s*96px/s)
    expect(indexPage).toMatch(/\.live-room-body\s*\{[^}]*padding:\s*8px/s)
    expect(indexPage).toMatch(/\.auth-page\s*\{[^}]*padding-top:\s*calc\(24px \+ env\(safe-area-inset-top\)\)/s)
    expect(indexPage).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.auth-page[\s\S]*padding-top: calc\(24px \+ var\(--status-bar-height\)\)/)
    expect(indexPage).toContain('class="pc-login-hero"')
    expect(indexPage).toContain('class="pc-login-mark"')
    expect(indexPage).not.toContain('class="auth-mark">集<')
  })

  it('“我的”页提供一二三级用户分销角色演示切换入口', () => {
    expect(indexPage).toContain('class="role-switch"')
    expect(indexPage).toContain("store.setDemoDistributorLevel('normal')")
    expect(indexPage).toContain("store.setDemoDistributorLevel('level1')")
    expect(indexPage).toContain("store.setDemoDistributorLevel('level2')")
    expect(indexPage).toMatch(/\.role-switch\s*\{[^}]*display:\s*flex/)
  })

  it('订单和我的页不覆盖底栏占位，运营页窄屏不冲掉胶囊', () => {
    expect(indexPage).not.toMatch(/\.orders-page[\s\S]{0,80}padding-bottom:\s*14px/)
    expect(indexPage).not.toMatch(/\.me-page[\s\S]{0,40}padding-bottom:\s*14px/)
    expect(operationsPage).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.operation-page \{[\s\S]*padding-right: 96px/)
    expect(operationsPage).not.toMatch(/@media \(max-width: 375px\) \{[\s\S]*?\.operation-page \{[\s\S]*?padding-right:\s*14px/)
  })

  it('订单空态沿用共享空态标，资料卡密度对齐订单卡', () => {
    expect(indexPage).toMatch(/class="empty-block large pc-empty"[\s\S]*还没有订单/)
    expect(indexPage).toMatch(/class="empty-block compact pc-empty"[\s\S]*购物车为空/)
    expect(indexPage).toMatch(/\.search-box\s*\{[^}]*margin:\s*0 8px 14px/s)
    expect(indexPage).toMatch(/\.order-card\s*\{[^}]*margin:\s*0 8px 8px/s)
    expect(indexPage).toMatch(/\.profile-panel\s*\{[^}]*margin:\s*0 8px 12px/s)
    expect(indexPage).toMatch(/\.profile-panel\s*\{[^}]*padding:\s*11px 12px/s)
    expect(indexPage).toMatch(/\.cart-line\s*\{[^}]*margin:\s*0 8px/s)
    expect(indexPage).toMatch(/\.sheet-head \{[^}]*padding: 6px 12px;/)
  })

  it('短弹层随内容收缩，不再写死 80vh 高度', () => {
    expect(indexPage).toMatch(/\.sheet-scroll\s*\{[\s\S]*height:\s*auto/)
    expect(indexPage).toMatch(/\.sheet-scroll\s*\{[\s\S]*max-height:\s*calc\(80vh/)
    expect(indexPage).not.toMatch(/\.sheet-scroll\s*\{[^}]*(?<!max-)height:\s*calc\(80vh/)
  })

  it('购物车删除、地址操作和直播套餐在 375px 不再挤成一列', () => {
    expect(indexPage).toContain('class="sheet-handle"')
    expect(indexPage).toMatch(/\.cart-remove\s*\{[^}]*grid-column:\s*3/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.address-actions \{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/\.live-package-row\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(indexPage).toMatch(/\.live-package-actions\s*\{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/\.live-buy-btn\s*\{[^}]*margin-left:\s*auto/)
  })

  it('H5 结算栏跟内容流，地址开关圆角不超过 8px', () => {
    expect(indexPage).not.toMatch(/\.cart-checkout\s*\{[^}]*position:\s*sticky/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*position:\s*relative/s)
    expect(indexPage).toMatch(/\.toggle\s*\{[^}]*border-radius:\s*var\(--mobile-radius-card\)/s)
    expect(indexPage).toMatch(/\.checkout-line\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s)
    expect(indexPage).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*@media \(min-width: 431px\)[\s\S]*\.cart-bar \{ left:50%; right:auto; width:406px; transform:translateX\(-50%\)/)
  })

  it('购物车、确认订单和售后主按钮贴在 sheet-foot', () => {
    const sheetStart = indexPage.indexOf('<view v-if="sheet" class="sheet-mask"')
    const scrollEnd = indexPage.indexOf('</scroll-view>', sheetStart)
    const afterScroll = indexPage.slice(scrollEnd)
    expect(afterScroll).toContain('class="sheet-foot"')
    expect(afterScroll).toContain('去结算')
    expect(afterScroll).toContain('提交订单')
    expect(afterScroll).toContain('提交售后申请')
    expect(afterScroll).toContain('加入购物车')
    expect(indexPage).toMatch(/\.sheet-foot \.primary-btn \{ width: 100%; margin-top: 0; \}/)
    expect(indexPage.slice(sheetStart, scrollEnd)).not.toContain('去结算')
    expect(indexPage.slice(sheetStart, scrollEnd)).not.toContain('@click="submitOrder"')
  })

  it('购物车 Tab 用 flex 列钉住结算条，375 子单操作允许换行', () => {
    expect(indexPage).toMatch(/\.cart-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s)
    expect(indexPage).toMatch(/\.cart-page\s*\{[^}]*min-height:\s*100vh/s)
    expect(indexPage).toMatch(/\.cart-page-content\s*\{[^}]*flex:\s*1/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*flex:\s*none/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*border-radius:\s*0/s)
    expect(indexPage).not.toMatch(/\.cart-checkout\s*\{[^}]*box-shadow/)
    expect(indexPage).toMatch(/<\/view>\s*<view v-if="store.cart.length" class="cart-checkout"/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.waiting-copy \{[^}]*width:\s*100%/)
    expect(indexPage).toMatch(/@media \(max-width: 375px\)[\s\S]*\.sub-actions \{[^}]*flex-wrap:\s*wrap/)
    expect(indexPage).toMatch(/\.empty-block\.large\s*\{[^}]*min-height:\s*160px/)
  })

  it('运营页左右 8px，直播间小程序用满屏高度', () => {
    expect(operationsPage).toMatch(/\.operation-page\s*\{[^}]*padding:\s*calc\(10px \+ env\(safe-area-inset-top\)\) 8px/)
    expect(operationsPage).toMatch(/class="operation-header theme-head"/)
    expect(indexPage).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.live-room \{ height: 100%/)
    expect(indexPage).toMatch(/\.cart-line-foot \.stepper button \{[^}]*width:\s*var\(--mobile-control-compact\)/)
  })
})
