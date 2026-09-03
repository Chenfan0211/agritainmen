import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('supplier product review workspace', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')

  it('keeps product management in the mobile bottom navigation', () => {
    expect(source).toContain('productWorkspace')
    expect(source).toContain('product-work-page')
    expect(source).toContain('商品管理')
    const tabs = source.match(/const supplierTabs = \[([\s\S]*?)\n\]/)?.[1] || ''
    expect(tabs).toContain("key: 'products'")
    expect(tabs).toContain("label: '商品'")
    expect(source).toContain("active === 'products'")
    expect(source).not.toContain('.product-work-page { position: fixed')
  })

  it('provides all required filters and review-aware actions', () => {
    for (const label of ['全部', '待审核', '已驳回', '已下架', '已上架']) expect(source).toContain(label)
    expect(source).toContain('store.submitCatalogProduct')
    expect(source).toContain('store.adjustCatalogProductStock')
    expect(source).toContain('store.toggleCatalogProduct')
    expect(source).toContain('重新提交')
    expect(source).toContain('reviewNote')
    expect(source).toContain('product-filter-chips')
    expect(source).toContain('productKeyword')
  })

  it('shows and validates MOQ and refreshes catalog plus submissions', () => {
    expect(source).toContain('minimumOrderQuantity')
    expect(source).toContain('起订量')
    expect(source).toContain('起订量必须为大于等于 0 的整数')
    expect(source).toContain('无起订限制')
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_CATALOG_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_CATALOG_PRODUCT_SUBMISSIONS_STORAGE_KEY')
  })

  it('supports product media, tags and multiple SKU editing', () => {
    expect(source).toContain('ImageUploader')
    expect(source).toContain('商品主图')
    expect(source).toContain('商品图集')
    expect(source).toContain('商品标签')
    expect(source).toContain('addSupplierSku')
    expect(source).toContain('removeSupplierSku')
    expect(source).toContain('SKU 至少保留一个有效规格')
  })
})
