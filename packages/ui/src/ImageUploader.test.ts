import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ImageUploader.vue', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'), source.indexOf('<style'))
const styles = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] || ''

function rule(selector: string): string {
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').map((part) => part.trim()).includes(selector))
    .map((match) => match[2])
    .join(';')
}

describe('ImageUploader visual contract', () => {
  it('puts the delete control on the preview corner and reorders by drag', () => {
    expect(template).toContain('class="business-uploader__item"')
    expect(template).toContain('class="business-uploader__choose"')
    expect(template).toContain('aria-label="删除图片"')
    expect(template).toContain(':draggable="canReorder"')
    expect(template).toContain('@dragstart="onDragStart(index, $event)"')
    expect(template).toContain('@drop.prevent="onDrop(index)"')
    expect(template).toContain("canReorder ? '拖拽排序'")
    expect(template).not.toContain('aria-label="前移"')
    expect(template).not.toContain('aria-label="后移"')
    expect(template).not.toContain('替换图片')
    expect(template).toContain('上传图片')
    expect(source).toContain('moveUploadedMedia')
    expect(rule('.business-uploader__item')).toMatch(/position:\s*relative/)
    expect(rule('.business-uploader__remove')).toMatch(/position:\s*absolute/)
    expect(rule('.business-uploader__remove')).toMatch(/top:\s*\d+px/)
    expect(rule('.business-uploader__remove')).toMatch(/right:\s*\d+px/)
    expect(styles).not.toContain('.business-uploader__sort')
  })

  it('renders the choose tile as a centered 88px square', () => {
    expect(rule('.business-uploader')).toMatch(/align-items:\s*flex-start/)
    expect(rule('.business-uploader__choose')).toMatch(/width:\s*88px/)
    expect(rule('.business-uploader__choose')).toMatch(/height:\s*88px/)
    expect(rule('.business-uploader__choose')).toMatch(/display:\s*inline-flex/)
    expect(rule('.business-uploader__choose')).toMatch(/align-items:\s*center/)
    expect(rule('.business-uploader__choose')).toMatch(/justify-content:\s*center/)
    expect(styles).toMatch(/\.business-uploader__choose::after[^{]*\{[^}]*border:\s*none/)
  })

  it('uses design tokens instead of hardcoded colors', () => {
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(rule('.business-uploader__preview')).toContain('var(--color-line)')
    expect(rule('.business-uploader__choose')).toContain('var(--color-line)')
    expect(rule('.business-uploader__remove')).toContain('var(--color-danger)')
    expect(rule('.business-uploader__remove')).toContain('var(--color-on-brand)')
  })
})
