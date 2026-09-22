import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

describe('用户端商品分类图片', () => {
  it('分类页用横向图片宫格，复用共享品类图片', () => {
    expect(page).toContain('productCategoryImage')
    expect(page).toContain('class="category-grid"')
    expect(page).toContain('class="category-grid-item"')
    expect(page).toContain('class="category-grid-img"')
    expect(page).toContain('class="category-grid-label"')
    expect(page).toMatch(/<BusinessImage\s+class="category-grid-img"\s+:src="productCategoryImage\(/)
    expect(page).not.toContain('categoryIconName')
    expect(page).not.toContain('class="category-pills"')
    expect(page).not.toContain('class="category-pill"')
  })

  it('订阅字典更新并在卸载时释放缓存', () => {
    expect(page).toContain('const dictionaryState = ref(readPlatformDictionaries())')
    expect(page).toContain('disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })')
    expect(page).toContain('disposeDictionaryImages()')
    expect(page).toContain('dictCache.dispose()')
  })
})