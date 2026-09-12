import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
const globalSource = readFileSync(new URL('./styles/global.scss', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
const paginationSource = readFileSync(new URL('./components/PaginationBar.vue', import.meta.url), 'utf8')
const selectSource = readFileSync(new URL('./components/SearchableSelect.vue', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('./components/UiIcon.vue', import.meta.url), 'utf8')
const sharedSource = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8')
const tokenCss = readFileSync(new URL('../../../packages/ui/src/design-tokens.css', import.meta.url), 'utf8')
const styleSource = pageSource.slice(pageSource.indexOf('<style'))
const businessStyles = [globalSource, styleSource, paginationSource, selectSource]
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('admin visual contract', () => {
  it('defines a compact desktop workspace token contract', () => {
    expect(appSource).toContain('design-tokens.css')
    expect(tokenCss).toContain('--color-sidebar-bg: var(--color-card)')
    expect(tokenCss).toContain('--color-sidebar-active-bg: var(--color-brand-primary-soft)')
    for (const token of [
      '--admin-radius-panel: var(--radius-card)',
      '--admin-radius-control: var(--radius-button)',
      '--admin-control-height: 40px',
      '--admin-row-height: 56px',
      '--admin-sidebar-width: 220px',
      '--admin-sidebar-compact-width: 196px',
      '--admin-focus-ring:',
      '--admin-green: var(--color-brand-primary-dark)',
      '--admin-bg: var(--color-bg)'
    ]) expect(globalSource).toContain(token)

    expect(pageSource).toContain(':data-admin-workspace="active"')
    expect(pageSource).toContain('class="content admin-workspace"')
    expect(pageSource).toMatch(/\.content \{ padding: var\(--space-section\); \}/)
    expect(pageSource).not.toMatch(/\.content \{[^}]*max-width:\s*1600px/)
    expect(pageSource).toContain('<view class="top-actions">')
    expect(pageSource).toMatch(/<view class="top-actions">[\s\S]*<view class="operator">/)
    expect(pageSource).not.toContain('class="operator short-sidebar-account"')
  })

  it('keeps business styles on CSS variables without hardcoded hex', () => {
    expect(businessStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(pageSource).toContain('designTokens')
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*background:\s*var\(--(?:admin-panel|color-card|color-sidebar-bg)\)/s)
    expect(pageSource).not.toMatch(/\.sidebar\s*\{[^}]*background:\s*#153e2c/s)
    expect(pageSource).not.toMatch(/\.nav-item\.active\s*\{[^}]*box-shadow:inset 3px 0 0/s)
    expect(pageSource).not.toMatch(/\.kpi-card[^{]*\{[^}]*border-left:\s*3px/s)
    expect(pageSource).toMatch(/\.kpi-icon\s*\{[^}]*background:\s*var\(--color-brand-primary-soft\)/s)
  })

  it('uses the current 17-menu contract and responsive sidebar widths', () => {
    const menuType = sharedSource.match(/export type AdminMenuKey = ([^\n]+)/)?.[1] || ''
    expect(menuType.match(/'[^']+'/g)).toHaveLength(17)
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*width:var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/\.main\s*\{[^}]*var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/@media\(max-width:1280px\)[\s\S]*?--admin-sidebar-width:var\(--admin-sidebar-compact-width\)/)
    expect(pageSource).toContain("{ name: '平台总览'")
    expect(pageSource).toContain("{ name: '履约作业'")
    expect(pageSource).toMatch(/\.nav-item::before \{[^}]*rotate\(45deg\)/)
    expect(pageSource).toMatch(/\.nav-group \{[^}]*font-size: var\(--text-body\)/)
    expect(pageSource).toMatch(/\.nav-item \{[^}]*font-size: var\(--text-subtitle\)/)
    expect(pageSource).toMatch(/\.nav-item \{[^}]*min-height: 40px/)
    expect(pageSource).toMatch(/\.brand-title \{ font-size: 16px/)
    expect(pageSource).not.toContain('size="medium"')
    expect(pageSource).toMatch(/\.module-search\{[^}]*gap:10px/)
    expect(pageSource).toMatch(/\.module-search \.search-box\{[^}]*min-width:220px/)
    expect(pageSource).toMatch(/\.module-search \.searchable-select\{min-width:160px/)
    expect(pageSource).toMatch(/\.goods-tools \.module-search\{flex:1 0 auto/)
  })

  it('uses the same panel and control radii across cards, dialogs and filters', () => {
    expect(pageSource).toContain('border-radius:var(--admin-radius-panel)')
    expect(pageSource).toContain('border-radius:var(--admin-radius-control)')
    expect(pageSource).toContain('.modal,.catalog-product-modal')
    expect(pageSource).toContain('.module-toolbar,.booking-filters,.report-filters,.audit-filters,.dict-toolbar')
  })

  it('renders operational graphics without visible emoji', () => {
    const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u
    expect(pageSource).not.toMatch(emojiPattern)
    expect(pageSource).not.toContain('rowEmoji')
    expect(pageSource).toContain('<UiIcon name="calendar-days"')
    expect(pageSource).toContain('class="kpi-icon"')
    expect(pageSource).toContain(':name="policyIcon(group.type)"')
    expect(pageSource).toContain(':name="commissionRuleIcon(rule.targetType)"')
  })

  it('uses a business image fallback for every order product thumbnail', () => {
    expect(pageSource).toContain(':fallback="orderProductFallback(p.name)"')
    expect(pageSource).toContain(':error-fallback="orderProductFallback()"')
    expect(pageSource).toContain(':show-error="false"')
    expect(pageSource).not.toContain('v-else class="row-emoji"')
  })

  it('keeps icon-only controls and pagination keyboard accessible', () => {
    expect(iconSource).toContain('aria-hidden="true"')
    expect(pageSource).toContain('aria-label="打开待办提醒"')
    expect(pageSource).toContain('aria-label="关闭抽屉"')
    expect(paginationSource).toContain(':aria-label="`第 ${p} 页`"')
    expect(paginationSource).toContain(':aria-current="p === page ? \'page\' : undefined"')
    expect(globalSource).toMatch(/button, uni-button, input, select, textarea, \[role="combobox"\] \{\s*outline: none;/)
    expect(globalSource).toMatch(/button:focus-visible[\s\S]*?box-shadow: var\(--admin-focus-ring\)/)
    expect(pageSource).not.toMatch(/\.nav-item:focus-visible/)
    expect(pageSource).not.toContain('outline:3px solid var(--color-focus-ring)')
    expect(paginationSource).toContain('box-shadow: var(--admin-focus-ring)')
    expect(paginationSource).not.toMatch(/outline: 2px solid var\(--color-focus-ring\)/)
  })

  it('keeps loading and empty states readable without expanding table layouts', () => {
    expect(pageSource).toContain('.loading,.empty-state')
    expect(pageSource).toContain('overflow-wrap:anywhere')
    expect(pageSource).toContain('.table-row>text,.table-row>strong')
    expect(paginationSource).toContain('overflow-x: auto')
  })

  it('gives primary save and confirm actions a full touch target', () => {
    expect(pageSource).toContain('.modal-actions .button.primary')
    expect(pageSource).toContain('.drawer-actions .button.primary')
    expect(pageSource).toContain('.work-page-actions .button.primary')
    expect(pageSource).toContain('min-height:44px')
  })

  it('keeps table rows compact and dialog bodies independently scrollable', () => {
    expect(pageSource).toMatch(/\.table-row\s*\{[^}]*min-height:var\(--admin-row-height\)/s)
    expect(pageSource).toMatch(/\.modal,\.catalog-product-modal\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/s)
    expect(pageSource).toMatch(/\.drawer\s*\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/s)
    expect(pageSource).toMatch(/\.drawer-list\s*\{[^}]*overflow-y:auto/s)
  })

  it('hides empty pagination and keeps modal/drawer chrome independently scrollable', () => {
    expect(paginationSource).toMatch(/v-if="total > 0"/)
    expect(pageSource).not.toMatch(/\.modal,\.catalog-product-modal \{[^}]*overflow-y:auto/)
    expect(pageSource).toMatch(/\.modal,\.catalog-product-modal \{ display:flex; flex-direction:column; overflow:hidden/)
    expect(pageSource).toMatch(/\.drawer-actions\{display:flex;[^}]*flex-wrap:wrap/)
    expect(pageSource).toMatch(/\.c-sku-editor\{[^}]*box-shadow: inset/)
    expect(pageSource).toMatch(/@media\(max-width:768px\)\{\.login-page\{padding:/)
  })

  it('工作页桌面保存栏贴底，订单确认收货在 drawer-list 外', () => {
    expect(pageSource).toMatch(/\.work-page\{[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/)
    expect(pageSource).toMatch(/\.work-page-actions\{[^}]*flex:\s*none/)
    expect(pageSource).not.toMatch(/\.work-page-actions\{position:sticky/)
    const orderDrawer = pageSource.slice(pageSource.indexOf("v-else-if=\"detail.type === 'order' && selectedOrder\" class=\"drawer-list\""), pageSource.indexOf("v-else-if=\"detail.type === 'afterSale'\""))
    expect(orderDrawer).toContain('class="drawer-actions"')
    expect(orderDrawer).toContain('confirmOrder(selectedOrder)')
    expect(orderDrawer).toMatch(/<\/view>\s*<view v-if="detail.type === 'order'[^"]*" class="drawer-actions"/)
    expect(orderDrawer.slice(0, orderDrawer.indexOf('class="drawer-actions"'))).not.toContain('confirmOrder(selectedOrder)')
  })

  it('工作区大弹窗只让 modal-body 滚动，工具条窄屏可换行', () => {
    expect(pageSource).not.toMatch(/\.work-modal-mask\{[^}]*overflow-y:auto/)
    expect(pageSource).toMatch(/\.work-modal-mask \{[^}]*overflow:\s*hidden/)
    expect(pageSource).toMatch(/\.work-modal-mask \.modal \{[^}]*max-height:\s*100%/)
    expect(pageSource).toMatch(/\.module-toolbar\{[^}]*flex-wrap:\s*wrap/)
    expect(pageSource).toMatch(/@media\(max-width:1180px\)[\s\S]*\.settle-banner\{[^}]*grid-template-columns:\s*1fr 1fr/)
    expect(pageSource).toMatch(/@media\(max-width:1100px\)[\s\S]*\.product-submission-card\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/)
    expect(pageSource).toMatch(/@media\(max-width:768px\)\{\.login-page\{padding:32px 16px\}[\s\S]*\.login-card\{padding:24px 20px/)
    expect(pageSource).toMatch(/\.drawer \{ display:flex; flex-direction:column; overflow:hidden; padding:0/)
  })

  it('uses token sidebar width and a clean login without farm photography', () => {
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*width:var\(--admin-sidebar-width\)/s)
    expect(pageSource).not.toMatch(/\.table-row\s*\{[^}]*min-height:76px/s)
    expect(pageSource).not.toMatch(/\.status\s*\{[^}]*border-radius:999px/s)
    expect(pageSource).not.toContain("url('/static/images/farmhouse.webp')")
    expect(pageSource).toMatch(/\.login-field input\{height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.row-actions button:first-child:not\(\.danger\)\{background:var\(--(?:admin-green-2|color-brand-primary)\)/)
    expect(pageSource).not.toContain('left:184px')
    expect(pageSource).not.toMatch(/\.period-button\.on\{background:var\(--green/)
    expect(pageSource).not.toMatch(/\.filter-chips\.solid button\.active\{background:#1d6b44/)
    expect(pageSource).not.toMatch(/\.source-pill\{[^}]*border-radius:999px/)
    expect(pageSource).not.toMatch(/\.table-head\{min-height:42px\}/)
    expect(pageSource).toMatch(/\.table-head\{min-height:40px\}/)
    expect(pageSource).toMatch(/\.table-row:not\(\.table-head\)>text,\.table-row:not\(\.table-head\)>strong,\.table-row:not\(\.table-head\)>view/)
    expect(pageSource).toMatch(/\.table-head>text,\.table-head>strong,\.table-head>view\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/)
    expect(pageSource).toMatch(/\.product-tag\{[^}]*border-radius:var\(--radius-nav\)/)
    expect(pageSource).toMatch(/class="button danger-button"[^>]*>确认驳回/)
    expect(pageSource).not.toMatch(/class="button danger"/)
    expect(pageSource).toMatch(/\.product-cell strong \{[^}]*-webkit-line-clamp:2/)
    expect(pageSource).not.toMatch(/\.product-cell strong \{[^}]*white-space:nowrap/)
    expect(pageSource).toMatch(/\.switch \{[^}]*border-radius:var\(--radius-nav\)/)
    expect(pageSource).toMatch(/danger-button': dialog === 'supplier-pause' \|\| dialog === 'withdrawal-reject'/)
    expect(pageSource).toMatch(/class="danger" @click="confirmAction\('确认拒绝该售后申请/)
    expect(pageSource).toMatch(/\.route-grid \{[^}]*grid-template-columns:1\.6fr/)
    expect(pageSource).toMatch(/\.compact-button\.danger \{[^}]*background:\s*var\(--color-danger-soft\)/)
    expect(pageSource).toMatch(/\.after-evidence-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(72px, 1fr\)\)/)
    expect(pageSource).toMatch(/\.tier-editor-row \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) auto/)
    expect(pageSource).toMatch(/\.c-sku-editor\{[^}]*overflow-x:auto/)
    expect(pageSource).toMatch(/:class="\{ danger: product\.status === 'active' \}"/)
  })

  it('宽表只在内层横滑，供应商操作列可换行且筛选走 token', () => {
    for (const scroll of [
      'supplier-table-scroll',
      'order-table-scroll',
      'farm-table-scroll',
      'product-table-scroll',
      'promoter-table-scroll'
    ]) {
      expect(pageSource).toContain(`class="${scroll}"`)
      expect(pageSource).toMatch(new RegExp(`\\.${scroll}\\{[^}]*overflow-x:auto`))
    }
    expect(pageSource).toMatch(/\.supplier-grid \{ grid-template-columns:[^}]*minmax\(240px, 1\.4fr\)/)
    expect(pageSource).toMatch(/\.supplier-grid \.row-actions\{[^}]*flex-wrap:wrap/)
    expect(pageSource).toMatch(/\.after-grid \.row-actions\{[^}]*flex-wrap:nowrap/)
    expect(pageSource).toMatch(/\.report-filters \.picker-field,.booking-filters \.picker-field,.audit-filters \.picker-field\{height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.picker-field\{[^}]*height:var\(--admin-control-height\)/)
    expect(pageSource).toMatch(/\.search-box \{[^}]*background:\s*var\(--color-card\)/)
    expect(pageSource).toMatch(/\.brand-mark \{[^}]*flex:\s*none/)
    expect(pageSource).toMatch(/\.brand-mark \{[^}]*aspect-ratio:\s*1/)
    expect(pageSource).not.toContain('type="date"')
    expect(pageSource).not.toContain('批量发货')
    expect(selectSource).toContain('height: var(--admin-control-height)')
    expect(pageSource).not.toMatch(/\.row-actions button \{ min-height:30px/)
    expect(pageSource).toMatch(/\.row-actions button \{ min-height:32px/)
    expect(pageSource).toMatch(/\.order-grid\{[^}]*min-width:1080px/)
    expect(pageSource).toMatch(/\.farm-grid\{[^}]*min-width:860px/)
    expect(pageSource).toMatch(/\.unified-product-grid\{[^}]*min-width:860px/)
    expect(pageSource).toMatch(/\.promoter-grid \{[^}]*min-width:900px/)
  })

  it('门店账号、提现、角色和后台账号表只在内层横滑', () => {
    for (const scroll of [
      'account-table-scroll',
      'withdrawal-table-scroll',
      'role-table-scroll',
      'admin-account-table-scroll'
    ]) {
      expect(pageSource).toContain(`class="${scroll}"`)
      expect(pageSource).toMatch(new RegExp(`\\.${scroll}\\{[^}]*overflow-x:auto`))
    }
    expect(pageSource).toMatch(/\.after-grid \.row-actions\{[^}]*flex-wrap:nowrap/)
  })
})
