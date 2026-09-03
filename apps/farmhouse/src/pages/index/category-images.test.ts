import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const styles = readFileSync(resolve(import.meta.dirname, '../../styles/index-page.scss'), 'utf8')

describe('农家乐商品分类图片', () => {
  it('使用共享品类图片替换分类系统图标', () => {
    expect(page).toContain('productCategoryImage')
    expect(page).not.toContain('categoryIconName')
    expect(page).toMatch(/<BusinessImage\s+class="category-image"\s+:src="productCategoryImage\(item, dictionaryState\)"\s+:fallback="defaultProductCategoryImage\(item\)"\s+:error-fallback="defaultProductCategoryImage\(\)"\s+:show-error="false"/)
  })

  it('订阅字典更新并在卸载时释放订阅', () => {
    expect(page).toContain('const dictionaryState = ref(readPlatformDictionaries())')
    expect(page).toContain('disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })')
    expect(page).toContain('disposeDictionaryImages()')
    expect(page).toContain('dictCache.dispose()')
  })

  it('固定方图尺寸并防止长分类名称溢出', () => {
    expect(styles).toMatch(/\.category-image\s*\{[^}]*width:\s*26px[^}]*height:\s*26px[^}]*flex:\s*0 0 26px[^}]*\}/s)
    expect(styles).toMatch(/\.chips button[^}]*min-height:\s*var\(--farm-touch-primary\)/s)
    expect(styles).toMatch(/\.category-label\s*\{[^}]*max-width:[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*\}/s)
  })
})
