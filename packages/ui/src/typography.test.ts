import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UI_TYPOGRAPHY } from './typography'

describe('shared typography tokens', () => {
  it('keeps the comfortable readability scale stable', () => {
    expect(UI_TYPOGRAPHY).toEqual({
      caption: 11,
      meta: 12,
      bodySmall: 13,
      body: 14,
      subtitle: 16,
      title: 20,
      chartCompact: 11,
      chartLabel: 12,
      chartTooltip: 13
    })
  })

  it('publishes matching CSS variables for every portal', () => {
    const source = readFileSync(new URL('./typography.scss', import.meta.url), 'utf8')

    for (const token of ['--font-ui', '--font-numeric', '--text-caption', '--text-meta', '--text-body-small', '--text-body', '--text-subtitle', '--text-title', '--line-compact', '--line-body', '--weight-medium', '--weight-strong']) {
      expect(source).toContain(token)
    }
  })
})
