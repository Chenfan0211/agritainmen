import { expect, test, type Page } from '@playwright/test'

async function adminLogin(page: Page) {
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.admin-shell')).toBeVisible()
}

async function storeLogin(page: Page) {
  await page.locator('.login-field input').nth(0).fill('13800000001')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
}

async function farmhouseLogin(page: Page) {
  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.login-prompt .primary-button').click()
  await page.locator('.login-sheet .primary-button').click()
  await expect(page.locator('.member-hero')).toBeVisible()
  await page.locator('.tabbar uni-button').nth(0).click()
}

async function farmhouseSeedSelection(page: Page, count: number, filterText?: string) {
  await page.evaluate(({ count, filterText }) => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; name: string; category: string; skus: Array<{ id: string; retailPrice: number }> }> }
    const selected = (catalog.products || []).filter((product) => !filterText || product.name.includes(filterText) || product.category.includes(filterText)).slice(0, count)
    if (!selected.length) throw new Error('统一目录缺少可上架商品')
    localStorage.setItem('agritainment-platform-store-catalog-selections', JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      selections: selected.map((product) => ({
        storeId: 'F001', productId: product.id, listed: true,
        skuRetailPrices: Object.fromEntries(product.skus.map((sku) => [sku.id, sku.retailPrice])), updatedAt: new Date().toISOString()
      }))
    }))
  }, { count, filterText })
  await page.reload()
}

test('admin buttons open data surfaces and keep overflow local', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('http://127.0.0.1:8791')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await adminLogin(page)

  await page.locator('.top-actions uni-button').last().click()
  await expect(page.locator('.drawer')).toContainText('待办中心')
  await page.locator('.drawer-head .icon-button').click()

  await page.locator('.nav-item', { hasText: '订单履约' }).click()
  await page.locator('.row-actions uni-button', { hasText: '发货' }).first().click()
  await expect(page.locator('.row-actions uni-button', { hasText: '流转' }).first()).toBeVisible()
  await page.locator('.row-actions uni-button', { hasText: '流转' }).first().click()
  await expect(page.locator('.drawer')).toContainText('订单流转记录')
  await expect(page.locator('.drawer')).toContainText('admin')
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1024)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('farmhouse buttons filter data and open persisted records', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8792')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await farmhouseSeedSelection(page, 2, '套餐')
  await farmhouseLogin(page)

  await page.locator('.tabbar uni-button').nth(2).click()
  await page.locator('.chips uni-button', { hasText: '套餐券' }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.mine-list uni-button', { hasText: '储值记录' }).click()
  await expect(page.locator('.ledger-list')).toContainText('会员储值充值')
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 430, height: 932 })
  await page.reload()
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(430)
})

test('admin filters, edits products and batches pending shipments', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:8791')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await adminLogin(page)

  await page.locator('.nav-item', { hasText: '商品库管理' }).click()
  await page.locator('.row-actions uni-button', { hasText: '编辑' }).first().click()
  await expect(page.locator('.catalog-product-modal .c-sku-row input').first()).toHaveValue('500g')
  await page.locator('.catalog-product-modal .c-sku-row input[type="number"]').first().fill('66')
  const supplierSelect = page.locator('.catalog-product-modal .field', { hasText: '供应商' }).locator('.searchable-select')
  await supplierSelect.locator('.searchable-select__trigger').click()
  await page.locator('.searchable-select__search input').fill('武陵')
  await page.locator('.searchable-select__option', { hasText: '武陵蜂业专业合作社' }).click()
  await page.locator('.modal-actions uni-button', { hasText: '保存' }).click()
  await expect(page.locator('.unified-product-grid').nth(1)).toContainText('¥66')

  await page.locator('.nav-item', { hasText: '订单履约' }).click()
  await page.locator('.order-select').first().click()
  await page.locator('.module-toolbar uni-button', { hasText: '批量发货' }).click()
  await expect(page.locator('.order-grid').nth(1)).toContainText('已发货')

  await page.locator('.nav-item', { hasText: '售后结算' }).click()
  await page.locator('.data-panel .search-box input').fill('不存在的工单')
  await expect(page.locator('.empty-state')).toContainText('没有符合条件的售后工单')
})

