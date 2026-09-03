import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('商品分类图片跨端契约', () => {
  it('移动业务端分类筛选统一使用共享品类图片', () => {
    const farmhouse = source('apps/farmhouse/src/pages/index/index.vue')
    const user = source('apps/user/src/pages/index/index.vue')
    const store = source('apps/store/src/pages/index/index.vue')

    for (const page of [farmhouse, user, store]) {
      expect(page).toContain('productCategoryImage')
      expect(page).toContain('<BusinessImage')
      expect(page).not.toContain('categoryIconName')
    }
    expect(farmhouse).toContain(':src="productCategoryImage(item, dictionaryState)"')
    expect(user).toContain(':src="productCategoryImage(category, dictionaryState)"')
    expect(store).toContain(':src="productCategoryImage(item.key, dictionaryState)"')
  })

  it('供应商商品卡和分类选择器显示共享品类图片', () => {
    const supplier = source('apps/supplier/src/pages/index/index.vue')
    expect(supplier).toContain(':src="productCategoryImage(row.product.category, productCategoryState)"')
    expect(supplier).toContain('v-if="categoryPickerOpen"')
    expect(supplier).toContain('v-for="option in productCategoryOptions"')
    expect(supplier).toContain(':src="option.image"')
    expect(supplier).toContain('@click="selectProductCategory(option.label)"')
    expect(supplier).not.toContain('categoryIconName')
  })

  it('后台商品分类选项和可见分类文本显示共享品类图片', () => {
    const admin = source('apps/admin/src/pages/index/index.vue')
    expect(admin).toContain('image: productCategoryImage(category, dictionaryState.value)')
    expect(admin).toContain(':src="productCategoryImage(product.category, dictionaryState)"')
    expect(admin).toContain(':src="productCategoryImage(item.name, dictionaryState)"')
    expect(admin).not.toContain('categoryIconName')
  })

  it('后台搜索下拉图片优先于系统图标且保留无图标兼容', () => {
    const options = source('apps/admin/src/components/searchable-select.ts')
    const select = source('apps/admin/src/components/SearchableSelect.vue')
    expect(options).toContain('image?: MediaReference')
    expect(options).toContain('icon?: string')
    expect(select).toContain('v-if="selectedOption?.image"')
    expect(select).toContain('v-else-if="selectedOption?.icon"')
    expect(select).toContain('v-if="option.image"')
    expect(select).toContain('v-else-if="option.icon"')
  })
})
