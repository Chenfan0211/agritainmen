import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>') + '<template>'.length, source.indexOf('<style'))
const styles = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''

function rule(selector: string): string {
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').map((part) => part.trim()).includes(selector))
    .map((match) => match[2])
    .join(';')
}

describe('promoter mobile visual contract', () => {
  it('uses UiIcon instead of decorative emoji', () => {
    const decorativeEmoji = ['🏪', '🏬', '📍', '⭐', '🎯', '🧑‍💼', '🧑‍🍳', '👑', '💰', '🔗', '🎁', '📦', '📋']

    for (const emoji of decorativeEmoji) expect(template, emoji).not.toContain(emoji)
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(template).toContain('<UiIcon name="user-round"')
    expect(template).toContain('<UiIcon name="link"')
  })

  it('uses the shared forest-green and warm-red tokens without decorative gradients', () => {
    expect(rule('.app-shell')).toContain('background:var(--mobile-bg)')
    expect(rule('.promoter-head')).toContain('background:var(--mobile-brand-deep)')
    expect(rule('.wallet-top strong')).toContain('color:var(--mobile-price)')
    expect(styles).not.toMatch(/(?:linear|radial|conic)-gradient/i)

    for (const retiredColor of ['#c83245', '#fdeef1', '#3a566f', '#243a4f']) {
      expect(styles.toLowerCase(), retiredColor).not.toContain(retiredColor)
    }
  })

  it('keeps cards compact and primary controls touch friendly', () => {
    const pixelRadii = [...styles.matchAll(/border-radius:\s*(\d+)px/g)].map((match) => Number(match[1]))
    expect(pixelRadii.length).toBeGreaterThan(0)
    expect(Math.max(...pixelRadii)).toBeLessThanOrEqual(8)
    expect(rule('.primary-button')).toMatch(/min-height:\s*var\(--mobile-touch-target\)/)
    expect(rule('.login-field input')).toMatch(/height:\s*var\(--mobile-touch-target\)/)
  })

  it('contains long content at 375px without horizontal page overflow', () => {
    expect(rule('.app-shell')).toMatch(/width:\s*100%/)
    expect(rule('.app-shell')).toMatch(/overflow-x:\s*hidden/)
    expect(rule('.app-shell')).toContain('padding-bottom:0')
    expect(rule('.live-list')).toContain('var(--mobile-bottom-safe)')
    expect(rule('.head-row')).toMatch(/min-width:\s*0/)
    expect(rule('.profile')).toMatch(/min-width:\s*0/)
    expect(rule('.live-actions')).toContain('grid-template-columns:repeat(2,minmax(0,1fr))')
    expect(rule('.data-list>view')).toContain('grid-template-columns:40px minmax(0,1fr) auto')
    expect(rule('.sheet')).toContain('max-width:430px')
  })

  it('keeps the live section title on one readable line', () => {
    expect(template).toContain('class="section-title"')
    expect(template).toContain('class="section-title-label"')
    expect(rule('.section-title')).toMatch(/flex:\s*1/)
    expect(rule('.section-title')).toMatch(/min-width:\s*0/)
    expect(rule('.section-title-label')).toContain('white-space:nowrap')
    expect(rule('.section-title-label')).toContain('flex:none')
    expect(rule('.section-title-label')).toContain('min-width:4em')
  })

  it('exposes all four business sheets to visual regression checks', () => {
    for (const state of ['create-live', 'share', 'shares', 'bound-users']) {
      expect(template).toContain(`data-visual-state="promoter-${state}"`)
    }
    expect(rule('.sheet')).toContain('overflow-x:hidden')
    expect(rule('.sheet')).toContain('max-height:var(--mobile-sheet-max-height)')
    expect(rule('.sheet-head')).toContain('min-height:var(--mobile-sheet-header-height)')
    expect(rule('.create-live')).toContain('min-width:0')
    expect(rule('.share-sheet')).toContain('min-width:0')
    expect(rule('.data-list')).toContain('min-width:0')
  })

  it('直播封面保持稳定的 16:9 比例', () => {
    expect(rule('.live-cover')).toContain('aspect-ratio:16/9')
    expect(rule('.live-cover')).toContain('height:auto')
  })

  it('uses the shared compact-control token for secondary sheet actions', () => {
    for (const selector of ['.live-actions .mini', '.upload-btn', '.chips button']) {
      expect(rule(selector), selector).toContain('var(--mobile-control-compact)')
    }
    expect(rule('.sheet-head button')).toMatch(/width:var\(--mobile-touch-target\)/)
    expect(rule('.sheet-head button')).toMatch(/height:var\(--mobile-touch-target\)/)
  })
})
