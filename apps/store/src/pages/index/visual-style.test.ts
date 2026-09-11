import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>') + '<template>'.length, source.lastIndexOf('</template>'))
const styles = source.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''

function expectRule(selector: string, declarations: RegExp) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  expect(styles).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*${declarations.source}[^}]*\\}`, 's'))
}

describe('门店端现代供应链视觉契约', () => {
  it('使用业务图标表达门店、位置、供应链策略和电话操作', () => {
    expect(template).not.toMatch(/\p{Extended_Pictographic}/u)

    expect(template).toContain('<UiIcon name="shopping-cart"')
    expect(template).toContain('<UiIcon name="map-pin"')
    expect(template).toContain('<UiIcon name="package-check"')
    expect(template).toContain('<UiIcon name="phone"')
  })

  it('商品、详情图库和订单缩略图统一使用裁切填充', () => {
    for (const className of ['product-emoji', 'order-thumb', 'hot-emoji', 'detail-gallery-image']) {
      expect(template).toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFill"`))
      expect(template).not.toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFit"`))
    }
  })

  it('使用跨端双列瀑布流并限制商品卡在窄屏内收缩', () => {
    expectRule('.mall-hero', /padding:\s*calc\(12px\s*\+\s*env\(safe-area-inset-top\)\)\s*8px\s*16px/)
    expectRule('.page-pad', /padding:\s*0 8px/)
    expectRule('.mall-hero', /background:\s*var\(--farm-green-deep\)/)
    expectRule('.app-shell', /overflow-x:\s*hidden/)
    expect(template).toContain('class="waterfall-grid"')
    expect(template).toContain('class="waterfall-column"')
    expectRule('.waterfall-grid', /display:\s*flex/)
    expectRule('.waterfall-column', /flex:\s*1/)
  })

  it('详情页直接展示规格起订量，商品列表保持紧凑', () => {
    expect(template).toContain('起订 {{ effectiveMinimumOrderQuantity(sku) }} 件')
    expect(template).toContain('当前规格起订量')
    expect(template.slice(template.indexOf('class="waterfall-grid"'), template.indexOf('class="category-page"'))).not.toContain('起订')
  })

  it('商品详情使用大图融合长页、内联规格数量和固定加购栏', () => {
    expect(template).toContain('class="detail-gallery"')
    expect(template).toContain('class="detail-gallery-count"')
    expect(template).toContain('v-if="detailGallery.length > 1"')
    expect(template).toContain('class="detail-summary detail-section"')
    expect(template).toContain('class="detail-sku-options"')
    expect(template).toContain('class="detail-quantity-stepper"')
    expect(template).toContain(':disabled="!selectedSku || detailQuantity >= detailRemainingStock"')
    expect(template).toContain('class="detail-ladder-section detail-section"')
    expect(template).toContain('class="detail-product-info detail-section"')
    expect(template).toContain('class="detail-rich-images detail-section"')
    expect(template).toContain('class="product-detail-bar"')
    expect(template).toContain('<view v-if="!productView" class="tabbar">')
    expect(template).toContain('进入进货单')
    expect(template).not.toContain('销售时间')
    expect(template).not.toContain('商品评分')
    expectRule('.detail-gallery', /aspect-ratio:\s*1\s*\/\s*1/)
    expectRule('.detail-sku-option', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.detail-quantity-stepper button', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.product-detail-bar', /position:\s*fixed[^}]*padding-bottom:\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom\)\)/)
    expectRule('.product-view', /padding-bottom:\s*calc\(72px\s*\+\s*env\(safe-area-inset-bottom\)\)/)
    expect(source).toContain('next > detailRemainingStock.value')
    expect(template).toContain('detailNextTier.minQty - detailPricingQuantity')
    expect(source).toContain('readStorePricePolicies')
    expect(source).not.toContain('activePolicies.value.length ? activePolicies.value : pricePolicies')
  })

  it('主要卡片使用不超过八像素的统一圆角和克制阴影', () => {
    for (const selector of ['.product-card', '.order-card', '.hot-list', '.login-card']) {
      expectRule(selector, /border-radius:\s*var\(--mobile-radius-card\)/)
      expectRule(selector, /box-shadow:\s*var\(--mobile-shadow-card\)/)
    }
  })

  it('主要按钮和图标按钮保留至少四十四像素触控区', () => {
    expectRule('.chips button', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.cart-count', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.cart-bar>button:last-child', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.sheet-head button', /width:\s*44px[^}]*height:\s*44px/)
    expectRule('.outline-button', /height:\s*var\(--mobile-touch-target\)/)
    expectRule('.login-tabs button', /min-height:\s*var\(--mobile-touch-target\)/)
    expectRule('.logout-button', /min-height:\s*var\(--mobile-touch-target\)/)
  })

  it('商品列表辅助价格和购物车角标保持移动端可读字号', () => {
    expectRule('.muted', /font-size:\s*12px/)
    expectRule('.cost-line del,.cost-prices del', /font-size:\s*12px/)
    expectRule('.cost-line span,.cost-prices span', /font-size:\s*12px/)
    expectRule('.side-item', /font-size:\s*13px/)
    expectRule('.cart-count span', /font-size:\s*13px/)
    expectRule('.tab-badge', /font-size:\s*13px/)
    expectRule('.cart-all', /font-size:\s*13px/)
    expectRule('.cart-del', /font-size:\s*13px/)
    expectRule('.detail-bar-link', /font-size:\s*13px/)
    expectRule('.quick-grid .pc-tile-label', /font-size:\s*13px/)
  })

  it('分类和购物车页头使用本端主题色块，商品卡底行是圆形加购', () => {
    expect(template).toContain('class="mall-hero-title">商品分类')
    expect(template).toContain('class="mall-hero-title">购物车')
    expect(template).not.toContain('>加购<')
    expect(template).toContain('class="add-btn"')
    expect(template).toContain('<UiIcon name="plus"')
    expectRule('.product-foot button', /width:\s*32px/)
    expectRule('.product-foot button', /height:\s*32px/)
    expectRule('.product-foot button', /border-radius:\s*50%/)
    expectRule('.product-foot button', /background:\s*var\(--farm-green\)/)
    expectRule('.cat-add', /width:\s*32px/)
    expectRule('.cat-add', /height:\s*32px/)
    expectRule('.cat-add', /border-radius:\s*50%/)
    expectRule('.cat-add', /background:\s*var\(--farm-green\)/)
    expectRule('.product-foot', /min-height:\s*0/)
    expect(styles).not.toMatch(/\.tabbar button\.active \.ui-icon\s*\{[^}]*filter:/s)
    expect(styles).toMatch(/\.sku-options\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(styles).toMatch(/\.stepper button\s*\{[^}]*height:\s*32px/s)
    expect(styles).not.toMatch(/\.cart-footer\s*\{[^}]*position:\s*sticky/s)
    expect(styles).not.toMatch(/\.cart-footer\s*\{[^}]*position:\s*fixed/s)
  })

  it('六类业务弹层都有稳定的视觉验收入口', () => {
    for (const state of ['product', 'cart', 'checkout', 'order', 'contact', 'address']) {
      expect(template).toContain(`data-visual-state="store-${state}"`)
    }
    expectRule('.sheet', /max-width:\s*100%/)
    expectRule('.sheet', /overflow:\s*hidden/)
    expectRule('.sheet', /max-height:\s*var\(--mobile-sheet-max-height\)/)
    expect(styles).toMatch(/@media \(min-width:\s*431px\)[\s\S]*?\.sheet\s*\{[^}]*max-width:\s*430px/)
  })

  it('购物车栏和不透明底部导航拥有独立正文占位', () => {
    expect(template).toContain(`:class="{ 'has-cart-bar': (activeTab === 'home' || activeTab === 'category') && store.cartCount }"`)
    expectRule('.app-shell.has-cart-bar', /padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*28px\s*\+\s*env\(safe-area-inset-bottom\)\)/)
    expectRule('.tabbar', /background:\s*var\(--mobile-surface\)/)
  })

  it('分类商品卡标签与名称拆行，侧栏选中只用品牌竖条', () => {
    expect(template).not.toContain('class="cat-name-row"')
    expect(template).toContain('class="tag-row"')
    expect(template).toContain('class="cat-product-name"')
    expectRule('.cat-product-body', /flex-direction:\s*column/)
    expectRule('.cat-product-name', /width:\s*100%/)
    expectRule('.cat-product-name', /-webkit-line-clamp:\s*2/)
    expectRule('.side-item.active', /box-shadow:\s*inset 3px 0 0 var\(--farm-green\)/)
    expectRule('.cost-line', /flex-direction:\s*column/)
  })

  it('紧凑次级操作使用共享 40px 契约且长内容可收缩', () => {
    expectRule('.stock-actions .compact-button', /min-height:\s*var\(--mobile-control-compact\)/)
    expectRule('.sheet-line > view:nth-child\(2\)', /min-width:\s*0/)
    expectRule('.order-detail-head > text', /word-break:\s*break-all/)
    expectRule('.checkout-line > text', /min-width:\s*0[^}]*word-break:\s*break-all/)
    expect(styles.toLowerCase()).not.toContain('#17633f')
  })

  it('H5 画框包在条件编译内，登录空态避开胶囊，订货圆角不超过 8px', () => {
    expect(source).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*@media \(min-width:431px\)[\s\S]*\/\* #endif \*\//)
    expect(source).toMatch(/\.login-page \{[\s\S]*padding-top: calc\(24px \+ var\(--status-bar-height\)\)/)
    expect(source).toMatch(/\.state-page,\s*\.loading \{[\s\S]*padding-right: 96px/)
    expect(styles).toMatch(/\.order-thumb \{[^}]*border-radius:8px/)
    expect(styles).toMatch(/\.cart-del \{[^}]*border-radius:8px/)
    expect(styles).toMatch(/\.steps \{[^}]*overflow-x:auto[^}]*minmax\(56px,1fr\)/)
    expect(styles).not.toMatch(/@media \(max-width:375px\) \{[\s\S]*\.steps \{/)
    expect(styles).toMatch(/\.sheet-head \{[^}]*padding:6px 12px/)
    expect(styles).toMatch(/\.store-metrics \{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
    expect(template).toMatch(/class="hot-list pc-empty"[\s\S]*暂无常订商品/)
    expect(styles).toMatch(/@media \(min-width:431px\)[\s\S]*\.login-page \{ max-width:430px/)
  })

  it('门店工作台去掉去订货和账号结算字段，快捷入口三列单列资料卡', () => {
    expect(template).not.toContain('去订货')
    expect(template).not.toContain('门店账号')
    expect(template).not.toContain('登录账号')
    expect(template).not.toContain('结算方式')
    expect(template).not.toContain('class="store-info"')
    expect(template).not.toContain('class="store-identity-meta"')
    expect(template).not.toContain('客服 {{ store.info.phone }}')
    expect(template).not.toContain('class="catalog-boundary"')
    expect(template).not.toContain('class="security-note"')
    expect(template).not.toContain('class="policy-hint"')
    expect(styles).not.toContain('.catalog-boundary')
    expect(styles).not.toContain('.policy-hint')
    expect(styles).not.toContain('.security-note')
    expect(template).toContain('地址 {{ store.info.address }}')
    expectRule('.quick-grid', /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expectRule('.store-identity', /display:\s*flex/)
    expectRule('.store-identity .store-identity-address', /white-space:\s*normal/)
    expectRule('.sheet-scroll', /height:\s*auto/)
    expectRule('.sheet-scroll', /max-height:\s*calc\(80vh/)
  })

  it('订单详情操作栏贴在 sheet-foot，section 间距收紧', () => {
    expect(template).toMatch(/<\/scroll-view>[\s\S]*class="order-actions sheet-foot"/)
    expect(template).not.toMatch(/class="order-actions"[\s\S]*<\/scroll-view>/)
    expect(styles).toMatch(/\.steps \{ margin-top:8px/)
    expect(styles).toMatch(/\.logistics \{ margin-top:8px/)
    expect(styles).toMatch(/\.order-items \{ margin-top:8px/)
  })

  it('购物车 Tab 结算条用 flex 钉底，375 可换行，地址复制在 scroll 外', () => {
    expect(styles).toMatch(/\.cart-page \{[^}]*display:\s*flex[^}]*flex-direction:\s*column/)
    expect(styles).toMatch(/\.cart-page \{[^}]*min-height:\s*100vh/)
    expect(styles).toMatch(/\.tab-page\.cart-page \{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)/)
    expect(styles).toMatch(/\.cart-footer \{[^}]*flex:\s*none/)
    expect(styles).toMatch(/\.cart-footer \{[^}]*margin:\s*0;/)
    expect(styles).toMatch(/\.cart-footer \{[^}]*border-radius:\s*0/)
    expect(styles).not.toMatch(/\.cart-footer \{[^}]*box-shadow/)
    expect(styles).not.toMatch(/\.cart-footer \{[^}]*z-index:\s*22/)
    expect(styles).not.toMatch(/\.cart-footer \{[^}]*position:\s*sticky/)
    expect(styles).not.toMatch(/\.cart-footer \{[^}]*position:\s*fixed/)
    expect(template).toContain('合计：')
    expect(styles).toMatch(/\.cart-row \{[^}]*align-items:\s*stretch/)
    expect(styles).toMatch(/\.cart-row-main \{[^}]*flex-direction:\s*column/)
    expect(styles).toMatch(/\.cart-row-bottom \{[^}]*margin-top:\s*auto/)
    expect(styles).toMatch(/\.cart-row-meta \{/)
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.cart-footer \{[^}]*flex-wrap:\s*wrap/)
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.store-metrics \{[^}]*grid-template-columns:\s*repeat\(2/)
    expect(styles).toMatch(/\.empty-page \{[^}]*min-height:\s*132px/)
    const scrollEnd = template.indexOf('</scroll-view>')
    expect(template.slice(scrollEnd)).toContain('@click="copyAddress"')
    expect(template.slice(0, scrollEnd)).not.toContain('@click="copyAddress"')
  })

  it('进货单、确认下单、详情和客服主操作也贴在 sheet-foot', () => {
    const scrollEnd = template.indexOf('</scroll-view>')
    const afterScroll = template.slice(scrollEnd)
    expect(afterScroll).toMatch(/sheet === 'cart'[\s\S]*确认下单/)
    expect(afterScroll).toMatch(/sheet === 'checkout'[\s\S]*提交订单/)
    expect(afterScroll).toContain('class="product-detail-actions sheet-foot"')
    expect(afterScroll).toContain('class="contact-actions sheet-foot"')
    expect(template.slice(0, scrollEnd)).not.toContain('确认下单')
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.order-head \{[^}]*flex-wrap:\s*wrap/)
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.order-no \{[^}]*white-space:\s*normal/)
  })

  it('详情加购只提示，不打开进货单弹层', () => {
    const addSelected = source.match(/function addSelected\(\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(addSelected).toContain("toast('已加入进货单')")
    expect(addSelected).not.toContain("sheet.value = 'cart'")
  })

  it('首页商品图绝对铺满正方形占位，不再塌成米色底', () => {
    expectRule('.product-image', /overflow:\s*hidden/)
    expectRule('.product-emoji', /position:\s*absolute/)
    expectRule('.product-emoji', /inset:\s*0/)
  })

  it('订货单和工作台页头用主题色块，非购物车底栏按 tab token 留白', () => {
    expect(template).toMatch(/class="mall-hero heading-with-back">[\s\S]*我的订货单/)
    expect(template).toMatch(/class="page-back" aria-label="返回"/)
    expect(template).toContain('data-visual-view="product"')
    expect(source).toContain("case 'product': return '选择规格'")
    expect(template).toContain('logout-danger')
    expect(template).not.toMatch(/class="mobile-head">[\s\S]*我的订货单/)
    expect(template).toMatch(/class="state-page pc-empty"/)
    expect(template).toContain('class="pc-state-icon"')
    expect(styles).toMatch(/\.tab-page\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*28px/)
    expect(styles).not.toMatch(/\.tab-page \{[^}]*padding-bottom:48px/)
    expect(styles).toMatch(/\.store-hero-top \.mall-hero-title/)
    expect(styles).toMatch(/\.login-page\{[^}]*padding:8px/)
    expect(template).toContain('class="pc-login-mark"')
    expect(template).toContain('<UiIcon name="shopping-bag"')
    expect(template).not.toContain('class="login-logo"')
    expect(styles).toMatch(/\.login-card\{[^}]*max-width:340px/)
    expect(styles).toMatch(/\.login-body\{[^}]*padding:16px 12px 18px/)
    expect(styles).not.toMatch(/\.mobile-head \{/)
    expect(styles).toMatch(/\.cart-row-bottom \.stepper button \{[^}]*width:var\(--mobile-control-compact\)/)
    expect(styles).toMatch(/\.cart-row-bottom \.stepper button \{[^}]*height:var\(--mobile-control-compact\)/)
  })
})
