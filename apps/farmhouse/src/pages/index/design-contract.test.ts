import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const styles = readFileSync(resolve(import.meta.dirname, '../../styles/index-page.scss'), 'utf8')

describe('农家乐设计稿布局契约', () => {
  it('门店页使用场景头图、合并快捷入口和横向内容流', () => {
    expect(template).toMatch(/class="[^"]*hero2[^"]*"/)
    expect(template).toMatch(/class="[^"]*loc-chip[^"]*"/)
    expect(template).toMatch(/class="[^"]*store-card[^"]*"/)
    expect(template).toMatch(/class="[^"]*quick2[^"]*"/)
    expect(template).toMatch(/class="[^"]*notice2[^"]*"/)
    expect(template).toMatch(/class="[^"]*food-h[^"]*"/)
    expect(template).toMatch(/class="[^"]*room-h[^"]*"/)
    expect(template).toMatch(/class="[^"]*svc-card[^"]*"/)
    expect(styles).toMatch(/\.hero2\s*\{[^}]*height:\s*212px/s)
  })

  it('预订页使用五日历片、包厢大图和套餐双列', () => {
    expect(template).toMatch(/class="[^"]*date-strip[^"]*"/)
    expect(template).toMatch(/class="[^"]*date-chip[^"]*"/)
    expect(template).toContain('bookingDateOptions')
    expect(template).toMatch(/class="[^"]*room-list2[^"]*"/)
    expect(template).toMatch(/class="[^"]*room-li[^"]*"/)
    expect(template).toMatch(/class="[^"]*combo-g[^"]*"/)
    expect(template).toMatch(/class="[^"]*combo-c[^"]*"/)
    expect(template).toMatch(/class="[^"]*book-float[^"]*"/)
    expect(styles).toMatch(/\.date-strip\s*\{[^}]*display:\s*flex/s)
    expect(styles).toMatch(/\.combo-g\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s)
  })

  it('商城页将搜索、分类、商品角标和购物车按设计稿分层', () => {
    expect(template).toMatch(/class="[^"]*shop-head[^"]*"/)
    expect(template).toMatch(/class="[^"]*search2[^"]*"/)
    expect(template).toMatch(/class="[^"]*cat-scroll[^"]*"/)
    expect(template).toMatch(/class="[^"]*wf[^"]*"/)
    expect(template).toMatch(/class="[^"]*p-card[^"]*"/)
    expect(template).toMatch(/class="[^"]*cart-float[^"]*"/)
    expect(styles).toMatch(/\.p-card img\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s)
  })

  it('会员页使用合并头卡、资产卡、四列服务和三列工作台', () => {
    expect(template).toMatch(/class="[^"]*mem-hero[^"]*"/)
    expect(template).toMatch(/class="[^"]*mem-asset[^"]*"/)
    expect(template).toMatch(/class="[^"]*svc5[^"]*"/)
    expect(template).toMatch(/class="[^"]*role-card[^"]*"/)
    expect(template).toMatch(/class="[^"]*workbench-grid[^"]*"/)
    expect(template).not.toMatch(/class="mall-hero"[^>]*>[\s\S]*会员中心/)
    expect(styles).toMatch(/\.svc5\s*\{[^}]*grid-template-columns:\s*repeat\(4/s)
    expect(styles).toMatch(/\.workbench-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s)
  })

  it('弹层和子页具备设计稿要求的统一分组结构', () => {
    expect(template).toMatch(/class="[^"]*login-brand-row[^"]*"/)
    expect(template).toMatch(/class="[^"]*cart-channel-segment[^"]*"/)
    expect(template).toMatch(/class="[^"]*sku-options-grid[^"]*"/)
    expect(template).toMatch(/class="[^"]*payment-method-card[^"]*"/)
    expect(template).toMatch(/class="[^"]*upload-grid[^"]*"/)
    expect(template).toMatch(/class="[^"]*management-form-grid[^"]*"/)
    expect(template).toMatch(/class="[^"]*status-corner[^"]*"/)
    expect(styles).toMatch(/\.upload-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s)
    expect(styles).toMatch(/\.management-form-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s)
  })

  it('关键布局使用 token 并保护小程序与移动端安全区', () => {
    expect(styles).not.toMatch(/#[0-9A-Fa-f]{3,8}/)
    expect(styles).toMatch(/@media\s*\(min-width:\s*431px\)[\s\S]*?\.app-shell\s*\{[^}]*max-width:\s*430px/s)
    expect(styles).toContain('env(safe-area-inset-bottom)')
    expect(styles).toContain('@media (hover: hover)')
  })
})
