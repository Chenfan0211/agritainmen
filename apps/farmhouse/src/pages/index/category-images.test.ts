import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const styles = readFileSync(resolve(import.meta.dirname, '../../styles/index-page.scss'), 'utf8')
const theme = readFileSync(resolve(import.meta.dirname, '../../../../../packages/ui/src/mobile-theme.scss'), 'utf8')

describe('农家乐商品分类图片', () => {
  it('使用共享品类图片替换分类系统图标', () => {
    expect(page).toContain('productCategoryImage')
    expect(page).not.toContain('categoryIconName')
    expect(page).toMatch(/<BusinessImage\s+class="category-grid-img"\s+:src="productCategoryImage\(item, dictionaryState\)"\s+:fallback="defaultProductCategoryImage\(item\)"\s+:error-fallback="defaultProductCategoryImage\(\)"\s+:show-error="false"/)
  })

  it('订阅字典更新并在卸载时释放订阅', () => {
    expect(page).toContain('const dictionaryState = ref(readPlatformDictionaries())')
    expect(page).toContain('disposeDictionaryImages = dictCache.subscribe((state) => { dictionaryState.value = state })')
    expect(page).toContain('disposeDictionaryImages()')
    expect(page).toContain('dictCache.dispose()')
  })

  it('圆形宫格两行对齐，商品卡标签与名称竖排', () => {
    expect(theme).toMatch(/\.category-grid-label\s*\{[^}]*height:\s*calc\(12px \* 1\.25 \* 2\)/s)
    expect(page).toContain('class="tag-row"')
    expect(page).not.toContain('class="product-name-row"')
    expect(styles).not.toMatch(/\.product-tag-row\s*\{[^}]*min-height:\s*23px/s)
  })
})
