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
    expect(globalStyles).toMatch(/\.page-pad\s*\{[^}]*padding:[^;}]*calc\(76px \+ env\(safe-area-inset-bottom\)\)/)
    expect(globalStyles).toMatch(/\.tabbar\s*\{[^}]*position:\s*fixed[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/)
    expect(globalStyles).toMatch(/\.sheet-panel\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)[^}]*overflow:\s*hidden/)
    expect(globalStyles).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/)
    expect(styles).toMatch(/\.secondary-workspace\s*\{[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/)
    expect(styles).toMatch(/\.product-work-page\s*\{[^}]*padding-bottom:\s*calc\(84px \+ env\(safe-area-inset-bottom\)\)/)
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
})
