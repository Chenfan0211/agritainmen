import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('supplier product review workspace', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

  it('keeps the full-width product workspace behind the required product tab', () => {
    expect(source).toContain('productWorkspace')
    expect(source).toContain('product-work-page')
    expect(source).toContain('商品管理')
    const tabs = source.match(/const supplierTabs = \[([\s\S]*?)\n\]/)?.[1] || ''
    expect(tabs).toContain("key: 'products'")
    expect(tabs).toContain("label: '商品'")
  })

  it('provides all required filters and review-aware actions', () => {
    for (const label of ['全部', '待审核', '已驳回', '已下架', '已上架']) expect(source).toContain(label)
    expect(source).toContain('store.submitCatalogProduct')
    expect(source).toContain('store.adjustCatalogProductStock')
    expect(source).toContain('store.toggleCatalogProduct')
    expect(source).toContain('重新提交')
    expect(source).toContain('reviewNote')
    expect(source).toContain('picker mode="selector" :range="productFilters"')
    expect(source).not.toContain('product-filter-chips')
  })

  it('shows and validates MOQ and refreshes catalog plus submissions', () => {
    expect(source).toContain('minimumOrderQuantity')
    expect(source).toContain('起订量')
    expect(source).toContain('起订量必须为大于等于 1 的整数')
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_CATALOG_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY')
  })
})
