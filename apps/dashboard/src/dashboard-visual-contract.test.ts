import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
const loginSource = readFileSync(new URL('./pages/login/index.vue', import.meta.url), 'utf8')

describe('dashboard visual layout contract', () => {
  it('keeps business copy readable and makes the map the primary workspace', () => {
    expect(source).toContain('--dashboard-business-text: 12px')
    expect(source).toMatch(/\.dashboard-shell\s*\{[^}]*font-size:\s*var\(--dashboard-business-text\)/s)
    expect(source).toMatch(/\.main-grid\s*\{[^}]*grid-template-columns:\s*minmax\(240px,\s*20%\)\s*minmax\(520px,\s*1fr\)\s*minmax\(280px,\s*22%\)/s)
    expect(`${source}\n${loginSource}`).not.toMatch(/font-size:\s*11px/)
  })

  it('keeps dialog headers fixed while long content scrolls independently', () => {
    expect(source).toMatch(/\.definition-dialog\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s)
    expect(source).toMatch(/\.definition-dialog dl\s*\{[^}]*overflow-y:\s*auto/s)
    expect(source).toMatch(/\.risk-drawer\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s)
    expect(source).toMatch(/\.risk-subject-list\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/s)
  })

  it('keeps short-viewport side charts readable and toolbar names unclipped', () => {
    expect(source).toMatch(/@media \(max-height: 700px\)[\s\S]*\.side-column \{[^}]*minmax\(120px,\s*1fr\)/)
    expect(source).not.toMatch(/grid-template-rows: repeat\(3, 100px\)/)
    expect(source).toMatch(/\.toolbar select \{[^}]*text-overflow: ellipsis/)
    expect(source).toMatch(/\.toolbar select \{[^}]*max-width: 120px/)
    expect(source).toMatch(/@media \(max-height: 700px\)[\s\S]*\.farm-detail-grid > view \{ min-height: 72px/)
  })

  it('1180 顶栏不再静默裁切，820 矮屏侧栏保底 120px', () => {
    expect(source).toMatch(/grid-template-rows:\s*minmax\(56px,\s*auto\)/)
    expect(source).not.toMatch(/grid-template-rows: 56px 100px/)
    expect(source).toMatch(/--dashboard-chrome-top:/)
    expect(source).toMatch(/\.empty-business \{[^}]*inset:\s*var\(--dashboard-chrome-top\)/)
    expect(source).toMatch(/\.toolbar \{[^}]*(?:flex-wrap:\s*wrap|overflow-x:\s*auto)/)
    expect(source).toMatch(/\.principal-badge strong \{[^}]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/\.data-status \{[^}]*text-overflow:\s*ellipsis/)
    expect(source).toMatch(/@media \(max-height: 820px\)[\s\S]*\.side-column \{[^}]*minmax\(120px,\s*1fr\)/)
    expect(source).toMatch(/\.has-data-error \.empty-business \{[^}]*inset:/)
    expect(source).toMatch(/\.risk-drawer header p \{[^}]*-webkit-line-clamp:\s*2/)
    expect(source).toMatch(/\.map-header \{[^}]*flex-wrap:\s*wrap/)
  })

  it('drops cheap HUD decorations while keeping the dark workspace', () => {
    expect(source).not.toMatch(/background-size:\s*32px 32px/)
    expect(source).not.toMatch(/\.panel::before/)
    expect(source).not.toMatch(/\.kpi::after/)
    expect(source).toMatch(/\.panel\s*\{[^}]*border-radius:\s*4px/s)
    expect(source).toMatch(/\.module-nav\s*\{[^}]*border-radius:\s*6px/s)
    expect(loginSource).not.toMatch(/login-brand::after/)
    expect(loginSource).not.toMatch(/background-size:\s*36px 36px/)
    expect(loginSource).toMatch(/input \{[^}]*height: 40px/)
    expect(loginSource).toMatch(/input \{[^}]*border-radius: 4px/)
    expect(source).not.toMatch(/\.dot\.city \{[^}]*box-shadow: 0 0 7px/)
    expect(source).toMatch(/\.risk-table > b \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.risk-drawer-summary span \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.farm-status-strip span \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.map-reset \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.toolbar select \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.kpi \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.control-grid > view \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.brand-mark \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.dot\.missing \{ background: transparent; border: 1px solid #ff7b7b; \}/)
    expect(source).toMatch(/\.data-status \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.chain-flow > view \{[^}]*border-radius: 4px/)
    expect(source).toMatch(/\.risk-drawer-summary span\.level-notice \{ border-color: #39738b; color: #62bde3; \}/)
    expect(source).toMatch(/\.region-table \{[^}]*grid-template-columns: 1\.15fr \.42fr \.42fr 1\.1fr \.48fr \.9fr \.42fr \.55fr \.65fr/)
    expect(source).not.toMatch(/\.region-table \{[^}]*grid-template-columns: 1\.5fr \.6fr 1fr \.6fr \.7fr \.7fr/)
  })
})
