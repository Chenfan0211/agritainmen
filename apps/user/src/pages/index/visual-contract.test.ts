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
    for (const page of [indexPage, operationsPage]) {
      expect(page).toContain('var(--mobile-brand)')
      expect(page).toContain('var(--mobile-price)')
      expect(page).toContain('var(--mobile-bg)')
    }
  })

  it('商品、订单、运营面板卡片圆角不超过 8px', () => {
    expect(indexPage).toMatch(/\.product-card\s*\{[^}]*border-radius:\s*8px/s)
    expect(indexPage).toMatch(/\.order-card\s*\{[^}]*border-radius:\s*8px/s)
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*border-radius:\s*8px 8px 0 0/s)
    expect(operationsPage).toMatch(/\.metric-grid[^}]*border-radius:\s*8px/s)
    expect(operationsPage).toMatch(/\.list-row[^}]*border-radius:\s*8px/s)
  })

  it('主要购买、结算、授权和提现操作具备 44px 触控高度', () => {
    expect(indexPage).toMatch(/\.auth-btn\s*\{[^}]*min-height:\s*44px/s)
    expect(indexPage).toMatch(/\.product-action\s*\{[^}]*min-height:\s*44px/s)
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
    expect(operationsPage).toMatch(/\.order-row\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  })

  it('商城和分类页使用双列瀑布流且购买端不直接展示起订量', () => {
    expect(indexPage).toContain('class="waterfall-grid"')
    expect(indexPage).toContain('class="waterfall-column"')
    expect(templateOf(indexPage)).not.toContain('起订')
    expect(indexPage).toMatch(/\.waterfall-grid\s*\{[^}]*display:\s*flex/s)
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
    expect(operationsPage).toMatch(/\.metric-grid strong,[\s\S]*?overflow-wrap:\s*anywhere/s)
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
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*max-width:\s*430px[^}]*overflow-x:\s*hidden/s)
    expect(indexPage).toMatch(/\.sheet\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(indexPage).toMatch(/\.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)/s)
    expect(indexPage).toMatch(/\.app-shell\.has-cart-bar \.page-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*16px/s)
    expect(indexPage).toMatch(/\.cart-checkout\s*\{[^}]*bottom:\s*calc\(var\(--mobile-tab-height\)/s)
    expect(indexPage).toMatch(/\.bottom-tabs\s*\{[^}]*background:\s*var\(--mobile-surface\)/s)
  })

  it('H5 固定层以可用容器宽度为准，避免可见滚动条引发横向偏移', () => {
    expect(indexPage).toMatch(/\.app-shell,[\s\S]*?\.live-room\s*\{[^}]*width:\s*min\(430px,\s*100%\)/s)
    expect(indexPage).not.toContain('width: min(430px, 100vw)')
  })

  it('可见模板使用 UiIcon 或业务图片而不是装饰 Emoji', () => {
    for (const page of [indexPage, operationsPage]) {
      const template = templateOf(page)
      expect(template).toContain('<UiIcon')
      for (const emoji of decorativeEmoji) expect(template).not.toContain(emoji)
    }
  })
})