test('farmhouse preserves reservation type, checks out and confirms recharge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8792')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await farmhouseSeedSelection(page, 3)
  await farmhouseLogin(page)

  await page.locator('.quick-grid uni-button', { hasText: '套餐预订' }).click()
  await expect(page.locator('.combo').first()).toContainText('四人欢聚套餐')
  await page.locator('.combo').first().locator('uni-button', { hasText: '预订' }).click()
  await page.locator('.booking-sheet uni-button', { hasText: '确认预订' }).click()
  await expect(page.locator('.records')).toContainText('四人欢聚套餐')
  await page.locator('.sub-head .icon-button').click()

  await page.locator('.tabbar uni-button').nth(2).click()
  await page.locator('.product-body uni-button').first().click()
  await expect(page.locator('.product-detail')).toBeVisible()
  await page.locator('.sku-options uni-button').first().click()
  await page.locator('.product-detail-actions uni-button', { hasText: '加入购物车' }).click()
  await page.locator('.checkout-summary uni-button', { hasText: '提交订单' }).click()
  await expect(page.locator('.records')).toContainText('待发货')
  await page.locator('.sub-head .icon-button').click()

  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.member-hero .recharge').click()
  await expect(page.locator('.recharge-confirm')).toContainText('储值享 9 折')
  await page.locator('.recharge-confirm .ui-chips uni-button').nth(1).click()
  await page.locator('.recharge-confirm .primary-button').click()
  await expect(page.locator('.ledger-list')).toContainText('会员储值充值')
})

test('admin supplier settlement is idempotent and after-sales has two stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:8791')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await adminLogin(page)

  await page.locator('.nav-item', { hasText: '佣金结算' }).click()
  await page.locator('.head-actions uni-button', { hasText: '供应商结算' }).click()
  await page.getByText('OK', { exact: true }).click()
  await page.locator('.commission-filter-tabs uni-button', { hasText: '供应商结算' }).click()
  await expect(page.locator('.settlement-history').filter({ hasText: '供应商结算记录' })).toContainText(/笔订单/)
  await expect(page.locator('.settlement-history').filter({ hasText: '供应商结算记录' })).toContainText('武陵蜂业专业合作社')
  const records = await page.locator('.settlement-history').filter({ hasText: '供应商结算记录' }).locator('.history-row').count()
  await page.locator('.head-actions uni-button', { hasText: '供应商结算' }).click()
  await page.getByText('OK', { exact: true }).click()
  await expect(page.locator('.settlement-history').filter({ hasText: '供应商结算记录' }).locator('.history-row')).toHaveCount(records)

  await page.locator('.nav-item', { hasText: '售后结算' }).click()
  const pendingRow = page.locator('.after-grid', { hasText: 'SH20582' }).last()
  await pendingRow.locator('uni-button', { hasText: '同意退款' }).click()
  await page.getByText('OK', { exact: true }).click()
  await expect(pendingRow).toContainText('待退款')
  await expect(pendingRow).toContainText('等待退款回执')
  await expect(pendingRow.locator('uni-button', { hasText: '确认退款' })).toHaveCount(0)
  await expect(pendingRow.locator('uni-button', { hasText: '执行退款' })).toBeVisible()
  await expect(pendingRow.locator('uni-button', { hasText: '退款失败' })).toHaveCount(0)
  await page.locator('.after-grid', { hasText: 'SH20561' }).last().locator('uni-button', { hasText: '记录' }).click()
  await expect(page.locator('.drawer')).toContainText('售后处理记录')
})

