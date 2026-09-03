import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformDictionaryState } from '@agritainment/shared'
import { buildProductCategoryOptions } from './product-categories'

vi.mock('@agritainment/shared', () => ({
  productCategoryImage: (category: string) => ({ source: 'builtin', path: `/static/categories/${category || 'fallback'}.webp` })
}))

const image = { source: 'asset', assetId: 'category-produce' } as const
const state = {
  schemaVersion: 1,
  revision: 0,
  updatedAt: '2026-09-02T00:00:00.000Z',
  groups: [],
  items: [
    { id: 'produce', type: 'productCategory', code: 'produce', label: ' 农产品 ', enabled: true, sort: 20, image },
    { id: 'produce-copy', type: 'productCategory', code: 'produce-copy', label: '农产品', enabled: true, sort: 30 },
    { id: 'gift', type: 'productCategory', code: 'gift', label: '文旅伴手礼', enabled: true, sort: 10 },
    { id: 'disabled', type: 'productCategory', code: 'disabled', label: '停用品类', enabled: false, sort: 0 },
    { id: 'other', type: 'supplierCategory', code: 'other', label: '供应商主营', enabled: true, sort: 0 }
  ]
} as unknown as PlatformDictionaryState

describe('supplier product category options', () => {
  it('uses enabled product-category dictionary images in dictionary order', () => {
    expect(buildProductCategoryOptions(state)).toEqual([
      { label: '文旅伴手礼', image: { source: 'builtin', path: '/static/categories/文旅伴手礼.webp' }, legacy: false },
      { label: '农产品', image, legacy: false }
    ])
  })

  it('keeps a missing current category with the shared fallback image', () => {
    expect(buildProductCategoryOptions(state, ' 旧商品分类 ')).toContainEqual({
      label: '旧商品分类',
      image: { source: 'builtin', path: '/static/categories/旧商品分类.webp' },
      legacy: true
    })
    expect(buildProductCategoryOptions(state, '农产品')).toHaveLength(2)
  })

  it('renders category images at every supplier product touchpoint', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

    expect(source).not.toContain('categoryIconName')
    expect(source).toMatch(/product-category-image[^>]*:src="productCategoryImage/)
    expect(source).toMatch(/category-picker-trigger-image[^>]*:src="productCategoryImage/)
    expect(source).toMatch(/category-picker-option-image[^>]*:src="option\.image"/)
    expect(source).toContain('.product-category-image { width: 22px; height: 22px;')
    expect(source).toContain('.category-picker-trigger-image { width: 28px; height: 28px;')
    expect(source).toContain('.category-picker-option-image { width: 40px; height: 40px;')
    expect(source).toMatch(/product-category-image[^>]*:fallback="defaultProductCategoryImage\(row\.product\.category\)"[^>]*:show-error="false"/)
    expect(source).toMatch(/category-picker-trigger-image[^>]*:fallback="defaultProductCategoryImage\(productEditor\.category\)"[^>]*:show-error="false"/)
    expect(source).toMatch(/category-picker-option-image[^>]*:fallback="defaultProductCategoryImage\(option\.label\)"[^>]*:show-error="false"/)
    expect(source.match(/:error-fallback="defaultProductCategoryImage\(\)"/g)).toHaveLength(3)
    expect(source).toMatch(/\.product-category-meta \{[^}]*overflow:hidden;/)
    expect(source).toMatch(/\.category-picker-option-main>view \{[^}]*min-width:0;/)
    expect(source).toMatch(/\.category-picker-option-main>view text \{[^}]*text-overflow:ellipsis;/)
  })
})
