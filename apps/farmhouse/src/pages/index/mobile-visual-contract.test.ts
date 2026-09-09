import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(import.meta.dirname, 'index.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>') + '<template>'.length, source.lastIndexOf('</template>'))
const stylePath = resolve(import.meta.dirname, '../../styles/index-page.scss')
const styles = existsSync(stylePath) ? readFileSync(stylePath, 'utf8') : ''

const workViews = ['select', 'verify', 'design-rooms', 'design-foods', 'design-experiences', 'staff-admin', 'orders', 'bookings', 'ledger', 'addresses', 'checkout', 'help']
const sheets = ['login', 'cart', 'orders', 'bookings', 'room-form', 'food-form', 'experience-form', 'share', 'product', 'contact', 'foods', 'ledger', 'recharge', 'identity', 'help', 'booking-form', 'after-sale', 'service', 'staff-form', 'staff-promo', 'pay']

describe('农家乐移动端视觉契约', () => {
  it('保留门店、预订、商城和会员四个主导航', () => {
    expect(source.match(/\{ key: '(home|reserve|shop|member)'/g)).toEqual([
      "{ key: 'home'",
      "{ key: 'reserve'",
      "{ key: 'shop'",
      "{ key: 'member'"
    ])
    expect(template).toContain(':data-visual-view="activeTab"')
  })

  it('为全部经营页和弹层提供稳定的视觉状态标记', () => {
    for (const view of workViews) expect(source, view).toContain(`'${view}'`)
    for (const sheet of sheets) expect(source, sheet).toContain(`'${sheet}'`)
    expect(template).toContain(':data-visual-view="workView"')
    expect(template).toContain(':data-visual-state="sheet"')
    expect(template).toContain('class="page-back" aria-label="返回会员中心"')
    expect(template).toContain('data-visual-view="product"')
    expect(template).toContain("sheet === 'product' ? '选择规格'")
    expect(template).toContain('logout-danger')
  })

  it('可见模板不再使用装饰 Emoji', () => {
    expect(template.match(/\p{Extended_Pictographic}/gu)).toBeNull()
  })

  it('门店、菜品、包厢、服务和商品图片使用裁切填充', () => {
    for (const className of ['hero-media', 'food-thumb', 'room-emoji', 's-emoji', 'rimg', 'ci', 'product-emoji', 'select-emoji']) {
      expect(template, className).toMatch(new RegExp(`class="${className}"[^>]*mode="aspectFill"`))
    }
    expect(template).toMatch(/:src="item\.image" mode="aspectFill"/)
    expect(template).toMatch(/:src="selectedProduct\.image" mode="aspectFill"/)
  })

  it('商品卡标签与名称竖排且标签行不预留空高', () => {
    expect(template).toContain('class="tag-row"')
    expect(template).toContain('class="item-title"')
    expect(template).not.toContain('class="product-name-row"')
    expect(styles).not.toMatch(/\.product-tag-row\s*\{[^}]*min-height:\s*23px/s)
    expect(styles).toMatch(/\.product-body\s*\{[^}]*flex-direction:\s*column[^}]*gap:\s*6px/s)
    expect(styles).toMatch(/\.product-body \.item-title\s*\{[^}]*width:\s*100%[^}]*-webkit-line-clamp:\s*2/s)
  })

  it('特产商城使用双列瀑布流并隐藏购买端起订量', () => {
    expect(template).toContain('class="waterfall-grid"')
    expect(template).toContain('class="waterfall-column"')
    expect(template).not.toContain('起订')
    expect(styles).toMatch(/\.waterfall-grid\s*\{[^}]*display:\s*flex/s)
    expect(styles).toMatch(/\.waterfall-column\s*\{[^}]*flex:\s*1/s)
  })

  it('特产商城页头用主题色块，商品卡底行是圆形加购', () => {
    expect(template).toContain('class="mall-hero"')
    expect(template).toContain('class="mall-hero-title">特产商城')
    expect(template).toContain('件在售')
    expect(template).not.toContain('>加购<')
    expect(template).toContain('class="add-btn"')
    expect(template).toContain('<UiIcon name="plus"')
    expect(styles).toMatch(/\.mall-hero\s*\{[^}]*background:\s*var\(--farm-green-deep\)/s)
    expect(styles).not.toMatch(/\.product-open\s*\{[^}]*min-height:\s*132px/s)
    expect(styles).toMatch(/\.product-body \.product-foot\s*\{[^}]*min-height:\s*0/s)
    expect(styles).toMatch(/\.product-body \.product-foot > button\s*\{[^}]*width:\s*32px[^}]*height:\s*32px[^}]*border-radius:\s*50%/s)
    expect(styles).toMatch(/\.product-body \.product-foot > button\s*\{[^}]*background:\s*var\(--farm-green\)/s)
    expect(styles).toMatch(/\.sku-options\s*\{[^}]*flex-wrap:\s*wrap/s)
    expect(styles).toMatch(/\.detail-thumb\s*\{[^}]*width:\s*72px/s)
    expect(styles).toMatch(/\.sheet-line\s*\{[^}]*align-items:\s*stretch/)
    expect(styles).toMatch(/\.sheet-line-main\s*\{[^}]*flex-direction:\s*column/)
    expect(styles).toMatch(/\.sheet-line-foot\s*\{[^}]*margin-top:\s*auto/)
    expect(template).toContain('class="detail-price"')
    expect(template).not.toContain('item.skuName }} · 库存')
    expect(styles).toMatch(/\.product-image\s*\{[^}]*padding-bottom:\s*100%/s)
  })

  it('使用稳定的移动端宽度和安全区布局', () => {
    expect(source).toContain('<style scoped lang="scss" src="../../styles/index-page.scss"></style>')
    expect(styles).toMatch(/\.page-pad\s*\{\s*padding-inline:\s*8px/)
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*hidden/s)
    expect(styles).toMatch(/@media \(min-width:\s*431px\)[\s\S]*?\.app-shell\s*\{[^}]*max-width:\s*430px/s)
    expect(styles).toMatch(/\.tabbar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/s)
    expect(styles).toMatch(/\.tab-page\s*\{[^}]*padding-bottom:[^;}]*env\(safe-area-inset-bottom\)/s)
    expect(styles).toMatch(/\.sheet\s*\{[^}]*max-height:\s*var\(--mobile-sheet-max-height\)/s)
    expect(styles).toMatch(/\.sheet-head\s*\{[^}]*min-height:\s*var\(--mobile-sheet-header-height\)/s)
    expect(styles).toMatch(/\.sheet-head\s*\{[^}]*margin:\s*0 12px/s)
    expect(template).toMatch(/class="empty pc-empty"[\s\S]*购物车还是空的/)
    expect(template).toMatch(/class="record-link" @click="workView = 'bookings'"/)
    expect(template).not.toMatch(/class="record-link" @click="sheet = 'bookings'"/)
    expect(styles).toMatch(/\.cart-count span\s*\{[^}]*border-radius:\s*8px/)
    expect(styles).toMatch(/\.cart-count\s*\{[^}]*overflow:\s*visible/)
    expect(styles).toMatch(/\.cart-count span\s*\{[^}]*top:\s*0/)
    expect(styles).toMatch(/\.cart-count span\s*\{[^}]*z-index:\s*1/)
  })

  it('登录卡在扣除底部导航后的可用区域内居中', () => {
    expect(styles).toMatch(/\.login-prompt\s*\{[^}]*min-height:\s*calc\(100vh\s*-\s*var\(--mobile-tab-height\)[^}]*place-items:\s*center/s)
  })

  it('主交互至少 44px，紧凑次级操作为 40px', () => {
    expect(styles).toMatch(/--farm-touch-primary:\s*44px/)
    expect(styles).toMatch(/--farm-touch-compact:\s*40px/)
    expect(styles).toMatch(/button,\s*uni-button\s*\{[^}]*min-height:\s*var\(--farm-touch-primary\)/s)
    expect(styles).toMatch(/\.compact-action[^}]*min-height:\s*var\(--farm-touch-compact\)/s)
  })

  it('主要卡片、表单和弹层圆角不超过 8px', () => {
    for (const className of ['store-summary', 'food-card', 'room-card', 'room', 'combo', 'product-card', 'member-hero', 'promotion', 'login-prompt-card', 'sheet']) {
      expect(styles, className).toMatch(new RegExp(`\\.${className}\\s*\\{[^}]*border-radius:\\s*(?:6|7|8)px`, 's'))
    }
    expect(styles).toMatch(/\.form-field\s+input[^}]*border-radius:\s*(?:6|7|8)px/s)
    expect(styles).toMatch(/\.sheet-head button[^}]*border-radius:\s*(?:6|7|8)px/s)
    expect(styles).not.toMatch(/\.sheet-head button[^}]*border-radius:\s*50%/s)
  })

  it('长文本容器可收缩且固定栏为正文预留空间', () => {
    for (const className of ['item-title', 'page-sub', 'design-main', 'rec-b', 'sheet-head']) {
      expect(styles, className).toMatch(new RegExp(`\\.${className}[^}]*min-width:\\s*0`, 's'))
    }
    expect(styles).toMatch(/\.tab-page\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*16px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
    expect(styles).toMatch(/\.shop-page\s*\{[^}]*padding-bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*var\(--mobile-action-bar-height\)\s*\+\s*28px\s*\+\s*env\(safe-area-inset-bottom\)\)/s)
  })

  it('核销卡片将金额和操作放到独立行，避免窄屏挤压标题', () => {
    expect(template).toContain('class="verify-item voucher-verify"')
    expect(template).toContain('class="verify-item booking-verify"')
    expect(styles).toMatch(/\.booking-verify\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/s)
    expect(styles).toMatch(/\.booking-verify \.verify-amount\s*\{[^}]*grid-column:\s*2/s)
    expect(styles).toMatch(/\.booking-verify \.verify-btn\s*\{[^}]*grid-column:\s*3/s)
  })

  it('按角色隔离推广中心并在顾客身份下退出经营工作页', () => {
    expect(source).toContain("const canPromote = computed(() => store.role !== 'customer')")
    expect(template).toContain('<view v-if="canPromote" class="promotion">')
    expect(source).toMatch(/function chooseRole\(role: Role\)\s*\{[\s\S]*?if \(role === 'customer'\)[\s\S]*?workView\.value = null/)
  })

  it('工作台和业务按钮使用稳定的居中布局契约', () => {
    expect(styles).toMatch(/button,\s*uni-button\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*text-align:\s*center/s)
    for (const selector of ['.identity-row button', '.choice-row button', '.member-hero .recharge', '.cats button', '.chips button']) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(styles, selector).toMatch(new RegExp(`${escaped}[^}]*justify-content:\\s*center`, 's'))
    }
    expect(styles).not.toMatch(/\.record-link[^}]*justify-content:\s*center/s)
    expect(styles).toMatch(/\.workbench\s*\{[^}]*background:\s*var\(--farm-panel\)/s)
  })

  it('会员中心采用资产卡 + 快捷宫格并移除重复充值', () => {
    expect(template).toContain('class="member-hero pc-hero"')
    expect(template).toContain('class="member-hero-top"')
    expect(template).toContain('class="member-avatar"')
    expect(template).toContain('class="mine-list pc-tile-grid"')
    expect(template).toContain('class="recharge pc-hero-action"')
    expect(template).toContain('class="member-footer pc-footer"')
    expect(template).toMatch(/class="pc-tile pc-tile--[a-z]+"/)
    expect(template).not.toContain('class="recharge-options"')
    expect(template).not.toContain('class="identity-row"')
    expect(styles).toMatch(/\.member-hero\s*\{[^}]*background:\s*linear-gradient/)
    expect(styles).toMatch(/\.mine-list\.pc-tile-grid \.pc-tile\s*\{[^}]*background:\s*transparent/)
  })

  it('会员中心提供独立收货地址入口，宫格标准五列且窄屏三列', () => {
    expect(template).toContain('class="pc-tile-label">收货地址<')
    expect(template).toContain('@click="openAddresses()"')
    expect(styles).toMatch(/\.mine-list\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s)
    expect(styles).toMatch(/@media \(max-width:\s*380px\)[\s\S]*\.mine-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('地址工作页提供列表、表单、地区选择、默认标记和删除确认入口', () => {
    expect(template).toContain("workView === 'addresses'")
    expect(template).toContain('class="address-list"')
    expect(template).toContain('class="address-form"')
    expect(template).toContain('mode="region"')
    expect(template).toContain('class="address-default-tag"')
    expect(template).toContain('@click.stop="setDefaultAddress(address.id)"')
    expect(template).toContain('@click.stop="confirmRemoveAddress(address.id)"')
    expect(source).toMatch(/uni\.showModal\(\{[\s\S]*?title:\s*'删除地址'/)
    expect(template).not.toContain('class="help-row address-edit-row"')
    expect(styles).toMatch(/\.address-card\s*\{[^}]*min-height:\s*44px/s)
    expect(styles).toMatch(/\.address-page-action\s*\{[^}]*padding-bottom:\s*calc\([^}]*env\(safe-area-inset-bottom\)/s)
  })

  it('首个地址直接显示默认状态，选址区与管理操作保持独立语义', () => {
    expect(source).toContain("isDefault: address ? address.isDefault : store.addresses.length === 0")
    expect(template).toContain('首个地址将自动设为默认')
    expect(template).toContain(":role=\"addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 'radiogroup' : undefined\"")
    expect(template).toContain('class="address-card-select"')
    expect(template).toContain(":role=\"addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 'radio' : undefined\"")
    expect(template).toContain(":aria-checked=\"addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? selectedDeliveryAddress?.id === address.id : undefined\"")
    expect(template).toContain(":tabindex=\"addressReturnContext === 'cart' || addressReturnContext === 'checkout' ? 0 : undefined\"")
    expect(template).toContain('@keyup.enter="chooseDeliveryAddress(address)"')
    expect(template).toContain('@keyup.space.prevent="chooseDeliveryAddress(address)"')
    expect(template).not.toMatch(/class="address-card"[^>]*role=/)
    expect(styles).toMatch(/\.default-choice\[disabled\]\s*\{[^}]*opacity:\s*1[^}]*color:\s*var\(--farm-ink\)/s)
    expect(styles).toMatch(/\.address-card-actions button\s*\{[^}]*min-height:\s*var\(--farm-touch-primary\)[^}]*border:\s*0[^}]*background:\s*transparent/s)
  })

  it('快递结算使用可选择的地址卡片，不再使用自由文本地址', () => {
    expect(template).toContain('checkout-address-card')
    expect(template).toContain('@click="openAddresses(\'checkout\')"')
    expect(template).toContain('selectedDeliveryAddress')
    expect(template).not.toContain('v-model="deliveryAddressDraft"')
    expect(source).toContain('addressId: selectedDeliveryAddress.value?.id')
  })

  it('本单地址只从结算入口更新，并在购物车清空、支付或退出后重置', () => {
    expect(source).toMatch(/if \(addressReturnContext\.value === 'cart' \|\| addressReturnContext\.value === 'checkout'\) selectedAddressId\.value = saved\.id/)
    expect(source).toContain('function resetCheckoutDeliveryState()')
    expect(source).toMatch(/watch\(\(\) => store\.cart,[\s\S]*?resetCheckoutDeliveryState\(\)/)
    expect(source).toMatch(/if \(!await store\.checkout[\s\S]*?resetCheckoutDeliveryState\(\)/)
    expect(source).toMatch(/function logout\(\)[\s\S]*?resetCheckoutDeliveryState\(\)/)
  })

  it('购物车按社区团购与快递直发分栏，并按当前分类独立结算', () => {
    expect(source).toContain("const cartCategory = ref<'community' | 'express'>('community')")
    expect(source).toContain('const selectedCartLineKeys = reactive(new Set<string>())')
    expect(source).toContain('const selectedCartItems = computed')
    expect(source).toContain('selectedLines: checkoutLineRefs.value')
    expect(template).toContain('class="cart-category-tabs"')
    expect(template).toContain('社区团购')
    expect(template).toContain('快递直发')
    expect(template).toContain('class="cart-line-check"')
    expect(template).toContain('@click="toggleAllCartLines"')
    expect(template).toContain('checkout-page')
    expect(template).toContain('class="pickup-point-card"')
    expect(source).not.toContain('const cartHasPickupOnly')
    expect(template).toContain('class="cart-fulfillment-tag"')
    expect(styles).toMatch(/\.cart-category-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2/s)
    expect(styles).toMatch(/\.cart-line\s*\{[^}]*grid-template-columns:\s*34px 72px/s)
    expect(styles).toMatch(/\.cart-sheet-foot\s*\{[^}]*justify-content:\s*space-between/s)
    expect(styles).toMatch(/\.checkout-page-foot\s*\{[^}]*position:\s*fixed/s)
  })

  it('规格弹窗展示随 SKU 更新的商品摘要，并保持操作区固定', () => {
    const skuSheetAt = template.indexOf('class="product-detail sku-sheet"')
    const skuSheet = template.slice(skuSheetAt, skuSheetAt + 1800)
    expect(skuSheet).toContain('class="sku-product-summary"')
    expect(skuSheet).toContain(':src="selectedSku?.image || selectedProduct.image"')
    expect(skuSheet).toContain('{{ selectedProduct.name }}')
    expect(skuSheet).toContain('{{ money(selectedSku?.price || selectedProduct.price) }}')
    expect(skuSheet).toContain('库存 {{ selectedSku?.stock || 0 }}')
    expect(skuSheet).toContain('已选：{{ selectedSku?.name || \'暂未选择\' }}')
    expect(source).toMatch(/function openSkuSheet\(product: Product\)[\s\S]*?product\.skus\.find\(\(sku\) => canStartOrder\(sku\)\)/)
    expect(styles).toMatch(/\.sku-product-summary\s*\{[^}]*grid-template-columns:/s)
    expect(template).toContain('class="product-detail-actions sheet-foot"')
    expect(styles).toMatch(/\.sku-product-summary\s*\{[^}]*position:\s*sticky[^}]*background:\s*var\(--farm-cream\)[^}]*box-shadow:/s)
    expect(styles).toMatch(/\.sku-product-summary strong\s*\{[^}]*color:\s*var\(--farm-clay\)/s)
    expect(styles).toMatch(/\.sku-options button\s*\{[^}]*min-height:\s*var\(--farm-touch-primary\)[^}]*flex-direction:\s*column[^}]*align-items:\s*flex-start/s)
    expect(styles).toMatch(/\.sku-options text\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s)
  })

  it('预订和会员页头用主题色块，套餐预订不再挤成三列', () => {
    expect(template).toMatch(/class="mall-hero">[\s\S]*预约预订/)
    expect(template).toMatch(/class="mall-hero">[\s\S]*会员中心/)
    expect(template).toContain('class="pc-login-hero"')
    expect(template).not.toContain('class="login-prompt-icon')
    expect(styles).not.toMatch(/\.login-prompt-icon\s*,/)
    expect(styles).toMatch(/\.login-prompt-body\s*\{[^}]*padding:\s*16px 12px 18px/)
    expect(styles).not.toMatch(/\.login-prompt \.primary-button\s*\{[^}]*max-width:\s*240px/)
    expect(template).not.toMatch(/class="mobile-head">[\s\S]*预约预订/)
    expect(template).not.toMatch(/class="mobile-head">[\s\S]*会员中心/)
    expect(styles).not.toMatch(/\.mobile-head\s*\{/)
    expect(source).not.toMatch(/\.mobile-head,/)
    expect(template).toMatch(/class="cb"[\s\S]*class="cfoot"[\s\S]*class="booknow"/)
    expect(styles).toMatch(/\.combo\s*\{[^}]*align-items:\s*stretch/)
    expect(styles).toMatch(/\.combo \.cb\s*\{[^}]*flex-direction:\s*column/)
    expect(styles).toMatch(/\.combo \.cfoot\s*\{[^}]*margin-top:\s*auto/)
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.combo \.cfoot \{[^}]*flex-wrap:\s*wrap/)
    expect(styles).not.toContain('.recharge-options')
  })

  it('经营页空态用 pc-state-icon，核销完成态用图标', () => {
    const workEmpties = [
      '暂无预订记录',
      '还没有包厢，点击右上角「新增包厢」',
      '还没有菜品，点击右上角「新增菜品」',
      '还没有体验项目',
      '本店暂无店员账号',
      '还没有订单，去商城逛逛吧',
      '还没有预订，去门店逛逛吧',
      '暂无储值流水',
      '暂无招牌土菜，店主可到会员中心→设计招牌土菜添加',
      '暂无包厢，店主可到会员中心→设计特色包厢添加'
    ]
    for (const copy of workEmpties) {
      const at = template.indexOf(copy)
      expect(at, copy).toBeGreaterThan(-1)
      expect(template.slice(Math.max(0, at - 180), at), copy).toContain('class="pc-state-icon"')
    }
    expect(template).not.toContain('class="verify-done">✓<')
    expect(template).not.toContain("item.status === 'cancelled' ? '—' : '✓'")
    expect(template).toContain('class="verify-done"')
    expect(template).toContain('<UiIcon name="check"')
    expect(styles).toMatch(/\.design-item\s*\{[^}]*align-items:\s*stretch/)
    expect(styles).toMatch(/\.design-actions button[\s\S]*?min-height:\s*var\(--farm-touch-compact\)/)
    expect(styles).toMatch(/\.item-title\s*\{[^}]*-webkit-line-clamp:\s*2/)
  })
  it('店铺经营工作台采用图二风格白色圆角卡宫格', () => {
    expect(template).toContain('class="workbench pc-tile-grid"')
    expect(template).toContain('class="pc-tile-icon"')
    expect(template).toContain('class="pc-tile-label">订单核销<')
    expect(template).toContain('class="pc-tile-label">选品上架<')
    expect(styles).toMatch(/\.workbench\.pc-tile-grid \.pc-tile\s*\{[^}]*border-radius:\s*8px/)
  })

  it('短弹层随内容收缩，不再写死 80vh 高度', () => {
    expect(styles).toMatch(/\.sheet-scroll\s*\{[\s\S]*height:\s*auto/)
    expect(styles).toMatch(/\.sheet-scroll\s*\{[\s\S]*max-height:\s*calc\(80vh/)
    expect(styles).not.toMatch(/\.sheet-scroll\s*\{[^}]*(?<!max-)height:\s*calc\(80vh/)
  })

  it('H5 弹层内部滚动节点继承可用高度并为固定操作栏保留末端间距', () => {
    expect(styles).toMatch(/\/\* #ifdef H5 \*\/[\s\S]*\.sheet-scroll :deep\(\.uni-scroll-view\)\s*\{[^}]*height:\s*auto\s*!important[^}]*min-height:\s*0[^}]*max-height:\s*calc\(80vh[^}]*var\(--mobile-action-bar-height\)/s)
    expect(styles).toMatch(/\.sheet-scroll :deep\(\.uni-scroll-view-content\)\s*\{[^}]*padding-bottom:\s*12px[^}]*box-sizing:\s*border-box/s)
  })

  it('超窄屏会员信息保持单行层级，门店评分图标跟随文字首行', () => {
    expect(styles).toMatch(/\.rating \.ui-icon\s*\{[^}]*display:\s*inline-block[^}]*vertical-align:/s)
    expect(styles).toMatch(/@media \(max-width:\s*340px\)[\s\S]*\.member-hero \.lv[\s\S]*white-space:\s*nowrap/)
    expect(styles).toMatch(/@media \(max-width:\s*340px\)[\s\S]*\.member-hero \.recharge[\s\S]*white-space:\s*nowrap/)
    expect(styles).toMatch(/@media \(max-width:\s*340px\)[\s\S]*\.uid[\s\S]*text-overflow:\s*ellipsis/)
  })

  it('工作台不展示说明卡，详情加购只提示不打开购物车', () => {
    expect(template).not.toContain('class="security-note"')
    expect(template).not.toContain('class="policy-hint"')
    expect(styles).toMatch(/\.mall-hero\s*\{[^}]*padding:\s*calc\(12px \+ env\(safe-area-inset-top\)\) 0 16px/)
    expect(styles).toMatch(/\.section-head\s*\{[^}]*padding:\s*22px 8px 10px/)
    expect(styles).toMatch(/\.notice\s*\{[^}]*margin:\s*14px 8px/)
    expect(styles).toMatch(/\.food-list\s*\{[^}]*padding-inline:\s*8px/)
    expect(styles).toMatch(/\.referrer-banner\s*\{[^}]*margin:\s*10px 8px 0/)
    const addSelectedProduct = source.match(/function addSelectedProduct\(\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(addSelectedProduct).toContain("toast('已加入购物车')")
    expect(addSelectedProduct).not.toContain("sheet.value = 'cart'")
  })

  it('菜品行在窄屏改成图文换行，标题省略且登录角色行不压按钮', () => {
    expect(styles).toMatch(/@media \(max-width:\s*375px\)[\s\S]*\.food-detail-list > view[\s\S]*grid-template-areas:\s*"image info"\s+"price action"/)
    expect(styles).toMatch(/\.sheet-head > text\s*\{[\s\S]*text-overflow:\s*ellipsis/)
    expect(styles).toMatch(/\.login-roles button\s*\{[^}]*min-height:\s*var\(--farm-touch-primary\)/)
    expect(styles).toMatch(/\.login-role-help\s*\{[^}]*white-space:\s*normal/)
  })

  it('购物车提交和长表单保存贴在 sheet-foot，标题不再映射废弃页', () => {
    const scrollEnd = template.indexOf('</scroll-view>')
    const afterScroll = template.slice(scrollEnd)
    expect(afterScroll).toContain('class="sheet-foot"')
    expect(afterScroll).toContain('去结算')
    expect(afterScroll).toContain('saveRoomForm')
    expect(afterScroll).toContain('saveFoodForm')
    expect(afterScroll).toContain('saveExperienceForm')
    expect(afterScroll).toContain('confirmStorefrontAfterSale')
    expect(template.slice(0, scrollEnd)).not.toContain('@click="checkout"')
    expect(template).not.toMatch(/sheet === 'orders' \? '我的订单'/)
    expect(template).not.toMatch(/sheet === 'bookings' \? '我的预订'/)
    expect(template).not.toMatch(/sheet === 'ledger' \? '储值明细'/)
    expect(template).not.toMatch(/sheet === 'help' \? '设置与帮助'/)
  })

  it('经营页 sub-head 固定，购物车条跟 tab 高度 token，并删除无入口 identity 模板', () => {
    expect(styles).toMatch(/\.work-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/)
    expect(styles).toMatch(/\.work-body\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/)
    expect(styles).toMatch(/\.cart-bar\s*\{[^}]*bottom:\s*calc\(var\(--mobile-tab-height\)\s*\+\s*8px\s*\+\s*env\(safe-area-inset-bottom\)\)/)
    expect(styles).not.toMatch(/\.cart-bar\s*\{[^}]*bottom:\s*calc\(76px/)
    expect(template).toContain('class="work-body"')
    expect(template).not.toContain('class="identity-sheet"')
    expect(template).toContain("sheet === 'identity' ? '切换身份'")
  })

  it('登录、服务、联系和推广主按钮贴在 sheet-foot', () => {
    const scrollEnd = template.indexOf('</scroll-view>')
    const beforeScroll = template.slice(0, scrollEnd)
    const afterScroll = template.slice(scrollEnd)
    expect(afterScroll).toContain('@click="wechatLogin"')
    expect(afterScroll).toContain('@click="loginAccount()"')
    expect(afterScroll).toContain('@click="submitServiceOrder"')
    expect(afterScroll).toContain('@click="makePhoneCall"')
    expect(afterScroll).toContain('@click="copyStaffPromoLink"')
    expect(afterScroll).toContain('@click="sharePromotion"')
    expect(beforeScroll).not.toContain('@click="wechatLogin"')
    expect(beforeScroll).not.toContain('@click="loginAccount()"')
    expect(beforeScroll).not.toContain('@click="submitServiceOrder"')
    expect(beforeScroll).not.toContain('@click="copyStaffPromoLink"')
    expect(beforeScroll).not.toContain('@click="sharePromotion"')
  })

  it('体验详情用中文类型、去掉状态，非在售不能下单', () => {
    const serviceAt = template.indexOf("sheet === 'service' && selectedService")
    const serviceSlice = template.slice(serviceAt, serviceAt + 1800)
    expect(serviceSlice).toContain("dictCache.label('serviceCategory', selectedService.categoryCode)")
    expect(serviceSlice).not.toContain('selectedService.categoryCode }}')
    expect(serviceSlice).not.toContain('<text>状态</text>')
    expect(source).toMatch(/function submitServiceOrder\(\)[\s\S]*?status !== 'active'/)
    expect(template).toContain(':disabled="selectedService.status !== \'active\'"')
  })

  it('体验和商城共用假支付结算页', () => {
    const scrollEnd = template.indexOf('</scroll-view>')
    const afterScroll = template.slice(scrollEnd)
    expect(template).toContain("sheet === 'pay'")
    expect(template).toContain('微信支付（演示）')
    expect(template).toContain('会员余额')
    expect(afterScroll).toContain('@click="confirmPay"')
    expect(afterScroll).toContain('@click="confirmPay"')
    expect(template).toContain('@click="openCategoryCheckout"')
    expect(template.slice(0, scrollEnd)).not.toContain('@click="openCategoryCheckout"')
    expect(source).toContain("payMethod?: 'balance' | 'wechat'")
  })

  it('订单和预订操作按钮按语义配色', () => {
    expect(template).toContain('action-btn action-btn--primary')
    expect(template).toContain('action-btn action-btn--muted')
    expect(template).toContain('action-btn action-btn--gold')
    expect(template).toContain('action-btn action-btn--danger')
    expect(styles).toMatch(/\.action-btn--primary\s*\{[^}]*background:\s*var\(--farm-green\)/)
    expect(styles).toMatch(/\.action-btn--gold\s*\{[^}]*border:\s*1px solid #d2ae5b/)
    expect(styles).toMatch(/\.action-btn--danger\s*\{[^}]*color:\s*var\(--farm-red\)/)
  })

  it('全屏 loading 和小程序页头避开胶囊', () => {
    expect(source).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.loading,\s*\.state-page \{[\s\S]*padding-right: 96px/)
    expect(source).toMatch(/\/\* #ifdef MP-WEIXIN \*\/[\s\S]*\.login-prompt \{[\s\S]*padding-top: calc\(24px \+ var\(--status-bar-height\)\)/)
  })
})