test('admin retries a provider-rejected refund after refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:8791')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await adminLogin(page)

  await page.evaluate(() => {
    const catalogKey = 'agritainment-platform-catalog'
    const cOrdersKey = 'agritainment-platform-c-orders'
    const commissionsKey = 'agritainment-platform-c-commissions'
    const ordersKey = 'agritainment-platform-orders'
    const afterSalesKey = 'agritainment-platform-after-sales'
    const product = {
      id: 'P-E2E-REFUND-RETRY', name: '退款重试商品', category: '测试品类',
      supplierId: 'S001', supplierName: '靖州杨梅专业合作社', source: 'platform', status: 'active',
      image: '/static/images/product-meat.webp', images: [], tags: ['退款测试'], productType: 'goods',
      expressDelivery: true, channel: 'all', farmIds: [], promoterCommissionRate: 10, storeCommissionRate: 5,
      skus: [{ id: 'SKU-E2E-REFUND-RETRY', name: '默认规格', image: '/static/images/product-meat.webp', retailPrice: 88, cost: 60, stock: 9, level1Amount: 10, level2Amount: 0, status: 'active' }]
    }
    localStorage.setItem(catalogKey, JSON.stringify({ schemaVersion: 2, revision: 0, products: [product], appliedOperations: {} }))
    const sku = product.skus[0]
    const item = { productId: product.id, skuId: sku.id, name: product.name, skuName: sku.name, image: product.image, quantity: 1, unitPrice: sku.retailPrice, basePrice: sku.cost, level1Commission: 10, level2Commission: 0, supplierId: product.supplierId }
    const subOrder = { id: 'CSO-E2E-REFUND-RETRY', supplierId: product.supplierId, supplierName: product.supplierName, items: [item], amount: sku.retailPrice, status: 'after_sale', logistics: [], inventoryReleased: false, afterSale: { id: 'CAS-E2E-REFUND-RETRY', reason: '质量问题', status: 'processing', createdAt: '2026-08-31T08:00:00.000Z' } }
    const commission = { id: 'CC-E2E-REFUND-RETRY', orderId: 'CO-E2E-REFUND-RETRY', subOrderId: subOrder.id, beneficiaryId: 'T001', beneficiaryLevel: 'level1', amount: 10, status: 'available', createdAt: '2026-08-31T08:00:00.000Z' }
    const cOrder = { id: 'CO-E2E-REFUND-RETRY', userId: 'U-E2E-REFUND-RETRY', level: 'normal', address: { id: 'ADDR-E2E-REFUND-RETRY', userId: 'U-E2E-REFUND-RETRY', receiver: '退款用户', phone: '13800000000', region: '湖南', detail: '联调地址', isDefault: true }, amount: subOrder.amount, items: [item], subOrders: [subOrder], commissionAllocations: [commission], status: 'after_sale', createdAt: '2026-08-31T08:00:00.000Z', paidAt: '2026-08-31T08:01:00.000Z', providerTransactionId: 'PAY-E2E-REFUND-RETRY' }
    const supplierOrder = { id: 'C-MALL-E2E-REFUND-RETRY', productName: product.name, customer: '退款用户', amount: subOrder.amount, status: 'after-sale', createdAt: '2026-08-31T08:00:00.000Z', supplierId: product.supplierId, sourceOrderId: cOrder.id, flow: [] }
    const work = { id: 'AS-E2E-REFUND-RETRY', orderId: cOrder.id, masterOrderId: cOrder.id, subOrderId: subOrder.id, supplierOrderId: supplierOrder.id, operationId: `after-sale:${subOrder.id}`, productName: product.name, applicant: '退款用户', type: 'refund', amount: subOrder.amount, refundAmount: subOrder.amount, status: 'refund-failed', issue: '质量问题', failureReason: '原支付渠道拒绝退款', history: [{ time: '2026-08-31T08:02:00.000Z', action: '退款失败：原支付渠道拒绝退款', operator: '运营管理员' }] }
    localStorage.setItem(cOrdersKey, JSON.stringify({ [cOrder.id]: cOrder }))
    localStorage.setItem(commissionsKey, JSON.stringify([commission]))
    localStorage.setItem(ordersKey, JSON.stringify({ ...(JSON.parse(localStorage.getItem(ordersKey) || '{}')), [supplierOrder.id]: supplierOrder }))
    localStorage.setItem(afterSalesKey, JSON.stringify({ ...(JSON.parse(localStorage.getItem(afterSalesKey) || '{}')), [work.id]: work }))
  })
  await page.reload()
  await page.locator('.nav-item', { hasText: '售后结算' }).click()

  const failedRow = page.locator('.after-grid', { hasText: 'AS-E2E-REFUND-RETRY' }).last()
  await expect(failedRow).toContainText('原支付渠道拒绝退款')
  await failedRow.locator('uni-button', { hasText: '重试退款' }).click()
  await page.getByText('OK', { exact: true }).click()
  await expect(failedRow).toContainText('已退款')
  await expect(failedRow.locator('uni-button', { hasText: '记录' })).toBeVisible()

  await page.reload()
  await page.locator('.nav-item', { hasText: '售后结算' }).click()
  await expect(page.locator('.after-grid', { hasText: 'AS-E2E-REFUND-RETRY' }).last()).toContainText('已退款')
})

test('farmhouse multi-SKU order keeps details and can be repurchased', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8792')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await farmhouseSeedSelection(page, 3)
  await farmhouseLogin(page)
  await page.locator('.tabbar uni-button').nth(2).click()
  await page.locator('.product-body uni-button').first().click()
  await page.locator('.sku-options uni-button').first().click()
  await page.locator('.product-detail-actions uni-button', { hasText: '加入购物车' }).click()
  await page.locator('.checkout-summary uni-button', { hasText: '提交订单' }).click()
  await expect(page.locator('.records')).toContainText('500g')
  await page.locator('.records uni-button', { hasText: '再次购买' }).first().click()
  await expect(page.locator('.sheet-list')).toContainText('500g')
})

