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
})
