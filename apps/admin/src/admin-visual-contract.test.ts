import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
const globalSource = readFileSync(new URL('./styles/global.scss', import.meta.url), 'utf8')
const paginationSource = readFileSync(new URL('./components/PaginationBar.vue', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('./components/UiIcon.vue', import.meta.url), 'utf8')
const sharedSource = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8')

describe('admin visual contract', () => {
  it('defines a compact desktop workspace token contract', () => {
    for (const token of [
      '--admin-radius-panel: 8px',
      '--admin-radius-control: 6px',
      '--admin-control-height: 40px',
      '--admin-row-height: 56px',
      '--admin-sidebar-width: 220px',
      '--admin-sidebar-compact-width: 196px',
      '--admin-focus-ring:'
    ]) expect(globalSource).toContain(token)

    expect(pageSource).toContain(':data-admin-workspace="active"')
    expect(pageSource).toContain('class="content admin-workspace"')
  })

  it('uses the current 17-menu contract and responsive sidebar widths', () => {
    const menuType = sharedSource.match(/export type AdminMenuKey = ([^\n]+)/)?.[1] || ''
    expect(menuType.match(/'[^']+'/g)).toHaveLength(17)
    expect(pageSource).toMatch(/\.sidebar\s*\{[^}]*width:var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/\.main\s*\{[^}]*var\(--admin-sidebar-width\)/s)
    expect(pageSource).toMatch(/@media\(max-width:1280px\)[\s\S]*?--admin-sidebar-width:var\(--admin-sidebar-compact-width\)/)
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
    expect(pageSource).toContain(':aria-label="selectedOrderIds.includes(item.id) ? \'取消选择订单\' : \'选择订单\'"')
    expect(paginationSource).toContain(':aria-label="`第 ${p} 页`"')
    expect(paginationSource).toContain(':aria-current="p === page ? \'page\' : undefined"')
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
})