test('manager verifies a booking and designs a signature dish', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8792')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await farmhouseLogin(page)
  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.roles uni-button', { hasText: '店长' }).click()

  // 店长工作台：订单核销 + 设计包厢/土菜 + 选品上架
  await expect(page.locator('.workbench uni-button', { hasText: '订单核销' })).toBeVisible()
  await expect(page.locator('.workbench uni-button', { hasText: '设计特色包厢' })).toBeVisible()
  await expect(page.locator('.workbench uni-button', { hasText: '设计招牌土菜' })).toBeVisible()
  await expect(page.locator('.workbench uni-button', { hasText: '选品上架' })).toBeVisible()
  await expect(page.locator('.workbench uni-button', { hasText: '进货补货' })).toHaveCount(0)

  // 核销一笔已确认预订
  await page.locator('.workbench uni-button', { hasText: '订单核销' }).click()
  await expect(page.locator('.verify-list')).toContainText('观溪雅间')
  await page.locator('.verify-amount input').first().fill('328')
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('核销预订')
    await dialog.accept()
  })
  await page.locator('.verify-btn').first().click()
  await expect(page.locator('.verify-status.ok').first()).toContainText('已核销')
  await page.locator('.sub-head .icon-button').click()

  // 设计招牌土菜：新增一道菜
  await page.locator('.workbench uni-button', { hasText: '设计招牌土菜' }).click()
  await page.locator('.sub-head .text-button', { hasText: '新增菜品' }).click()
  await page.locator('.design-form .form-field input').nth(0).fill('秘制辣子鸡')
  await page.locator('.design-form .form-field input').nth(1).fill('农家自养土鸡 · 香辣过瘾')
  await page.locator('.design-form .form-field input').nth(2).fill('68')
  await page.locator('.design-form .primary-button').click()
  await expect(page.locator('.design-list')).toContainText('秘制辣子鸡')
})

test('empty mock scenario ignores persisted business data in all apps', async ({ page }) => {
  await page.goto('http://127.0.0.1:8791')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await adminLogin(page)
  await expect(page.locator('.kpi-card').nth(2)).toContainText('合作供应商')
  await expect(page.locator('.kpi-card').nth(2)).not.toContainText('0 家')
  await page.goto('http://127.0.0.1:8791?mock=empty')
  await page.locator('.nav-item', { hasText: '供应商管理' }).click()
  await expect(page.locator('.empty-state')).toContainText('没有符合条件的供应商')

  await page.goto('http://127.0.0.1:8792')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.product-card')).toHaveCount(0)
  await page.goto('http://127.0.0.1:8792?mock=empty')
  await page.locator('.tabbar uni-button').nth(2).click()
  await expect(page.locator('.empty-page')).toContainText('没有找到相关商品')

})

test('yunshang tenant build isolates brand, farm data and theme', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('http://127.0.0.1:8794')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.hero-title')).toContainText('云上人家山景农庄')
  await expect(page.locator('.store-summary')).toContainText('山景民宿')
  await page.locator('.tabbar uni-button').nth(2).click()
  await expect(page.locator('.product-card', { hasText: '武陵山野生土蜂蜜' })).toHaveCount(1)
  await expect(page.locator('.product-card', { hasText: '农家四人欢聚套餐券' })).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--farm-green').trim())).toBe('#355d4a')
})

