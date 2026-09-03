import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

describe('门店端商品分类图片', () => {
  it('使用共享品类图片替换分类系统图标', () => {
    expect(page).toContain('productCategoryImage')
    expect(page).not.toContain('categoryIconName')
    expect(page).toMatch(/<BusinessImage\s+class="category-image"\s+:src="productCategoryImage\(item\.key, dictionaryState\)"\s+:fallback="defaultProductCategoryImage\(item\.key\)"\s+:error-fallback="defaultProductCategoryImage\(\)"\s+:show-error="false"/)
  })

  it('订阅字典更新并在卸载时释放缓存', () => {
    expect(page).toContain('const dictionaryState = ref(readPlatformDictionaries())')
    expect(page).toContain('disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })')
    expect(page).toContain('disposeDictionaryImages()')
    expect(page).toContain('dictCache.dispose()')
  })

  it('固定方图尺寸并防止长分类名称溢出', () => {
    expect(page).toMatch(/\.category-image\s*\{[^}]*width:\s*26px[^}]*height:\s*26px[^}]*flex:\s*0 0 26px[^}]*\}/s)
    expect(page).toMatch(/\.chips button\s*\{[^}]*min-height:\s*var\(--mobile-touch-target\)/s)
    expect(page).toMatch(/\.category-label\s*\{[^}]*max-width:[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*\}/s)
  })

  it('reserves a separate line and column for stock beside the add button', () => {
    expect(page).toContain('class="product-stats-top"')
    expect(page).toContain('class="product-stock"')
    expect(page).toMatch(/\.product-stats\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*flex-start/s)
    expect(page).toMatch(/\.product-foot button\s*\{[^}]*flex:\s*0 0 44px/s)
  })
})
