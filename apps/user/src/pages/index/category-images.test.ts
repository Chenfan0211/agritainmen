import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

describe('用户端商品分类图片', () => {
  it('使用共享品类图片替换分类系统图标', () => {
    expect(page).toContain('productCategoryImage')
    expect(page).not.toContain('categoryIconName')
    expect(page).toMatch(/<button v-for="category in categories"/)
    expect(page).toMatch(/<BusinessImage\s+class="category-image"\s+:src="productCategoryImage\(category, dictionaryState\)"\s+:fallback="defaultProductCategoryImage\(category\)"\s+:error-fallback="defaultProductCategoryImage\(\)"\s+:show-error="false"/)
  })

  it('订阅字典更新并在卸载时释放缓存', () => {
    expect(page).toContain('const dictionaryState = ref(readPlatformDictionaries())')
    expect(page).toContain('disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })')
    expect(page).toContain('disposeDictionaryImages()')
    expect(page).toContain('dictCache.dispose()')
  })

  it('固定方图尺寸并防止长分类名称溢出', () => {
    expect(page).toMatch(/\.category-image\s*\{[^}]*width:\s*26px[^}]*height:\s*26px[^}]*flex:\s*0 0 26px[^}]*\}/s)
    expect(page).toMatch(/\.category-item\s*\{[^}]*min-height:\s*var\(--mobile-control-compact\)/s)
    expect(page).toMatch(/\.category-label\s*\{[^}]*max-width:[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*\}/s)
  })

  it('保留横向滚动且不让原生滚动条挤占商品列表空间', () => {
    expect(page).toMatch(/\.category-row\s*\{[^}]*overflow-x:\s*auto[^}]*\}/s)
    expect(page).toContain('.category-row{scrollbar-width:none}')
    expect(page).toContain('.category-row::-webkit-scrollbar{display:none}')
  })
})
