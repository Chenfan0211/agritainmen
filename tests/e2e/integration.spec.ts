import { expect, test, type Page } from '@playwright/test'
import { assertFixedLayerWithinViewport, assertNoClippedText, assertNoPageOverflow, monitorPageErrors } from './layout'

const portals = ['admin', 'farmhouse', 'alliance', 'store', 'promoter', 'user', 'supplier']

async function loginUser(page: Page) {
  await page.waitForFunction(() => !!document.querySelector('.auth-btn') || !!document.querySelector('.c-mall'))
  if (await page.locator('.auth-btn').count()) await page.locator('.auth-btn').click()
  await expect(page.locator('.c-mall')).toBeVisible()
}

async function loginSupplier(page: Page, account: string) {
  await expect(page.locator('.login-page')).toBeVisible()
  await page.locator('.login-fields input').nth(0).fill(account)
  await page.locator('.login-fields input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.locator('.tab-item').filter({ hasText: '配送订单' }).click()
}

async function fulfillSupplierOrder(page: Page, platformOrderId: string, trackingNo: string) {
  const card = page.locator('.list-card').filter({ hasText: platformOrderId })
  await expect(card).toHaveCount(1)
  await card.locator('.order-actions uni-button').filter({ hasText: '接单' }).click()
  await card.locator('.order-actions uni-button').filter({ hasText: '快递直发' }).click()
  await page.locator('.courier-sheet input').fill(trackingNo)
  await page.locator('.courier-sheet .primary-button').filter({ hasText: '确认发货' }).click()
  await expect(card).toContainText(trackingNo)
}

async function openPromoterLiveEntry(page: Page) {
  await page.goto('/promoter/')
  if (await page.locator('.login-page').count()) {
    await page.locator('.login-field input').nth(0).fill('13800000000')
    await page.locator('.login-field input').nth(1).fill('123456')
    await page.locator('.login-card .primary-button').click()
  }
  const liveCard = page.locator('.live-card').first()
  await expect(liveCard).toBeVisible()
  const title = (await liveCard.locator('.live-title').textContent())?.trim() || ''
  expect(title).not.toBe('')
  await liveCard.locator('.live-actions uni-button').filter({ hasText: '分享/二维码' }).click()
  const link = (await page.locator('.share-link').textContent())?.trim() || ''
  expect(link).toMatch(/^\/user\/#\/pages\/index\/index\?.*live=/)
  await page.goto(link)
  await loginUser(page)
  await page.locator('.mall-banner').click()
  await expect(page.locator('.live-content')).toContainText(title)
}

async function openAllianceLiveEntry(page: Page) {
  await page.goto('/alliance/')
  await page.locator('.tabbar uni-button').filter({ hasText: /^直播$/ }).click()
  const liveCard = page.locator('.live-card').filter({ hasText: '直播中' }).first()
  await expect(liveCard).toBeVisible()
  const title = (await liveCard.locator('.live-body > uni-text').first().textContent())?.trim() || ''
  expect(title).not.toBe('')
  await liveCard.click()
  await page.locator('.live-detail .primary-button').filter({ hasText: '分享直播赚佣金' }).click()
  if (await page.locator('.login-sheet').count()) {
    await page.locator('.login-fields input').nth(0).fill('13800000000')
    await page.locator('.login-fields input').nth(1).fill('123456')
    await page.locator('.login-submit').click()
  }
  await page.waitForFunction((targetTitle) => {
    const raw = JSON.parse(localStorage.getItem('agritainment-alliance-discovery') || '{}')
    const saved = raw.data || raw
    return saved.state?.promotionRecords?.some((record: { targetType: string; targetName: string; link: string }) => record.targetType === 'live' && record.targetName === targetTitle && record.link.includes('/user/'))
  }, title)
  const link = await page.evaluate((targetTitle) => {
    const raw = JSON.parse(localStorage.getItem('agritainment-alliance-discovery') || '{}')
    const saved = raw.data || raw
    return saved.state.promotionRecords.find((record: { targetType: string; targetName: string }) => record.targetType === 'live' && record.targetName === targetTitle).link as string
  }, title)
  expect(link).toMatch(/^\/user\/#\/pages\/index\/index\?.*live=/)
  await page.goto(link)
  await loginUser(page)
  await page.locator('.mall-banner').click()
  await expect(page.locator('.live-content')).toContainText(title)
}

test('same-origin portal entries and assets stay reachable', async ({ page }) => {
  const monitor = monitorPageErrors(page)
  const failed: string[] = []
  page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`) })
  for (const portal of portals) {
    await page.goto(`/${portal}/`)
    await expect(page.locator('body')).toBeVisible()
    await assertNoPageOverflow(page)
  }
  const missingAsset = await page.request.get('/user/assets/__integration-missing__.js')
  expect(missingAsset.status(), '缺失静态资源不得回退到应用 index.html').toBe(404)
  expect(failed, failed.join('\n')).toEqual([])
  monitor.assertClean()
  monitor.dispose()
})

test('admin, user and two suppliers complete an isolated C-mall fulfillment flow', async ({ page }) => {
  const monitor = monitorPageErrors(page)
  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.admin-shell')).toBeVisible()
  await page.locator('.nav-item').filter({ hasText: '商品库管理' }).click()
  await page.locator('.catalog-filter input').click()
  await page.locator('.catalog-filter input').fill('直播')
  await page.locator('.catalog-filter .store-option').filter({ hasText: '直播商品' }).click()
  await expect(page.locator('.unified-product-grid').first()).toBeVisible()
  await page.locator('.unified-product-grid').nth(1).locator('.row-actions uni-button').filter({ hasText: '编辑' }).click()
  await assertFixedLayerWithinViewport(page.locator('.modal'))
  await assertNoClippedText(page.locator('.modal-actions uni-button:visible'))
  const skuInputs = page.locator('.c-sku-row').first().locator('input')
  await skuInputs.nth(1).fill('48')
  await skuInputs.nth(2).fill('21')
  await skuInputs.nth(3).fill('119')
  await skuInputs.nth(4).fill('11')
  await skuInputs.nth(5).fill('16')
  await page.locator('.modal-actions .button.primary').filter({ hasText: '保存商品' }).click()
  await expect(page.locator('.unified-product-grid').nth(1)).toContainText('¥48')
  await assertNoPageOverflow(page)

  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; productType: string; skus: Array<{ id: string; retailPrice: number }> }> }
    const productIds = new Set(['P007', 'P053', 'P055'])
    const products = catalog.products?.filter((item) => productIds.has(item.id)) || []
    if (products.length !== productIds.size) throw new Error('统一目录缺少直播套餐')
    localStorage.setItem('agritainment-platform-store-catalog-selections', JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      selections: products.map((product) => ({
        storeId: product.id === 'P055' ? 'F002' : 'F001', productId: product.id, listed: true,
        skuRetailPrices: Object.fromEntries(product.skus.map((sku) => [sku.id, sku.retailPrice])), updatedAt: new Date().toISOString()
      }))
    }))
  })

  await openPromoterLiveEntry(page)
  await openAllianceLiveEntry(page)

  await page.goto('/user/#/pages/index/index?promoter=T002&live=L001')
  await loginUser(page)
  await expect(page.locator('.live-content')).toBeVisible()
  await page.locator('.sheet-head uni-button').click()
  await expect(page.locator('.product-card').first().locator('.product-price')).toContainText('48.00')
  await page.locator('.product-card').nth(0).click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.product-card').nth(1).click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await page.locator('.primary-btn').filter({ hasText: '去结算' }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const inputs = page.locator('.address-form input')
  await inputs.nth(0).fill('联调用户')
  await inputs.nth(1).fill('13800000000')
  await inputs.nth(2).fill('湖南省长沙市')
  await inputs.nth(3).fill('同源联调地址 1 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '联调用户' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  const order = page.locator('.order-card').first()
  await expect(order.locator('.sub-order')).toHaveCount(2)
  await order.locator('.primary-small').filter({ hasText: '模拟支付' }).click()
  const supplierOrders = await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}') as Record<string, { id: string; supplierId: string; supplierOrderLink?: { sourceSubOrderId?: string } }>
    return Object.values(orders).filter((item) => item.id.startsWith('C-MALL-')).map((item) => ({ id: item.id, supplierId: item.supplierId, sourceSubOrderId: item.supplierOrderLink?.sourceSubOrderId }))
  })
  expect(supplierOrders).toHaveLength(2)
  const supplierA = supplierOrders.find((item) => item.supplierId === 'S002')!
  const supplierB = supplierOrders.find((item) => item.supplierId === 'S004')!
  expect(supplierA.sourceSubOrderId).toBeTruthy()
  expect(supplierB.sourceSubOrderId).toBeTruthy()

  await page.goto('/supplier/')
  await loginSupplier(page, 'supplier')
  await expect(page.locator('.list-card').filter({ hasText: supplierB.id })).toHaveCount(0)
  await fulfillSupplierOrder(page, supplierA.id, 'SF-INTEGRATION-A')
  await page.locator('.hero-logout').click()
  await loginSupplier(page, 'supplier04')
  await expect(page.locator('.list-card').filter({ hasText: supplierA.id })).toHaveCount(0)
  await fulfillSupplierOrder(page, supplierB.id, 'SF-INTEGRATION-B')
  await assertNoPageOverflow(page)
  await assertNoClippedText(page.locator('.order-actions uni-button:visible'))

  await page.goto('/user/')
  await loginUser(page)
  await page.locator('.tab-item').filter({ hasText: /^我的订单$/ }).click()
  const refreshedOrder = page.locator('.order-card').first()
  const subA = refreshedOrder.locator('.sub-order').filter({ hasText: 'SF-INTEGRATION-A' })
  const subB = refreshedOrder.locator('.sub-order').filter({ hasText: 'SF-INTEGRATION-B' })
  await expect(subA).toHaveCount(1)
  await expect(subB).toHaveCount(1)
  await subA.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('快递配送')
  await expect(page.locator('.logistics-content')).toContainText('SF-INTEGRATION-A')
  await page.locator('.sheet-head uni-button').click({ force: true })
  await subB.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('快递配送')
  await expect(page.locator('.logistics-content')).toContainText('SF-INTEGRATION-B')
  await page.locator('.sheet-head uni-button').click({ force: true })
  await subA.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await subB.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await expect(refreshedOrder).toContainText('已收货')
  const commissionsBeforeAfterSale = await page.evaluate(({ subAId, subBId }) => {
    const records = JSON.parse(localStorage.getItem('agritainment-platform-c-commissions') || '[]') as Array<{ id: string; subOrderId: string; status: string; amount: number }>
    return { a: records.filter((item) => item.subOrderId === subAId), b: records.filter((item) => item.subOrderId === subBId) }
  }, { subAId: supplierA.sourceSubOrderId!, subBId: supplierB.sourceSubOrderId! })
  expect(commissionsBeforeAfterSale.a.length).toBeGreaterThan(0)
  expect(commissionsBeforeAfterSale.b.length).toBeGreaterThan(0)
  expect(commissionsBeforeAfterSale.b.every((item) => item.status === 'available')).toBe(true)
  await subA.locator('.outline-small').filter({ hasText: '申请售后' }).click()
  await expect(subA).toContainText('售后处理中')
  await expect(subB).toContainText('已收货')
  const commissionsAfterSale = await page.evaluate(({ subAId, subBId }) => {
    const records = JSON.parse(localStorage.getItem('agritainment-platform-c-commissions') || '[]') as Array<{ id: string; subOrderId: string; status: string; amount: number }>
    return { a: records.filter((item) => item.subOrderId === subAId), b: records.filter((item) => item.subOrderId === subBId) }
  }, { subAId: supplierA.sourceSubOrderId!, subBId: supplierB.sourceSubOrderId! })
  expect(commissionsAfterSale.a.every((item) => item.status === 'reversed')).toBe(true)
  expect(commissionsAfterSale.b).toEqual(commissionsBeforeAfterSale.b)
  await assertNoPageOverflow(page)
  await assertFixedLayerWithinViewport(page.locator('.bottom-tabs'))
  await assertNoClippedText(page.locator('.sub-actions uni-button:visible'))
  monitor.assertClean()
  monitor.dispose()
})

test('all-channel product shares one SKU stock across farmhouse, ordering and user sales', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '跨端库存主流程仅需执行一次')
  const productName = '同源共享库存商品'

  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.nav-item').filter({ hasText: '商品库管理' }).click()
  await page.locator('.head-actions .button.primary').filter({ hasText: '新增商品' }).click()
  const catalogModal = page.locator('.catalog-product-modal')
  await catalogModal.locator('.field').filter({ hasText: '商品名称' }).locator('input').fill(productName)
  await catalogModal.locator('.field').filter({ hasText: '商品渠道' }).locator('select').selectOption('all')
  await catalogModal.locator('.field').filter({ hasText: '快递直发' }).locator('select').selectOption({ label: '支持' })
  await catalogModal.locator('.field').filter({ hasText: '供应商' }).locator('select').selectOption({ index: 1 })
  const skuInputs = catalogModal.locator('.c-sku-row').first().locator('input')
  await skuInputs.nth(1).fill('100')
  await skuInputs.nth(2).fill('60')
  await skuInputs.nth(3).fill('6')
  await skuInputs.nth(4).fill('10')
  await skuInputs.nth(5).fill('15')
  await catalogModal.locator('.modal-actions .button.primary').filter({ hasText: '保存商品' }).click()

  const catalogItem = await page.evaluate((name) => {
    const state = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    const product = state.products?.find((item: { name: string }) => item.name === name)
    return product ? { productId: product.id, skuId: product.skus[0].id, revision: state.revision } : null
  }, productName)
  expect(catalogItem).toBeTruthy()

  const stockOf = () => page.evaluate(({ productId, skuId }) => {
    const state = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    return state.products.find((item: { id: string }) => item.id === productId)?.skus.find((sku: { id: string }) => sku.id === skuId)?.stock
  }, catalogItem!)
  expect(await stockOf()).toBe(6)

  await page.goto('/farmhouse/')
  await page.locator('.tabbar uni-button').filter({ hasText: '会员' }).click()
  await page.locator('.login-prompt .primary-button').click()
  await page.locator('.login-roles uni-button').filter({ hasText: '店长' }).click()
  const farmhouseLogin = page.locator('.login-sheet')
  await farmhouseLogin.locator('input').nth(0).fill('13800000001')
  await farmhouseLogin.locator('input').nth(1).fill('123456')
  await farmhouseLogin.locator('.primary-button').filter({ hasText: '登 录' }).click()
  await page.locator('.workbench uni-button').filter({ hasText: '选品上架' }).click()
  await page.locator('.list-search input').fill(productName)
  const selection = page.locator('.select-item').filter({ hasText: productName })
  await selection.locator('.si-btn').click()
  await page.locator('.sub-head .icon-button').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()
  const farmhouseProduct = page.locator('.product-card').filter({ hasText: productName })
  await farmhouseProduct.locator('.product-body uni-button').last().click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去结算' }).click()
  await page.locator('.sheet-list .primary-button').filter({ hasText: '提交订单' }).click()
  expect(await stockOf()).toBe(5)

  await page.goto('/store/')
  await page.locator('.login-fields input').nth(0).fill('13800000000')
  await page.locator('.login-fields input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.search-bar input').fill(productName)
  const orderingProduct = page.locator('.product-card').filter({ hasText: productName })
  await orderingProduct.locator('.product-foot uni-button').click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去下单' }).click()
  await page.locator('.sheet-list .primary-button').filter({ hasText: '确认下单' }).click()
  await page.locator('.checkout-form .primary-button').filter({ hasText: '提交订单' }).click()
  expect(await stockOf()).toBe(4)

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await loginUser(page)
  await page.locator('.search-input input').fill(productName)
  await page.locator('.product-card').filter({ hasText: productName }).click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await page.locator('.primary-btn').filter({ hasText: '去结算' }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const addressInputs = page.locator('.address-form input')
  await addressInputs.nth(0).fill('共享库存用户')
  await addressInputs.nth(1).fill('13800000000')
  await addressInputs.nth(2).fill('湖南省长沙市')
  await addressInputs.nth(3).fill('同源库存测试地址')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '共享库存用户' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  expect(await stockOf()).toBe(3)
})