test('store orders supply products and tracks order status', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8795')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await storeLogin(page)

  // 商城分类数量角标
  await expect(page.locator('.chips uni-button', { hasText: /^全部\d+$/ })).toContainText('76')
  await expect(page.locator('.chips uni-button', { hasText: /^土特产\d+$/ })).toContainText('11')
  await expect(page.locator('.chips uni-button', { hasText: /^生鲜农产\d+$/ })).toContainText('5')

  // 商城分类筛选 + 搜索
  await page.locator('.chips uni-button', { hasText: /^伴手礼\d+$/ }).click()
  await expect(page.locator('.product-card')).toHaveCount(8)
  await expect(page.locator('.result-count')).toContainText('共 8 款商品')
  await page.locator('.search-bar input').fill('蜂蜜')
  await expect(page.locator('.empty-page')).toContainText('没有找到相关商品')
  await page.locator('.search-bar input').fill('')
  await page.locator('.chips uni-button', { hasText: '全部' }).click()

  // 按商品名选择两个单规格商品，避免瀑布流分列改变 DOM 顺序。
  await page.locator('.product-card', { hasText: '商用保鲜膜 300米' }).locator('.product-foot uni-button').click()
  await page.locator('.product-card', { hasText: '古丈蒿子粑粑 6个装' }).locator('.product-foot uni-button').click()
  await expect(page.locator('.cart-bar')).toContainText('2')

  // 提交订单
  await page.locator('.cart-bar uni-button').last().click()
  await page.locator('.checkout-summary uni-button', { hasText: '确认下单' }).click()
  await page.locator('.checkout-form textarea').fill('请周三前送达')
  await page.locator('.checkout-form uni-button', { hasText: '提交订单' }).click()
  await expect(page.locator('.order-detail-head')).toContainText('待接单')

  // 推进状态 → 待发货
  await page.locator('.order-actions uni-button', { hasText: '推进状态' }).click()
  await expect(page.locator('.order-detail-head')).toContainText('待发货')
  await page.locator('.sheet-head uni-button').click()

  // 订单列表 + 详情物流轨迹
  await expect(page.locator('.order-card').first()).toContainText('待发货')
  await page.locator('.order-card').first().click()
  await expect(page.locator('.logistics')).toContainText('中台已接单')
  await page.locator('.sheet-head uni-button').click()

  // 页面无横向溢出
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 430, height: 932 })
  await page.reload()
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(430)
})
test('store workbench surfaces data, cart stepping, repeat order and contact sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:8795')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await storeLogin(page)

  // 商城运营数据条 + 订单汇总数据
  await expect(page.locator('.shop-metrics')).toContainText('在售商品')
  await expect(page.locator('.shop-metrics')).toContainText('可订商品')

  // 门店工作台：统计卡数据 + 快捷入口摘要
  await page.locator('.tabbar uni-button').nth(2).click()
  await expect(page.locator('.store-metrics')).toContainText('本月进货额')
  await expect(page.locator('.store-metrics')).toContainText('累计节省')
  await expect(page.locator('.quick-grid uni-button', { hasText: '去订货' })).toContainText('可订')
  await expect(page.locator('.quick-grid uni-button', { hasText: '我的订单' })).toContainText('待收货')

  // 收货地址弹层
  await page.locator('.quick-grid uni-button', { hasText: '收货地址' }).click()
  await expect(page.locator('.address-card')).toContainText('石板溪农家乐·门店')
  await expect(page.locator('.address-card')).toContainText('王店长')
  await page.locator('.sheet-head uni-button').click()

  // 联系客服弹层（数据 + 复制电话）
  await page.locator('.quick-grid uni-button', { hasText: '联系客服' }).click()
  await expect(page.locator('.contact-rows')).toContainText('0743-888-xxxx')
  await expect(page.locator('.contact-rows')).toContainText('09:00')
  await page.locator('.contact-actions .outline-button').click()
  await page.locator('.sheet-head uni-button').click()

  // 订单汇总 + 各状态筛选均有数据
  await page.locator('.tabbar uni-button').nth(1).click()
  await expect(page.locator('.order-summary')).toContainText('共 15 单')
  await page.locator('.order-chips uni-button', { hasText: '已完成' }).click()
  await expect(page.locator('.order-card').first()).toContainText('已完成')
  await page.locator('.order-chips uni-button', { hasText: '待接单' }).click()
  await expect(page.locator('.order-card').first()).toContainText('待接单')
  await page.locator('.order-chips uni-button', { hasText: '全部' }).click()

  // 商城：多规格商品详情 + 购物车步进合计变化
  await page.locator('.tabbar uni-button').nth(0).click()
  await page.locator('.product-card .product-foot uni-button').nth(0).click()
  await expect(page.locator('.sku-options')).toContainText('500g')
  await expect(page.locator('.sku-options')).toContainText('1kg家庭装')
  await page.locator('.sku-options uni-button').first().click()
  await page.locator('.product-detail-actions uni-button', { hasText: '加入进货单' }).click()
  await page.locator('.sheet-line .stepper uni-button').last().click()
  await expect(page.locator('.checkout-summary')).toContainText('¥76')

  // 提交订单 → 订单详情
  await page.locator('.checkout-summary uni-button', { hasText: '确认下单' }).click()
  await page.locator('.checkout-form uni-button', { hasText: '提交订单' }).click()
  await expect(page.locator('.order-detail-head')).toContainText('待接单')
  await page.locator('.sheet-head uni-button').click()

  // 订单状态筛选
  await page.locator('.order-chips uni-button', { hasText: '待接单' }).click()
  await expect(page.locator('.order-card').first()).toContainText('待接单')

  // 再次下单回填购物车
  await page.locator('.order-card').first().click()
  await page.locator('.order-actions .outline-button', { hasText: '再次下单' }).click()
  await expect(page.locator('.sheet-head')).toContainText('进货单')
  await page.locator('.sheet-head uni-button').click()

  // 页面无横向溢出
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
})
