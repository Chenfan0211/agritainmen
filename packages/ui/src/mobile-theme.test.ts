import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const themePath = resolve(import.meta.dirname, 'mobile-theme.scss')
const mobileApps = ['farmhouse', 'user', 'store', 'supplier', 'promoter']
const ownedMobileApps = ['user', 'store', 'promoter']

describe('shared mobile visual theme', () => {
  it('defines the shared mobile design contract', () => {
    expect(existsSync(themePath)).toBe(true)
    const source = readFileSync(themePath, 'utf8')

    for (const token of [
      '--mobile-brand',
      '--mobile-brand-deep',
      '--mobile-bg',
      '--mobile-surface',
      '--mobile-text',
      '--mobile-muted',
      '--mobile-border',
      '--mobile-price',
      '--mobile-warning',
      '--mobile-info',
      '--mobile-danger',
      '--mobile-radius-control',
      '--mobile-radius-card',
      '--mobile-shadow-float',
      '--mobile-control-compact',
      '--mobile-control-primary',
      '--mobile-touch-target',
      '--mobile-tab-height',
      '--mobile-section-gap',
      '--mobile-card-gap',
      '--mobile-card-padding',
      '--mobile-action-bar-height',
      '--mobile-sheet-header-height',
      '--mobile-sheet-max-height'
    ]) expect(source).toContain(token)

    expect(source).toContain('--mobile-control-compact: 40px')
    expect(source).toContain('--mobile-control-primary: 44px')
    expect(source).toContain('--mobile-touch-target: var(--mobile-control-primary)')
    expect(source).toContain('--mobile-section-gap: 12px')
    expect(source).toContain('--mobile-card-gap: 8px')
    expect(source).toContain('--mobile-sheet-header-height: 56px')
    expect(source).toContain('--mobile-sheet-max-height: 88dvh')
    expect(source).toContain('letter-spacing: 0')
    expect(source).toContain('env(safe-area-inset-bottom)')
    expect(source).toMatch(/button,\s*uni-button\s*\{[\s\S]*display:\s*inline-flex[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*center[\s\S]*text-align:\s*center/)
  })

  it('provides the shared personal-center pc-* layout contract', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\.pc-page\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*var\(--mobile-section-gap\)/)
    expect(source).toMatch(/\.pc-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*minmax\(0,\s*1fr\)/)
    expect(source).toMatch(/\.pc-row\s*\{[\s\S]*min-height:\s*var\(--mobile-control-compact\)/)
    expect(source).toMatch(/\.pc-hero\s*\{[\s\S]*background:\s*linear-gradient/)
    expect(source).toMatch(/\.pc-hero-action\s*\{[\s\S]*justify-content:\s*center/)
    expect(source).toMatch(/\.pc-grid-main text[\s\S]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/\.pc-seg button\.active\s*\{[\s\S]*color:\s*var\(--mobile-brand\)/)
  })
  it('provides the shared login, state and accent quality classes', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/\.pc-login-hero\s*\{[\s\S]*background:\s*linear-gradient/)
    expect(source).toMatch(/\.pc-login-card\s*\{[\s\S]*box-shadow:\s*var\(--mobile-shadow-float\)/)
    expect(source).toMatch(/\.pc-empty,\s*\.pc-loading,\s*\.pc-error\s*\{[\s\S]*display:\s*grid/)
    expect(source).toMatch(/\.pc-empty \.pc-state-action,[\s\S]*min-height:\s*var\(--mobile-control-primary\)/)
    expect(source).toMatch(/\.pc-card-accent\s*\{[^}]*border-top:\s*2px\s+solid\s+var\(--mobile-brand\)/)
  })
  it('lands the shared state components in every retained mobile portal', () => {
    const stateClasses = ['pc-empty', 'pc-loading', 'pc-error']
    for (const app of mobileApps) {
      const source = readFileSync(resolve(root, `apps/${app}/src/pages/index/index.vue`), 'utf8')
      expect(source, app).toMatch(/class="[^"]*(?:pc-empty|pc-loading|pc-error)[^"]*"/)
    }
    const withIconTile = mobileApps.some((app) => readFileSync(resolve(root, `apps/${app}/src/pages/index/index.vue`), 'utf8').includes('pc-state-icon'))
    expect(withIconTile).toBe(true)
  })
  it('provides a wide-screen desktop preview frame without changing mobile width', () => {
    const source = readFileSync(themePath, 'utf8')

    expect(source).toMatch(/@media\s*\(min-width:\s*431px\)[\s\S]*\.app-shell\s*\{[^}]*box-shadow:\s*0\s+32px\s+90px/)
    expect(source).toMatch(/@media\s*\(min-width:\s*431px\)[\s\S]*radial-gradient/)

  })
  it('is loaded by every retained mobile portal', () => {
    for (const app of mobileApps) {
      const globalStyle = readFileSync(resolve(root, `apps/${app}/src/styles/global.scss`), 'utf8')
      expect(globalStyle, app).toContain('packages/ui/src/mobile-theme.scss')
    }
  })

  it('uses the shared page background in the user, store and promoter portals', () => {
    for (const app of ownedMobileApps) {
      const pages = JSON.parse(readFileSync(resolve(root, `apps/${app}/src/pages.json`), 'utf8'))
      expect(pages.globalStyle.backgroundColor, app).toBe('#f4f7f5')
    }
  })
})
