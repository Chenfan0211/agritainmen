import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditTypography, auditTypographySource } from './audit-typography.mjs'

describe('auditTypographySource', () => {
  it('rejects business text below the 11px minimum', () => {
    const failures = auditTypographySource('.meta { font-size: 10px; }', 'sample.vue')

    expect(failures).toEqual([
      expect.objectContaining({ file: 'sample.vue', line: 1, value: 10, kind: 'css' })
    ])
  })

  it('allows explicitly decorative icon sizing', () => {
    const failures = auditTypographySource('.icon-dot { font-size: 8px; }', 'sample.vue')

    expect(failures).toEqual([])
  })

  it('requires interactive text to be at least 13px', () => {
    expect(auditTypographySource('.submit-button { font-size: 12px; }', 'sample.vue')).toEqual([
      expect.objectContaining({ value: 12, minimum: 13, kind: 'css' })
    ])
    expect(auditTypographySource('.submit-button { font-size: 13px; }', 'sample.vue')).toEqual([])
    expect(auditTypographySource('.head-share-btn { font-size: 12px; }', 'sample.vue')).toEqual([
      expect.objectContaining({ value: 12, minimum: 13, kind: 'css' })
    ])
  })

  it('requires common auxiliary text to be at least 12px', () => {
    expect(auditTypographySource('.order-meta { font-size: 11px; }', 'sample.vue')).toEqual([
      expect.objectContaining({ value: 11, minimum: 12, kind: 'css' })
    ])
    expect(auditTypographySource('.order-meta { font-size: 12px; }', 'sample.vue')).toEqual([])
  })

  it('keeps compact chart text at 11px or above', () => {
    expect(auditTypographySource('axisLabel: { fontSize: 11 }', 'chart.ts')).toEqual([])
    expect(auditTypographySource('axisLabel: { fontSize: 10 }', 'chart.ts')).toEqual([
      expect.objectContaining({ file: 'chart.ts', line: 1, value: 10, kind: 'chart' })
    ])
  })

  it('scans portal source without reporting generated dist assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'typography-audit-'))
    mkdirSync(join(root, 'apps', 'admin', 'src'), { recursive: true })
    mkdirSync(join(root, 'apps', 'admin', 'dist'), { recursive: true })
    mkdirSync(join(root, 'packages', 'ui', 'src'), { recursive: true })
    writeFileSync(join(root, 'apps', 'admin', 'src', 'page.vue'), '.meta { font-size: 10px; }')
    writeFileSync(join(root, 'apps', 'admin', 'dist', 'page.css'), '.duplicate { font-size: 8px; }')

    expect(auditTypography(root)).toEqual([
      expect.objectContaining({ file: 'apps/admin/src/page.vue', value: 10 })
    ])
  })
})
