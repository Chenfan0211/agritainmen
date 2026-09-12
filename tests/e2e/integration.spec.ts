import { expect, test, type Page } from '@playwright/test'
import { assertFixedLayerWithinViewport, assertNoClippedText, assertNoPageOverflow, assertReadableText, monitorPageErrors } from './layout'


const portals = ['admin', 'dashboard', 'farmhouse', 'store', 'promoter', 'user', 'supplier']

async function loginUser(page: Page) {
  await page.evaluate(() => localStorage.setItem('agritainment-user-demo-orders-disabled', '1'))
  await page.waitForFunction(() => !!document.querySelector('.auth-btn') || !!document.querySelector('.c-mall'))
  if (await page.locator('.auth-btn').count()) await page.locator('.auth-btn').click()
  await expect(page.locator('.c-mall')).toBeVisible()
  await expect(page.locator('.bottom-tabs')).toBeVisible()
}

async function clickUserWithdrawal(page: Page) {
  await page.locator('.operations-grid').getByText('我的收入', { exact: true }).click()
  await expect(page.locator('[data-operation-view="income"]')).toBeVisible()
  await expect(page.locator('.income-hero uni-button')).toBeVisible()
  await page.locator('.income-hero uni-button').click()
  await page.locator('.operation-header [aria-label="返回"]').click()
  await expect(page.locator('.me-page')).toBeVisible()
}

async function openUserOrders(page: Page) {
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.order-entry').click()
  await expect(page.locator('.orders-page')).toBeVisible()
}

async function loginAdmin(page: Page) {
  await page.goto('/admin/')
  await page.waitForFunction(() => !!document.querySelector('.login-field') || !!document.querySelector('.admin-shell'))
  if (await page.locator('.login-field input').count()) {
    await expect(page.locator('.login-page')).toBeVisible()
    await page.locator('.login-field input').nth(0).fill('admin')
    await page.locator('.login-field input').nth(1).fill('123456')
    await page.locator('.login-button').click()
  }
  await expect(page.locator('.admin-shell')).toBeVisible()
}

async function submitSupplierLogin(page: Page, account: string, password = account) {
  const inputs = page.locator('.login-fields input')
  await inputs.nth(0).fill(account)
  await inputs.nth(0).blur()
  await inputs.nth(1).fill(password)
  await inputs.nth(1).blur()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.locator('.login-button').click()
}

async function loginSupplier(page: Page, account: string, password = account) {
  await expect(page.locator('.login-page')).toBeVisible()
  await submitSupplierLogin(page, account, password)
  await expect(page.locator('.app-shell')).toBeVisible()
}

async function loginSupplierRole(page: Page, role: 'supplier' | 'driver', account: string, password: string) {
  await page.goto('/supplier/')
  await expect(page.locator('.login-page')).toBeVisible()
  await page.locator('.role-tabs uni-button').filter({ hasText: role === 'supplier' ? '供应商' : '司机' }).click()
  await submitSupplierLogin(page, account, password)
  await expect(page.locator('.app-shell')).toBeVisible()
}

async function openSupplierDriverManagement(page: Page) {
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.work-link').filter({ hasText: '司机管理' }).click()
  await expect(page.locator('.secondary-head')).toContainText('司机管理')
}

async function setDriverScope(page: Page, driverName: string, storeNames: string[]) {
  const card = page.locator('.secondary-workspace .list-card').filter({ hasText: driverName })
  await expect(card).toHaveCount(1)
  const labels = (await card.locator('.scope-editor .chip').allTextContents()).map((label) => label.trim())
  for (const label of labels) {
    const chip = card.locator('.scope-editor .chip').filter({ hasText: label })
    const shouldBeActive = storeNames.includes(label)
    const isActive = await chip.evaluate((element) => element.classList.contains('active'))
    if (isActive !== shouldBeActive) await chip.click()
    await expect(chip).toHaveClass(shouldBeActive ? /active/ : /^(?!.*active)/)
  }
}

async function approveProductSubmission(page: Page, productName: string) {
  await loginAdmin(page)
  await page.locator('.nav-item').filter({ hasText: '商品库管理' }).click()
  const reviewSelect = page.locator('.data-panel > .searchable-select')
  await reviewSelect.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '待审核', exact: true }).click()
  const submission = page.locator('.product-submission-card').filter({ hasText: productName })
  await expect(submission).toHaveCount(1)
  await submission.locator('.row-actions uni-button').filter({ hasText: '通过' }).click()
  await expect(submission).toHaveCount(0)
}

async function createCheckoutAddress(page: Page, name: string) {
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const inputs = page.locator('.address-form input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill('13800009999')
  await inputs.nth(2).fill('湖南省长沙市')
  await inputs.nth(3).fill('跨端验收地址 1 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: name }).click()
}

async function fulfillSupplierOrder(page: Page, platformOrderId: string) {
  const card = page.locator('.list-card').filter({ hasText: platformOrderId })
  await expect(card).toHaveCount(1)
  await card.locator('.order-actions uni-button').filter({ hasText: '接单' }).click()
  await card.locator('.order-actions uni-button').filter({ hasText: '快递直发' }).click()
  const courierSheet = page.locator('.courier-sheet')
  await expect(courierSheet).toBeVisible()
  await courierSheet.locator('.primary-button').filter({ hasText: '确认发货' }).click()
  await expect.poll(() => page.evaluate((orderId) => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}') as Record<string, { trackingNo?: string }>
    return orders[orderId]?.trackingNo || ''
  }, platformOrderId)).not.toBe('')
  const trackingNo = await page.evaluate((orderId) => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}') as Record<string, { trackingNo?: string }>
    return orders[orderId]?.trackingNo || ''
  }, platformOrderId)
  await expect(card).toContainText(trackingNo)
  return trackingNo
}

test('farmhouse address book selects a non-default courier address and supplier reads its snapshot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '地址簿完整流程仅需移动端执行一次')
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/farmhouse/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; skus: Array<{ id: string; retailPrice: number }> }> }
    const products = catalog.products?.filter((item) => item.id === 'P001' || item.id === 'P002') || []
    const courierProduct = products.find((item) => item.id === 'P001')
    const pickupProduct = products.find((item) => item.id === 'P002')
    if (!courierProduct || !pickupProduct) throw new Error('统一目录缺少混合配送验收商品')
    Object.assign(pickupProduct, { expressDelivery: false })
    localStorage.setItem('agritainment-platform-catalog', JSON.stringify(catalog))
    localStorage.setItem('agritainment-platform-store-catalog-selections', JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      selections: products.map((product) => ({
        storeId: 'F001',
        productId: product.id,
        listed: true,
        skuRetailPrices: Object.fromEntries(product.skus.map((sku) => [sku.id, sku.retailPrice])),
        updatedAt: new Date().toISOString()
      }))
    }))
  })
  await page.reload()

  await page.locator('.tabbar uni-button').filter({ hasText: '会员' }).click()
  await page.locator('.login-prompt .primary-button').click()
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '微信一键登录' }).click()
  await expect(page.locator('.mine-list')).toHaveCSS('grid-template-columns', /.+ .+ .+/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.locator('.mine-list uni-button').filter({ hasText: '收货地址' }).click()
  await expect(page.locator('[data-visual-view="addresses"]')).toBeVisible()

  const addAddress = async (receiver: string, phone: string, detail: string) => {
    await page.locator('.address-page-action uni-button').filter({ hasText: '新增收货地址' }).click()
    const inputs = page.locator('.address-form input')
    await inputs.nth(0).fill(receiver)
    await inputs.nth(1).fill(phone)
    await page.locator('.address-form textarea').fill(detail)
    await page.locator('.address-page-action uni-button').filter({ hasText: '保存地址' }).click()
  }

  await page.locator('.address-page-action uni-button').filter({ hasText: '新增收货地址' }).click()
  await expect(page.locator('.default-choice')).toHaveClass(/selected/)
  await expect(page.locator('.default-choice')).toHaveAttribute('disabled', 'true')
  await expect(page.locator('.default-address-hint')).toContainText('首个地址将自动设为默认')
  const firstInputs = page.locator('.address-form input')
  await firstInputs.nth(0).fill('默认前地址')
  await firstInputs.nth(1).fill('13800001001')
  await page.locator('.address-form textarea').fill('麓谷街道 1 号')
  await page.locator('.address-page-action uni-button').filter({ hasText: '保存地址' }).click()
  await addAddress('会员新增地址', '13800001002', '梅溪湖街道 2 号')
  await expect(page.locator('.address-card').filter({ hasText: '默认前地址' }).locator('.address-default-tag')).toHaveCount(1)
  await expect(page.locator('.address-card').filter({ hasText: '会员新增地址' }).locator('.address-default-tag')).toHaveCount(0)

  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.getByLabel('返回会员中心').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()
  const product = page.locator('.product-card').filter({ hasText: '湘西烟熏柴火腊肉' })
  await product.locator('.add-btn').click()
  await expect(page.locator('.sku-product-summary')).toContainText('湘西烟熏柴火腊肉')
  await expect(page.locator('.sku-product-summary')).toContainText('已选')
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '加入购物车' }).click()
  const pickupProduct = page.locator('.product-card').filter({ hasText: '炎陵黄桃' })
  await pickupProduct.locator('.add-btn').click()
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去结算' }).click()
  await expect(page.locator('.cart-fulfillment-tag.pickup')).toHaveCount(2)
  await page.locator('.delivery-picker uni-button').filter({ hasText: '快递配送' }).click()
  await expect(page.locator('.cart-fulfillment-tag.courier')).toHaveCount(1)
  await expect(page.locator('.cart-fulfillment-tag.pickup')).toHaveCount(1)
  await expect(page.locator('.delivery-mixed-note')).toContainText('可快递商品寄往该地址，其余商品需到店自提')
  await expect(page.locator('.checkout-address-card')).toContainText('默认前地址')
  await page.locator('.checkout-address-card').click()
  await page.locator('.address-card').filter({ hasText: '会员新增地址' }).locator('uni-button').filter({ hasText: '设为默认' }).click()
  await expect(page.locator('.address-card').filter({ hasText: '会员新增地址' }).locator('.address-default-tag')).toHaveCount(1)
  await page.locator('.address-card').filter({ hasText: '默认前地址' }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.checkout-address-card')).toContainText('默认前地址')
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '提交订单' }).click()
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '确认支付' }).click()
  await expect(page.locator('[data-visual-view="orders"]')).toBeVisible()

  const platformOrderId = await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}') as Record<string, { id: string; supplierOrderLink?: { source?: string; deliveryAddress?: { receiver?: string } } }>
    return Object.values(orders).find((order) => order.supplierOrderLink?.source === 'farmhouse-courier' && order.supplierOrderLink.deliveryAddress?.receiver === '默认前地址')?.id || ''
  })
  expect(platformOrderId).not.toBe('')

  await page.getByLabel('返回会员中心').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()
  await product.locator('.add-btn').click()
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去结算' }).click()
  await expect(page.locator('.delivery-picker uni-button').filter({ hasText: '到店自提' })).toHaveClass(/sel/)
  await page.locator('.delivery-picker uni-button').filter({ hasText: '快递配送' }).click()
  await expect(page.locator('.checkout-address-card')).toContainText('会员新增地址')

  await page.goto('/supplier/')
  await loginSupplier(page, '13787366688')
  const supplierOrder = page.locator('.list-card').filter({ hasText: platformOrderId }).first()
  await expect(supplierOrder).toContainText('默认前地址')
  await supplierOrder.click()
  await expect(page.locator('.order-detail')).toContainText('湖南省 长沙市 岳麓区 麓谷街道 1 号')
  await expect(page.locator('.order-detail')).toContainText('默认前地址 13800001001')
})

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
  await page.locator('.live-card-enter').click()
  await expect(page.locator('.live-room')).toContainText(title)
}

test('same-origin portal entries and assets stay reachable', async ({ page }) => {
  const monitor = monitorPageErrors(page)
  const failed: string[] = []
  page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`) })
  for (const portal of portals) {
    await page.goto(`/${portal}/`)
    await expect(page.locator('body')).toBeVisible()
    await assertReadableText(page.locator('body'), portal === 'dashboard' ? 11 : 12)
    if (portal !== 'dashboard' || (page.viewportSize()?.width || 0) >= 1024) await assertNoPageOverflow(page)
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
  const catalogChannelSelect = page.locator('.goods-tools .searchable-select').first()
  await catalogChannelSelect.locator('.searchable-select__trigger').click()
  await page.locator('.searchable-select__search input').fill('直播')
  await page.getByRole('option', { name: '直播商品', exact: true }).click()
  await expect(page.locator('.unified-product-grid').first()).toBeVisible()
  await page.locator('.unified-product-grid').nth(1).locator('.row-actions uni-button').filter({ hasText: '编辑' }).click()
  await assertFixedLayerWithinViewport(page.locator('.work-modal-mask'))
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

  await page.goto('/user/#/pages/index/index?promoter=T002&live=L001')
  await loginUser(page)
  await expect(page.locator('.live-room')).toBeVisible()
  await page.locator('.live-room [aria-label="关闭直播间"]').click()
  await expect(page.locator('.product-card').first().locator('.product-price')).toContainText('48.00')
  await page.locator('.product-card').filter({ hasText: '湘西烟熏柴火腊肉' }).first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.product-card').filter({ hasText: '炎陵黄桃鲜果礼盒' }).first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await page.locator('.primary-btn').filter({ hasText: '去结算' }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const inputs = page.locator('.address-form input')
  await inputs.nth(0).fill('联调用户')
  await inputs.nth(1).fill('13800000001')
  await inputs.nth(2).fill('湖南省长沙市')
  await inputs.nth(3).fill('同源联调地址 1 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '联调用户' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  const order = page.locator('.order-card').first()
  await expect(order.locator('.sub-order')).toHaveCount(2)
  await order.locator('.primary-small').filter({ hasText: '模拟支付' }).click()
  await expect(order).toContainText('备货中')
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
  await loginSupplier(page, '13787366688')
  await page.locator('.tab-item').filter({ hasText: '订单' }).click()
  await expect(page.locator('.list-card').filter({ hasText: supplierB.id })).toHaveCount(0)
  const trackingA = await fulfillSupplierOrder(page, supplierA.id)
  await page.locator('.hero-logout').click()
  await loginSupplier(page, '13574902233')
  await page.locator('.tab-item').filter({ hasText: '订单' }).click()
  await expect(page.locator('.list-card').filter({ hasText: supplierA.id })).toHaveCount(0)
  const trackingB = await fulfillSupplierOrder(page, supplierB.id)
  await assertNoPageOverflow(page)
  await assertNoClippedText(page.locator('.order-actions uni-button:visible'))

  await page.goto('/user/')
  await loginUser(page)
  await openUserOrders(page)
  const refreshedOrder = page.locator('.order-card').first()
  const subA = refreshedOrder.locator('.sub-order').filter({ hasText: trackingA })
  const subB = refreshedOrder.locator('.sub-order').filter({ hasText: trackingB })
  await expect(subA).toHaveCount(1)
  await expect(subB).toHaveCount(1)
  await subA.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('快递配送')
  await expect(page.locator('.logistics-content')).toContainText(trackingA)
  await page.locator('.sheet-head uni-button').click({ force: true })
  await subB.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('快递配送')
  await expect(page.locator('.logistics-content')).toContainText(trackingB)
  await page.locator('.sheet-head uni-button').click({ force: true })
  await subA.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await expect(subA).toContainText('已收货')
  await subB.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await expect(subB).toContainText('已收货')
  const commissionsBeforeAfterSale = await page.evaluate(({ subAId, subBId }) => {
    const records = JSON.parse(localStorage.getItem('agritainment-platform-c-commissions') || '[]') as Array<{ id: string; subOrderId: string; status: string; amount: number }>
    return { a: records.filter((item) => item.subOrderId === subAId), b: records.filter((item) => item.subOrderId === subBId) }
  }, { subAId: supplierA.sourceSubOrderId!, subBId: supplierB.sourceSubOrderId! })
  expect(commissionsBeforeAfterSale.a.length).toBeGreaterThan(0)
  expect(commissionsBeforeAfterSale.b.length).toBeGreaterThan(0)
  expect(commissionsBeforeAfterSale.b.every((item) => item.status === 'available')).toBe(true)
  await subA.locator('.outline-small').filter({ hasText: '申请售后' }).click()
  await page.locator('.after-sale-chips uni-button').filter({ hasText: '质量问题' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交售后申请' }).click()
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

test('persisted payment confirmation recovers after refresh without duplicating its attempt or order', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '支付恢复闭环只需在同源移动端执行一次')
  const monitor = monitorPageErrors(page)
  const attemptsKey = 'agritainment-platform-payment-attempts'
  const cOrdersKey = 'agritainment-platform-c-orders'
  const supplierOrdersKey = 'agritainment-platform-orders'

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await loginUser(page)
  await page.locator('.product-card').first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await page.locator('.cart-checkout .primary-btn').filter({ hasText: '去结算' }).click()
  await createCheckoutAddress(page, '支付恢复用户')
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  const pendingOrder = page.locator('.order-card').first()
  await expect(pendingOrder).toContainText('待支付')

  const orderId = await page.evaluate((key) => {
    const orders = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, { id: string }>
    return Object.values(orders)[0]?.id || ''
  }, cOrdersKey)
  expect(orderId).not.toBe('')

  await page.evaluate(({ attemptsKey, cOrdersKey, orderId }) => {
    const orders = JSON.parse(localStorage.getItem(cOrdersKey) || '{}') as Record<string, { userId: string; amount: number }>
    const now = new Date().toISOString()
    localStorage.setItem(attemptsKey, JSON.stringify({
      [`payment:${orderId}`]: {
        operationId: `payment:${orderId}`, orderId, userId: orders[orderId].userId, amount: orders[orderId].amount,
        status: 'unknown', createdAt: now, updatedAt: now
      }
    }))
  }, { attemptsKey, cOrdersKey, orderId })
  await page.reload()
  await loginUser(page)
  await openUserOrders(page)
  const unresolvedOrder = page.locator('.order-card').filter({ hasText: orderId })
  await expect(unresolvedOrder).toContainText('支付结果确认中')
  await unresolvedOrder.locator('.primary-small').filter({ hasText: '查询支付结果' }).click()
  await expect(unresolvedOrder).toContainText('支付结果确认中')

  const failedSnapshot = await page.evaluate(({ attemptsKey, cOrdersKey, supplierOrdersKey, orderId }) => {
    const attempts = JSON.parse(localStorage.getItem(attemptsKey) || '{}') as Record<string, { operationId: string; orderId: string; status: string }>
    const orders = JSON.parse(localStorage.getItem(cOrdersKey) || '{}') as Record<string, { status: string }>
    const supplierOrders = JSON.parse(localStorage.getItem(supplierOrdersKey) || '{}') as Record<string, { supplierOrderLink?: { sourceOrderId?: string } }>
    return {
      attempts: Object.values(attempts).filter((attempt) => attempt.orderId === orderId),
      orderStatus: orders[orderId]?.status,
      supplierOrderCount: Object.values(supplierOrders).filter((order) => order.supplierOrderLink?.sourceOrderId === orderId).length
    }
  }, { attemptsKey, cOrdersKey, supplierOrdersKey, orderId })
  expect(failedSnapshot.attempts).toHaveLength(1)
  expect(failedSnapshot.attempts[0]).toMatchObject({ operationId: `payment:${orderId}`, status: 'unknown' })
  expect(failedSnapshot.orderStatus).toBe('pending_payment')
  expect(failedSnapshot.supplierOrderCount).toBe(0)

  await page.evaluate(({ attemptsKey, orderId }) => {
    const attempts = JSON.parse(localStorage.getItem(attemptsKey) || '{}') as Record<string, { status: string; updatedAt: string; providerTransactionId?: string }>
    const attempt = attempts[`payment:${orderId}`]
    attempt.status = 'confirmed'
    attempt.providerTransactionId = `PAY-E2E-${orderId}`
    attempt.updatedAt = new Date(Date.parse(attempt.updatedAt) + 1000).toISOString()
    localStorage.setItem(attemptsKey, JSON.stringify(attempts))
  }, { attemptsKey, orderId })
  await page.reload()
  await loginUser(page)
  await openUserOrders(page)
  const recoveredOrder = page.locator('.order-card').filter({ hasText: orderId })
  await expect(recoveredOrder).toContainText('备货中')
  await expect(recoveredOrder).not.toContainText('支付结果确认中')

  const recoveredSnapshot = await page.evaluate(({ attemptsKey, cOrdersKey, supplierOrdersKey, orderId }) => {
    const attempts = JSON.parse(localStorage.getItem(attemptsKey) || '{}') as Record<string, { operationId: string; orderId: string; status: string }>
    const orders = JSON.parse(localStorage.getItem(cOrdersKey) || '{}') as Record<string, { id: string; status: string }>
    const supplierOrders = JSON.parse(localStorage.getItem(supplierOrdersKey) || '{}') as Record<string, { supplierOrderLink?: { sourceOrderId?: string } }>
    return {
      attempts: Object.values(attempts).filter((attempt) => attempt.orderId === orderId),
      orderIds: Object.values(orders).filter((order) => order.id === orderId).map((order) => order.id),
      orderStatus: orders[orderId]?.status,
      supplierOrderCount: Object.values(supplierOrders).filter((order) => order.supplierOrderLink?.sourceOrderId === orderId).length
    }
  }, { attemptsKey, cOrdersKey, supplierOrdersKey, orderId })
  expect(recoveredSnapshot.attempts).toHaveLength(1)
  expect(recoveredSnapshot.attempts[0]).toMatchObject({ operationId: `payment:${orderId}`, status: 'synchronized' })
  expect(recoveredSnapshot.orderIds).toEqual([orderId])
  expect(recoveredSnapshot.orderStatus).toBe('paid')
  expect(recoveredSnapshot.supplierOrderCount).toBeGreaterThan(0)
  monitor.assertClean()
  monitor.dispose()
})

test('supplier submission audit, listing, MOQ checkout and update draft stay consistent across portals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '跨门户业务闭环仅执行一次')
  const monitor = monitorPageErrors(page)
  const originalName = '同源 MOQ 验收腊味'
  const updatedName = '同源 MOQ 验收腊味新装'

  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await loginAdmin(page)
  await page.locator('.logout-button').click()

  await loginSupplierRole(page, 'supplier', '13787366688', '13787366688')
  await page.locator('.tab-item').filter({ hasText: /^商品$/ }).click()
  await expect(page.locator('.product-work-page')).toBeVisible()
  await page.locator('.product-work-head .primary-button').filter({ hasText: '新增商品' }).click()
  const form = page.locator('.supplier-product-form')
  await form.locator('.form-field').filter({ hasText: '商品名称' }).locator('input').fill(originalName)
  await form.locator('.form-field').filter({ hasText: '商品品类' }).locator('.category-picker-trigger').click()
  await page.locator('.category-picker-option').filter({ hasText: '特色食材' }).click()
  await page.evaluate(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const uniScope = (window as unknown as { uni?: Record<string, unknown> }).uni
    if (uniScope) uniScope.chooseImage = (opts: { success: (result: { tempFilePaths: string[]; tempFiles: Array<{ path: string; file: Blob }> }) => void }) => opts.success({ tempFilePaths: [url], tempFiles: [{ path: url, file: blob }] })
  })
  const productImageField = form.locator('.media-field').filter({ hasText: '商品主图' })
  await productImageField.locator('.business-uploader__choose').click()
  await expect(productImageField.locator('.business-uploader__preview')).toBeVisible()
  const skuInputs = form.locator('.supplier-sku-fields input')
  await skuInputs.nth(0).fill('验收装')
  await skuInputs.nth(1).fill('66')
  await skuInputs.nth(2).fill('30')
  await skuInputs.nth(3).fill('30')
  await skuInputs.nth(4).fill('3')
  await skuInputs.nth(5).fill('8')
  await skuInputs.nth(6).fill('12')
  await form.locator('.product-form-actions .primary-button').click()
  const pendingRow = page.locator('.supplier-product-card').filter({ hasText: originalName })
  await expect(pendingRow).toContainText('待审核')
  const submitted = await page.evaluate((name) => {
    const state = JSON.parse(localStorage.getItem('agritainment-platform-catalog-product-submissions') || '{}')
    const submission = state.submissions?.find((item: { draft: { name: string } }) => item.draft.name === name)
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    return { id: submission?.id || '', productId: submission?.productId || submission?.draft?.id || '', formalExists: !!catalog.products?.some((item: { name: string }) => item.name === name) }
  }, originalName)
  expect(submitted.id).not.toBe('')
  expect(submitted.formalExists).toBe(false)

  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.hero-logout').click()
  await approveProductSubmission(page, originalName)
  await expect.poll(() => page.evaluate((name) => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    return catalog.products?.find((item: { name: string }) => item.name === name)?.status
  }, originalName)).toBe('offline')
  await page.locator('.nav-item').filter({ hasText: '操作日志' }).click()
  await page.locator('.module-search input').fill('product.audit')
  await expect(page.locator('.audit-grid').filter({ hasText: 'product.audit' })).toHaveCount(1)
  await page.locator('.logout-button').click()

  await loginSupplierRole(page, 'supplier', '13787366688', '13787366688')
  await page.locator('.tab-item').filter({ hasText: /^商品$/ }).click()
  const formalRow = page.locator('.supplier-product-card').filter({ hasText: originalName })
  await expect(formalRow).toContainText('已下架')
  await formalRow.locator('.order-actions uni-button').filter({ hasText: '上架' }).click()
  await expect(formalRow).toContainText('已上架')

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await loginUser(page)
  await page.locator('.search-input input').fill(originalName)
  const product = page.locator('.product-card').filter({ hasText: originalName })
  await expect(product).toBeVisible()
  await product.click()
  await expect(page.locator('.detail-content')).not.toContainText('起订')
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await expect(page.locator('.cart-line .stepper')).toContainText('3')
  await page.locator('.cart-line .stepper uni-button').filter({ hasText: '−' }).click()
  await expect(page.locator('.cart-line .stepper')).toContainText('2')
  await expect(page.locator('.cart-line')).toContainText('库存不足或购买数量未达要求')
  await expect(page.locator('.primary-btn').filter({ hasText: '去结算' })).toHaveAttribute('disabled', 'true')
  await page.locator('.cart-line .stepper uni-button').filter({ hasText: '+' }).click()
  await expect(page.locator('.cart-line .stepper')).toContainText('3')
  await expect(page.locator('.primary-btn').filter({ hasText: '去结算' })).toBeEnabled()
  await page.locator('.cart-checkout .primary-btn').filter({ hasText: '去结算' }).click()
  await createCheckoutAddress(page, 'MOQ 验收用户')
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  await expect(page.locator('.orders-page')).toBeVisible()
  const orderSnapshot = await page.evaluate((productId) => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-c-orders') || '{}')
    const order = Object.values(orders).find((item: any) => item.items?.some((line: any) => line.productId === productId)) as any
    return order?.items?.find((line: any) => line.productId === productId)
  }, submitted.productId)
  expect(orderSnapshot).toMatchObject({ quantity: 3, minimumOrderQuantity: 3 })

  await page.goto('/supplier/')
  if (await page.locator('.login-page').count()) await loginSupplierRole(page, 'supplier', '13787366688', '13787366688')
  await page.locator('.tab-item').filter({ hasText: /^商品$/ }).click()
  const editRow = page.locator('.supplier-product-card').filter({ hasText: originalName })
  await editRow.locator('.order-actions uni-button').filter({ hasText: '编辑' }).click()
  await page.locator('.supplier-product-form .form-field').filter({ hasText: '商品名称' }).locator('input').fill(updatedName)
  await page.locator('.product-form-actions .primary-button').filter({ hasText: '提交资料审核' }).click()
  await expect(page.locator('.supplier-product-card').filter({ hasText: updatedName })).toContainText('待审核')

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.reload()
  await loginUser(page)
  await page.locator('.search-input input').fill(updatedName)
  await expect(page.locator('.product-card')).toHaveCount(0)
  await page.locator('.search-input input').fill(originalName)
  await expect(page.locator('.product-card').filter({ hasText: originalName })).toHaveCount(1)

  await approveProductSubmission(page, updatedName)
  await expect.poll(() => page.evaluate((productId) => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    const item = catalog.products?.find((product: { id: string }) => product.id === productId)
    return item && { name: item.name, status: item.status }
  }, submitted.productId)).toEqual({ name: updatedName, status: 'active' })
  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.reload()
  await loginUser(page)
  await page.locator('.search-input input').fill(updatedName)
  await expect(page.locator('.product-card').filter({ hasText: updatedName })).toHaveCount(1)
  await assertNoPageOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('driver scope, route optimization, manual order, publish and stale view stay consistent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '配送线路业务闭环仅执行一次')
  const monitor = monitorPageErrors(page)
  await page.goto('/supplier/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.role-tabs uni-button').filter({ hasText: '供应商' }).click()
  await submitSupplierLogin(page, '13787366688', '13787366688')
  await expect(page.locator('.app-shell')).toBeVisible()

  const fixture = await page.evaluate(() => {
    const driversRaw = JSON.parse(localStorage.getItem('agritainment-platform-drivers') || '[]')
    const drivers = (Array.isArray(driversRaw) ? driversRaw : driversRaw.drivers || []).filter((item: any) => item.supplierId === 'S002' && item.status === 'active')
    if (drivers.length < 2) throw new Error('S002 至少需要两名启用司机')
    const [targetDriver, outsideDriver] = drivers
    const orderKey = 'agritainment-platform-orders'
    const orders = JSON.parse(localStorage.getItem(orderKey) || '{}')
    const seed = Object.values(orders).find((item: any) => item.supplierId === 'S002') as any
    if (!seed) throw new Error('缺少 S002 配送订单种子')
    const current = new Date()
    const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    const now = current.toISOString()
    const fulfillment = (status: string, driver?: any) => ({
      status, shipType: driver ? 'driver' : undefined, driverId: driver?.id, driverName: driver?.name,
      deliverDate: driver ? today : undefined, shortages: [], handovers: [], updatedAt: now
    })
    orders['E2E-SCOPE-ORDER'] = { ...seed, id: 'E2E-SCOPE-ORDER', customer: '石板溪农家乐', storeId: 'F001', storeName: '石板溪农家乐·门店', status: 'pending', supplierFulfillment: fulfillment('accepted') }
    orders['E2E-ROUTE-A1'] = { ...seed, id: 'E2E-ROUTE-A1', customer: '石板溪农家乐', storeId: 'F001', storeName: '石板溪农家乐·门店', status: 'shipping', supplierFulfillment: fulfillment('shipped', targetDriver) }
    orders['E2E-ROUTE-A2'] = { ...seed, id: 'E2E-ROUTE-A2', customer: '石板溪农家乐', storeId: 'F001', storeName: '石板溪农家乐·门店', status: 'shipping', supplierFulfillment: fulfillment('shipped', targetDriver) }
    orders['E2E-ROUTE-B1'] = { ...seed, id: 'E2E-ROUTE-B1', customer: '云上人家山景农庄', storeId: 'F002', storeName: '云上人家·门店', status: 'shipping', supplierFulfillment: fulfillment('shipped', targetDriver) }
    localStorage.setItem(orderKey, JSON.stringify(orders))
    return {
      today,
      outside: { id: outsideDriver.id, name: outsideDriver.name },
      target: { id: targetDriver.id, name: targetDriver.name, account: targetDriver.account, password: targetDriver.password }
    }
  })
  await page.reload()
  await expect(page.locator('.app-shell')).toBeVisible()

  await openSupplierDriverManagement(page)
  await setDriverScope(page, fixture.outside.name, ['云上人家·门店'])
  await setDriverScope(page, fixture.target.name, ['石板溪农家乐·门店', '云上人家·门店'])

  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.tab-item').filter({ hasText: '订单' }).click()
  const scopeOrder = page.locator('.list-card').filter({ hasText: 'E2E-SCOPE-ORDER' })
  await scopeOrder.locator('.order-actions uni-button').filter({ hasText: '指派司机' }).click()
  const picker = page.locator('.driver-picker')
  await expect(picker.locator('.driver-option').filter({ hasText: fixture.target.name })).toHaveCount(1)
  await expect(picker.locator('.driver-option').filter({ hasText: fixture.outside.name })).toHaveCount(0)
  await picker.locator('.driver-option').filter({ hasText: fixture.target.name }).click()
  const scopeWriter = await page.context().newPage()
  await scopeWriter.goto('/supplier/')
  if (await scopeWriter.locator('.login-page').count()) await loginSupplier(scopeWriter, '13787366688')
  await openSupplierDriverManagement(scopeWriter)
  await setDriverScope(scopeWriter, fixture.target.name, ['云上人家·门店'])
  await page.waitForFunction(() => {
    const app = (document.querySelector('#app') as any)?.__vue_app__
    const store = app?.config?.globalProperties?.$pinia?._s?.get('supplier')
    return store?.driverScopeRevision === Number(localStorage.getItem('agritainment-platform-driver-store-scopes:revision'))
  })
  await expect(picker.locator('.driver-option').filter({ hasText: fixture.target.name })).toHaveCount(0)
  await picker.locator('.sheet-actions .primary-button').click()
  await expect(picker).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}')
    return orders['E2E-SCOPE-ORDER']?.supplierFulfillment?.driverId || ''
  })).toBe('')
  await setDriverScope(scopeWriter, fixture.target.name, ['石板溪农家乐·门店', '云上人家·门店'])
  await page.waitForFunction(() => {
    const app = (document.querySelector('#app') as any)?.__vue_app__
    const store = app?.config?.globalProperties?.$pinia?._s?.get('supplier')
    return store?.driverScopeRevision === Number(localStorage.getItem('agritainment-platform-driver-store-scopes:revision'))
  })
  await expect(picker.locator('.driver-option').filter({ hasText: fixture.target.name })).toHaveCount(1)
  await scopeWriter.close()
  await page.bringToFront()
  await picker.locator('.driver-option').filter({ hasText: fixture.target.name }).click()
  await picker.locator('.sheet-actions .primary-button').click()
  await expect(page.locator('.toast')).toContainText('已指派司机')
  await expect(picker).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}')
    return orders['E2E-SCOPE-ORDER']?.supplierFulfillment?.driverId || ''
  })).toBe(fixture.target.id)

  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.work-link').filter({ hasText: '线路规划' }).click()
  await expect(page.locator('.secondary-head')).toContainText('线路规划')
  await page.locator('.route-controls uni-picker').first().click()
  await page.locator('.uni-picker-action-confirm:visible').click()
  await expect(page.locator('.route-controls .picker-field').first()).toContainText(fixture.target.name)
  await page.locator('.route-controls .primary-button').filter({ hasText: '智能排序' }).click()
  await expect(page.locator('.route-summary')).toBeVisible()
  await expect(page.locator('.route-stop')).toHaveCount(2)
  await expect(page.locator('.route-stop').filter({ hasText: '石板溪农家乐·门店' })).toContainText(/[2-9]\d* 单/)
  const routeBeforeFailure = await page.locator('.route-stop').allTextContents()
  const providerHook = await page.evaluate(() => typeof (window as any).__agritainmentE2E?.setRouteProviderFailure)
  expect(providerHook).toBe('function')
  await page.evaluate(() => (window as any).__agritainmentE2E.setRouteProviderFailure(true))
  await page.locator('.route-controls .primary-button').filter({ hasText: '智能排序' }).click()
  await expect.poll(() => page.locator('.route-stop').allTextContents()).toEqual(routeBeforeFailure)
  await page.evaluate(() => (window as any).__agritainmentE2E.setRouteProviderFailure(false))
  const firstStop = page.locator('.route-stop').first()
  await firstStop.locator('[aria-label="下移"]').click()
  const manualStopNames = (await page.locator('.route-stop').allTextContents()).map((text) => text.includes('石板溪农家乐·门店') ? '石板溪农家乐·门店' : '云上人家·门店')
  const orderedStoreIds = manualStopNames.map((name) => name === '石板溪农家乐·门店' ? 'F001' : 'F002')
  expect(manualStopNames).toEqual([
    routeBeforeFailure[1].includes('石板溪农家乐·门店') ? '石板溪农家乐·门店' : '云上人家·门店',
    routeBeforeFailure[0].includes('石板溪农家乐·门店') ? '石板溪农家乐·门店' : '云上人家·门店'
  ])
  await page.locator('.route-publish').filter({ hasText: '采用并发布' }).click()
  await expect(page.locator('.toast')).toContainText('今日线路已发布')
  const publishedRoutes = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('agritainment-platform-daily-delivery-routes') || '{}')
    return state.routes || []
  })
  const publishedRoute = publishedRoutes.find((route: any) => route.supplierId === 'S002' && route.driverId === fixture.target.id && route.deliveryDate === fixture.today)
  expect(publishedRoute).toMatchObject({ status: 'published' })
  expect(publishedRoute.stops.map((stop: any) => stop.storeId)).toEqual(orderedStoreIds)
  expect(publishedRoute.stops.find((stop: any) => stop.storeId === 'F001')?.orderIds).toEqual(expect.arrayContaining(['E2E-SCOPE-ORDER', 'E2E-ROUTE-A1', 'E2E-ROUTE-A2']))

  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.hero-logout').click()
  await page.locator('.role-tabs uni-button').filter({ hasText: '司机' }).click()
  await submitSupplierLogin(page, fixture.target.account, fixture.target.password)
  await expect(page.locator('.driver-route')).toContainText('已发布')
  await expect(page.locator('.driver-route .route-stop')).toHaveCount(2)
  const driverStopNames = (await page.locator('.driver-route .route-stop').allTextContents()).map((text) => text.includes('石板溪农家乐·门店') ? '石板溪农家乐·门店' : '云上人家·门店')
  expect(driverStopNames).toEqual(manualStopNames)
  const writer = await page.context().newPage()
  await writer.goto('/supplier/')
  await writer.evaluate(({ driverId, driverName, today }) => {
    const key = 'agritainment-platform-orders'
    const orders = JSON.parse(localStorage.getItem(key) || '{}')
    const seed = orders['E2E-ROUTE-B1']
    orders['E2E-ROUTE-PENDING'] = {
      ...seed, id: 'E2E-ROUTE-PENDING', customer: '石板溪农家乐', storeId: 'F001', storeName: '石板溪农家乐·门店',
      supplierFulfillment: { ...seed.supplierFulfillment, driverId, driverName, deliverDate: today, updatedAt: new Date().toISOString() }
    }
    localStorage.setItem(key, JSON.stringify(orders))
  }, { driverId: fixture.target.id, driverName: fixture.target.name, today: fixture.today })
  await expect(page.locator('.driver-route')).toContainText('任务或配置有变化')
  await expect(page.locator('.page-pad .list-card').filter({ hasText: 'E2E-ROUTE-PENDING' })).toHaveCount(1)
  await writer.close()
  await assertNoPageOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('driver completes every published route stop and moves finished orders into history', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '司机整线完成闭环只需在同源移动端执行一次')
  const monitor = monitorPageErrors(page)
  const routeKey = 'agritainment-platform-daily-delivery-routes'
  const orderIds = ['E2E-ROUTE-COMPLETE-A', 'E2E-ROUTE-COMPLETE-B']

  await page.goto('/supplier/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.login-page')).toBeVisible()
  const fixture = await page.evaluate(({ routeKey, orderIds }) => {
    const driversRaw = JSON.parse(localStorage.getItem('agritainment-platform-drivers') || '[]')
    const drivers = Array.isArray(driversRaw) ? driversRaw : driversRaw.drivers || []
    const driver = drivers.find((item: any) => item.supplierId === 'S002' && item.status === 'active')
    if (!driver) throw new Error('缺少 S002 启用司机')
    const orderKey = 'agritainment-platform-orders'
    const orders = JSON.parse(localStorage.getItem(orderKey) || '{}')
    const seed = Object.values(orders).find((item: any) => item.supplierId === 'S002') as any
    if (!seed) throw new Error('缺少 S002 配送订单种子')
    const current = new Date()
    const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    const now = current.toISOString()
    const fulfillment = { status: 'delivering', shipType: 'driver', driverId: driver.id, driverName: driver.name, deliverDate: today, shortages: [], handovers: [], updatedAt: now }
    orders[orderIds[0]] = {
      ...seed, id: orderIds[0], customer: '石板溪农家乐·门店', storeId: 'F001', storeName: '石板溪农家乐·门店',
      status: 'shipping', supplierOrderLink: undefined, supplierFulfillment: fulfillment, createdAt: now
    }
    orders[orderIds[1]] = {
      ...seed, id: orderIds[1], customer: '云上人家·门店', storeId: 'F002', storeName: '云上人家·门店',
      status: 'shipping', supplierOrderLink: undefined, supplierFulfillment: { ...fulfillment }, createdAt: new Date(current.getTime() + 1).toISOString()
    }
    localStorage.setItem(orderKey, JSON.stringify(orders))
    localStorage.setItem(routeKey, JSON.stringify({
      schemaVersion: 1, revision: 1, updatedAt: now,
      routes: [{
        id: `E2E-COMPLETE-${today}`, supplierId: 'S002', driverId: driver.id, deliveryDate: today, status: 'published',
        stops: [
          { storeId: 'F001', storeName: '石板溪农家乐·门店', address: '湖南省湘西州永顺县石板溪村', longitude: 109.8542, latitude: 28.6267, orderIds: [orderIds[0]] },
          { storeId: 'F002', storeName: '云上人家·门店', address: '湖南省张家界市永定区云上路', longitude: 110.4792, latitude: 29.1171, orderIds: [orderIds[1]] }
        ],
        totalDistanceKm: 12.8, estimatedDurationMinutes: 46, sourceOrderIds: orderIds,
        provider: 'e2e-canonical-route', generatedAt: now, publishedAt: now
      }]
    }))
    return { id: driver.id, account: driver.account, password: driver.password, today }
  }, { routeKey, orderIds })

  await loginSupplierRole(page, 'driver', fixture.account, fixture.password)
  const driverRoute = page.locator('.driver-route')
  await expect(driverRoute).toContainText('完成 0/2')
  await expect(driverRoute.locator('.route-stop')).toHaveCount(2)
  const firstStop = driverRoute.locator('.route-stop').filter({ hasText: '石板溪农家乐·门店' })
  await firstStop.locator('.task-orders uni-button').filter({ hasText: `${orderIds[0]} · 到店交接` }).click()
  await page.locator('.handover-sheet .primary-button').filter({ hasText: '确认已送达门店' }).click()
  await expect(page.locator('.toast')).toContainText('到店交接完成')
  await expect(driverRoute).toContainText('完成 1/2')
  await expect(firstStop).toContainText('完成 1/1 单')
  await expect(firstStop.locator('.task-orders uni-button')).toHaveCount(0)
  await expect(firstStop.locator('.task-nav')).toHaveCount(0)

  const secondStop = driverRoute.locator('.route-stop').filter({ hasText: '云上人家·门店' })
  await secondStop.locator('.task-orders uni-button').filter({ hasText: `${orderIds[1]} · 到店交接` }).click()
  await page.locator('.handover-sheet .primary-button').filter({ hasText: '确认已送达门店' }).click()
  await expect(page.locator('.toast')).toContainText('到店交接完成')
  await expect(driverRoute).toContainText('今日配送已完成')
  await expect(driverRoute).toContainText('完成 2/2 · 全部完成')
  await expect(driverRoute.locator('.task-orders uni-button')).toHaveCount(0)
  await expect(driverRoute.locator('.task-nav')).toHaveCount(0)

  const persisted = await page.evaluate(({ routeKey, orderIds, routeId }) => {
    const routeState = JSON.parse(localStorage.getItem(routeKey) || '{}')
    const route = routeState.routes?.find((item: any) => item.id === routeId)
    const orders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}')
    return {
      route,
      orderStatuses: orderIds.map((id) => orders[id]?.supplierFulfillment?.status),
      completedOrderIds: route?.stops?.flatMap((stop: any) => stop.completedOrderIds || [])
    }
  }, { routeKey, orderIds, routeId: `E2E-COMPLETE-${fixture.today}` })
  expect(persisted.route).toMatchObject({ status: 'completed', completedAt: expect.any(String) })
  expect(persisted.route.stops).toEqual(expect.arrayContaining([
    expect.objectContaining({ completedAt: expect.any(String) }),
    expect.objectContaining({ completedAt: expect.any(String) })
  ]))
  expect(persisted.completedOrderIds).toEqual(expect.arrayContaining(orderIds))
  expect(persisted.orderStatuses).toEqual(['received', 'received'])

  await page.locator('.tab-item').filter({ hasText: '历史任务' }).click()
  for (const orderId of orderIds) {
    const historyOrder = page.locator('.page-pad .list-card').filter({ hasText: orderId })
    await expect(historyOrder).toHaveCount(1)
    await expect(historyOrder).toContainText('已收货')
    await expect(historyOrder.locator('uni-button')).toHaveCount(0)
  }
  await assertNoPageOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('supplier and driver mobile workspaces stay usable at every acceptance viewport', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1280, height: 600 })
  const monitor = monitorPageErrors(page)
  await page.goto('/supplier/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.role-tabs uni-button').filter({ hasText: '供应商' }).click()
  await submitSupplierLogin(page, '13787366688', '13787366688')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  await assertFixedLayerWithinViewport(page.locator('.tabbar'))
  await assertNoClippedText(page.locator('.tab-item'))
  await page.locator('.tab-item').filter({ hasText: /^商品$/ }).click()
  await expect(page.locator('.product-work-page')).toBeVisible()
  await assertNoClippedText(page.locator('.product-work-head uni-button:visible, .product-work-head uni-text:visible'))
  await assertNoClippedText(page.locator('.product-filter-chips uni-button:visible, .supplier-product-list uni-text:visible, .supplier-product-list uni-button:visible, .product-work-page .empty-state uni-text:visible'))
  await assertNoPageOverflow(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()

  const driver = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('agritainment-platform-drivers') || '[]')
    const drivers = Array.isArray(raw) ? raw : raw.drivers || []
    const item = drivers.find((candidate: any) => candidate.supplierId === 'S002' && candidate.status === 'active')
    if (!item) throw new Error('缺少响应式验收司机')
    const current = new Date()
    const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    const key = 'agritainment-platform-orders'
    const orders = JSON.parse(localStorage.getItem(key) || '{}')
    const seed = Object.values(orders).find((order: any) => order.supplierId === 'S002') as any
    if (!seed) throw new Error('缺少响应式线路订单种子')
    const fulfillment = { status: 'shipped', shipType: 'driver', driverId: item.id, driverName: item.name, deliverDate: today, shortages: [], handovers: [], updatedAt: current.toISOString() }
    orders['E2E-RESPONSIVE-F001'] = { ...seed, id: 'E2E-RESPONSIVE-F001', customer: '石板溪农家乐', storeId: 'F001', storeName: '石板溪农家乐·门店', status: 'shipping', supplierFulfillment: fulfillment }
    orders['E2E-RESPONSIVE-F002'] = { ...seed, id: 'E2E-RESPONSIVE-F002', customer: '云上人家山景农庄', storeId: 'F002', storeName: '云上人家·门店', status: 'shipping', supplierFulfillment: fulfillment }
    localStorage.setItem(key, JSON.stringify(orders))
    return { id: item.id, name: item.name, account: item.account, password: item.password }
  })
  await page.reload()
  await expect(page.locator('.app-shell')).toBeVisible()

  await openSupplierDriverManagement(page)
  await setDriverScope(page, driver.name, ['石板溪农家乐·门店', '云上人家·门店'])
  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.work-link').filter({ hasText: '线路规划' }).click()
  await expect(page.locator('.secondary-workspace')).toBeVisible()
  await page.locator('.route-controls uni-picker').first().click()
  if ((page.viewportSize()?.width || 0) <= 375) await page.locator('.uni-picker-action-confirm:visible').click()
  else await page.getByText(driver.name, { exact: true }).last().click()
  await expect(page.locator('.route-controls .picker-field').first()).toContainText(driver.name)
  await page.locator('.route-controls .primary-button').filter({ hasText: '智能排序' }).click()
  await expect(page.locator('.route-summary')).toBeVisible()
  await expect(page.locator('.route-stop')).toHaveCount(2)
  await expect(page.locator('.route-stop [aria-label="上移"]')).toHaveCount(2)
  await expect(page.locator('.route-stop [aria-label="下移"]')).toHaveCount(2)
  await expect(page.locator('.route-publish')).toBeVisible()
  await assertNoClippedText(page.locator('.route-summary .stat-card, .route-stop .row-main, .route-actions uni-button, .route-publish'))
  await assertNoPageOverflow(page)
  await page.locator('.route-publish').click()
  await expect(page.locator('.toast')).toContainText('今日线路已发布')

  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.hero-logout').click()
  await page.locator('.role-tabs uni-button').filter({ hasText: '司机' }).click()
  await submitSupplierLogin(page, driver.account, driver.password)
  await expect(page.locator('.tab-item')).toHaveCount(3)
  await expect(page.locator('.driver-route .route-stop')).toHaveCount(2)
  await assertNoClippedText(page.locator('.driver-route .route-stop .row-main > uni-text, .driver-route .task-nav, .driver-route .task-orders uni-button'))
  await assertFixedLayerWithinViewport(page.locator('.tabbar'))
  await assertNoPageOverflow(page)
  const missingAsset = await page.request.get('/supplier/assets/__task4-missing__.js')
  expect(missingAsset.status()).toBe(404)
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
  const selectCatalogField = async (fieldLabel: string, optionLabel: string) => {
    const select = catalogModal.locator('.field').filter({ hasText: fieldLabel }).locator('.searchable-select')
    await select.locator('.searchable-select__trigger').click()
    await page.locator('.searchable-select__search input').fill(optionLabel)
    await page.getByRole('option', { name: optionLabel, exact: true }).click()
  }
  await selectCatalogField('商品渠道', '全部商品')
  await selectCatalogField('快递直发', '支持')
  await selectCatalogField('供应商', '武陵蜂业专业合作社')
  const skuInputs = catalogModal.locator('.c-sku-row').first().locator('input')
  await skuInputs.nth(1).fill('100')
  await skuInputs.nth(2).fill('60')
  await skuInputs.nth(3).fill('6')
  await skuInputs.nth(4).fill('1')
  await skuInputs.nth(5).fill('10')
  await skuInputs.nth(6).fill('15')
  await page.evaluate(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const uniScope = (window as unknown as { uni?: Record<string, unknown> }).uni
    if (uniScope) uniScope.chooseImage = (opts: { success: (result: { tempFilePaths: string[]; tempFiles: Array<{ path: string; file: Blob }> }) => void }) => opts.success({ tempFilePaths: [url], tempFiles: [{ path: url, file: blob }] })
  })
  await catalogModal.locator('.field').filter({ hasText: '商品主图' }).locator('.business-uploader__choose').click()
  await expect(catalogModal.locator('.field').filter({ hasText: '商品主图' }).locator('.business-uploader__preview')).toBeVisible()
  await catalogModal.locator('.modal-actions .button.primary').filter({ hasText: '保存商品' }).click()
  await expect(catalogModal).toHaveCount(0)

  await expect.poll(() => page.evaluate((name) => {
    const submissions = JSON.parse(localStorage.getItem('agritainment-platform-catalog-product-submissions') || '{}')
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}')
    return {
      pending: submissions.submissions?.some((item: { draft: { name: string }; status: string }) => item.draft.name === name && item.status === 'pending') || false,
      formal: catalog.products?.some((item: { name: string }) => item.name === name) || false
    }
  }, productName)).toEqual({ pending: true, formal: false })
  const reviewChannel = page.locator('.data-panel > .searchable-select')
  await reviewChannel.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '待审核', exact: true }).click()
  const createdSubmission = page.locator('.product-submission-card').filter({ hasText: productName })
  await createdSubmission.locator('.row-actions uni-button').filter({ hasText: '通过' }).click()
  await reviewChannel.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '正式商品', exact: true }).click()
  await page.locator('.goods-tools .search-box input').fill(productName)
  const createdFormalProduct = page.locator('.unified-product-grid').filter({ hasText: productName })
  await expect(createdFormalProduct).toContainText('已下架')
  await createdFormalProduct.locator('.row-actions uni-button').filter({ hasText: '上架' }).click()
  await expect(createdFormalProduct).toContainText('已上架')

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
  await expect.poll(stockOf).toBe(6)

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
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '确认支付' }).click()
  await expect.poll(stockOf).toBe(5)

  await page.goto('/store/')
  await page.locator('.login-fields input').nth(0).fill('13800000001')
  await page.locator('.login-fields input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.search-bar input').fill(productName)
  const orderingProduct = page.locator('.product-card').filter({ hasText: productName })
  await orderingProduct.locator('.product-foot uni-button').click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去下单' }).click()
  await page.locator('.sheet-list .primary-button').filter({ hasText: '确认下单' }).click()
  await page.locator('.checkout-form .primary-button').filter({ hasText: '提交订单' }).click()
  await expect.poll(stockOf).toBe(4)

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await loginUser(page)
  await page.locator('.search-input input').fill(productName)
  await page.locator('.product-card').filter({ hasText: productName }).click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar').click()
  await page.locator('.cart-checkout .primary-btn').filter({ hasText: '去结算' }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const addressInputs = page.locator('.address-form input')
  await addressInputs.nth(0).fill('共享库存用户')
  await addressInputs.nth(1).fill('13800000001')
  await addressInputs.nth(2).fill('湖南省长沙市')
  await addressInputs.nth(3).fill('同源库存测试地址')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '共享库存用户' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  await expect.poll(stockOf).toBe(3)
})

test('admin supplier certification, cooperation and account freeze form a cross-portal loop', async ({ page }) => {
  const supplierName = '联调鲜果供应商'
  const initialPhone = '13900008881'
  const nextAccount = '13900008882'
  const nextPassword = 'fresh789'
  const driverAccount = 'freshdriver'
  const driverPassword = 'driver789'
  const monitor = monitorPageErrors(page)

  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  await page.locator('.head-actions .button.primary').filter({ hasText: '邀请供应商' }).click()

  const createPage = page.locator('.work-page')
  await expect(createPage.getByRole('heading', { name: '邀请供应商' })).toBeVisible()
  await createPage.locator('.field').filter({ hasText: '供应商名称' }).locator('input').fill(supplierName)
  await createPage.locator('.field').filter({ hasText: '联系人手机' }).locator('input').fill(initialPhone)
  await createPage.locator('.work-page-actions .button.primary').click()

  const supplierRow = page.locator('.supplier-grid').filter({ hasText: supplierName })
  await expect(supplierRow).toHaveCount(1)
  await expect.poll(() => page.evaluate(({ name }) => {
    const accounts = JSON.parse(localStorage.getItem('agritainment-platform-supplier-accounts') || '[]') as Array<{ supplierName: string }>
    return accounts.some((item) => item.supplierName === name)
  }, { name: supplierName })).toBe(false)
  await supplierRow.locator('.row-actions uni-button').filter({ hasText: '通过' }).click()
  await expect(supplierRow).toContainText('合作中')

  await page.goto('/supplier/')
  await loginSupplier(page, initialPhone)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.pc-hero-name')).toContainText(supplierName)
  await page.locator('.work-link').filter({ hasText: '司机管理' }).click()
  await page.locator('.primary-button').filter({ hasText: '新增司机' }).click()
  const driverForm = page.locator('.driver-form-sheet')
  await driverForm.locator('input').nth(0).fill('联调司机')
  await driverForm.locator('input').nth(1).fill('13800008883')
  await driverForm.locator('input').nth(2).fill(driverAccount)
  await driverForm.locator('input').nth(3).fill(driverPassword)
  await driverForm.locator('.primary-button').filter({ hasText: '创建账号' }).click()
  await expect(driverForm).toHaveCount(0)
  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.hero-logout').click()

  await page.goto('/admin/')
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  await page.locator('.module-search .search-box input').fill(supplierName)
  const updatedRow = page.locator('.supplier-grid').filter({ hasText: supplierName })
  await updatedRow.locator('.row-actions uni-button').filter({ hasText: '账号信息' }).click()
  const accountPage = page.locator('.work-page')
  await expect(accountPage.getByRole('heading', { name: '供应商账号信息' })).toBeVisible()
  await accountPage.locator('.field').filter({ hasText: '登录账号' }).locator('input').fill(nextAccount)
  await accountPage.locator('.field').filter({ hasText: '新密码' }).locator('input').fill(nextPassword)
  await accountPage.locator('.work-page-actions .button.primary').click()
  await expect(accountPage).toBeHidden()
  await expect.poll(() => page.evaluate(({ account, password }) => {
    const accounts = JSON.parse(localStorage.getItem('agritainment-platform-supplier-accounts') || '[]') as Array<{ account: string; password: string }>
    return accounts.some((item) => item.account === account && item.password === password)
  }, { account: nextAccount, password: nextPassword })).toBe(true)

  await page.goto('/supplier/')
  await submitSupplierLogin(page, initialPhone, initialPhone)
  await expect(page.locator('.login-error')).toContainText('账号或密码错误')
  await loginSupplier(page, nextAccount, nextPassword)
  await page.locator('.hero-logout').click()

  await page.goto('/admin/')
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  await page.locator('.module-search .search-box input').fill(supplierName)
  const statusRow = page.locator('.supplier-grid').filter({ hasText: supplierName })
  await statusRow.locator('.row-actions uni-button').filter({ hasText: '暂停合作' }).click()
  const pauseDialog = page.getByRole('dialog')
  await pauseDialog.getByRole('textbox').fill('季节性暂停联调')
  await pauseDialog.getByText('确认暂停合作', { exact: true }).click()
  await expect(statusRow).toContainText('已认证 · 已暂停')
  await expect(statusRow).toContainText('暂停原因：季节性暂停联调')

  await page.goto('/supplier/')
  await loginSupplier(page, nextAccount, nextPassword)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.pc-hero-name')).toContainText(supplierName)
  await page.locator('.work-link').filter({ hasText: '司机管理' }).click()
  await page.locator('.primary-button').filter({ hasText: '新增司机' }).click()
  const pausedDriverForm = page.locator('.driver-form-sheet')
  await pausedDriverForm.locator('input').nth(0).fill('暂停期司机')
  await pausedDriverForm.locator('input').nth(1).fill('13800008884')
  await pausedDriverForm.locator('input').nth(2).fill('pauseddriver')
  await pausedDriverForm.locator('input').nth(3).fill('driver789')
  await pausedDriverForm.locator('.primary-button').filter({ hasText: '创建账号' }).click()
  await expect(pausedDriverForm.locator('.form-error')).toContainText('暂停合作')
  await page.locator('.driver-form-sheet .icon-button').click()
  await page.locator('.secondary-head [aria-label="返回"]').click()
  await page.locator('.hero-logout').click()

  await page.goto('/admin/')
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  await page.locator('.module-search .search-box input').fill(supplierName)
  const freezeRow = page.locator('.supplier-grid').filter({ hasText: supplierName })
  await freezeRow.locator('.row-actions uni-button').filter({ hasText: '账号信息' }).click()
  const freezePage = page.locator('.work-page')
  const statusSelect = freezePage.locator('.field').filter({ hasText: '账号状态' }).locator('.searchable-select')
  await statusSelect.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '停用', exact: true }).click()
  await freezePage.locator('.field').filter({ hasText: '冻结原因' }).locator('input').fill('账号安全联调冻结')
  await freezePage.locator('.work-page-actions .button.primary').click()
  await expect(freezePage).toBeHidden()
  await expect.poll(() => page.evaluate((account) => {
    const accounts = JSON.parse(localStorage.getItem('agritainment-platform-supplier-accounts') || '[]') as Array<{ account: string; enabled: boolean }>
    return accounts.find((item) => item.account === account)?.enabled
  }, nextAccount)).toBe(false)

  await page.goto('/supplier/')
  await submitSupplierLogin(page, nextAccount, nextPassword)
  await expect(page.locator('.login-error')).toContainText('账号暂不可登录')
  await page.locator('.role-tabs uni-button').filter({ hasText: '司机' }).click()
  await submitSupplierLogin(page, driverAccount, driverPassword)
  await expect(page.locator('.login-error')).toContainText('所属供应商账号已冻结')

  await page.goto('/admin/')
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  await page.locator('.module-search .search-box input').fill(supplierName)
  const recoveryRow = page.locator('.supplier-grid').filter({ hasText: supplierName })
  await recoveryRow.locator('.row-actions uni-button').filter({ hasText: '账号信息' }).click()
  const recoveryPage = page.locator('.work-page')
  const recoveryStatus = recoveryPage.locator('.field').filter({ hasText: '账号状态' }).locator('.searchable-select')
  await recoveryStatus.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '启用', exact: true }).click()
  await recoveryPage.locator('.work-page-actions .button.primary').click()
  await expect(recoveryPage).toBeHidden()
  await expect.poll(() => page.evaluate((account) => {
    const accounts = JSON.parse(localStorage.getItem('agritainment-platform-supplier-accounts') || '[]') as Array<{ account: string; enabled: boolean }>
    return accounts.find((item) => item.account === account)?.enabled
  }, nextAccount)).toBe(true)
  await page.locator('.module-search .search-box input').fill(supplierName)
  await page.locator('.supplier-grid').filter({ hasText: supplierName }).locator('.row-actions uni-button').filter({ hasText: '恢复合作' }).click()

  await page.goto('/supplier/')
  await loginSupplier(page, nextAccount, nextPassword)
  await expect(page.locator('.hero-title')).toContainText(supplierName)

  await page.goto('/admin/')
  await page.locator('.nav-item').filter({ hasText: '操作日志' }).click()
  await page.locator('.module-search input').fill('supplier.account.freeze')
  await expect(page.locator('.audit-grid').filter({ hasText: 'supplier.account.freeze' })).toHaveCount(1)
  await page.locator('.module-search input').fill('supplier.pause')
  await expect(page.locator('.audit-grid').filter({ hasText: 'supplier.pause' })).toHaveCount(1)
  await assertNoPageOverflow(page)
  monitor.assertClean()
})

test('admin role account limits menus and supplier action buttons', async ({ page }) => {
  const roleName = '供应商资料专员'
  const account = 'supplier-editor'
  const password = 'editor789'
  const monitor = monitorPageErrors(page)

  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.nav-item').filter({ hasText: '角色管理' }).click()
  await page.locator('.head-actions .button.primary').filter({ hasText: '新增角色' }).click()
  const rolePage = page.locator('.work-page')
  await rolePage.locator('.field').filter({ hasText: '角色编码' }).locator('input').fill('supplier_editor')
  await rolePage.locator('.field').filter({ hasText: '角色名称' }).locator('input').fill(roleName)
  await rolePage.locator('.permission-grid').first().getByText('供应商管理', { exact: true }).click()
  const supplierPermissions = rolePage.locator('.permission-group').filter({ hasText: '供应商管理' })
  await supplierPermissions.locator('.permission-grid.actions').getByText('修改供应商', { exact: true }).click()
  await rolePage.locator('.work-page-actions .button.primary').click()
  await expect(rolePage).toBeHidden()

  await page.locator('.nav-item').filter({ hasText: '账号管理' }).click()
  await page.locator('.head-actions .button.primary').filter({ hasText: '新增账号' }).click()
  const accountPage = page.locator('.work-page')
  await accountPage.locator('.field').filter({ hasText: '登录账号' }).locator('input').fill(account)
  await accountPage.locator('.field').filter({ hasText: '初始密码' }).locator('input').fill(password)
  await accountPage.locator('.field').filter({ hasText: '姓名' }).locator('input').fill('联调资料专员')
  const roleSelect = accountPage.locator('.field').filter({ hasText: '角色' }).locator('.searchable-select')
  await roleSelect.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: roleName, exact: true }).click()
  await accountPage.locator('.work-page-actions .button.primary').click()
  await expect(accountPage).toBeHidden()
  await page.locator('.logout-button').click()

  await page.locator('.login-field input').nth(0).fill(account)
  await page.locator('.login-field input').nth(1).fill(password)
  await page.locator('.login-button').click()
  await expect(page.locator('.admin-shell')).toBeVisible()
  await expect(page.locator('.nav-item').filter({ hasText: '供应商管理' })).toBeVisible()
  await expect(page.locator('.nav-item').filter({ hasText: '角色管理' })).toHaveCount(0)
  await expect(page.locator('.nav-item').filter({ hasText: '账号管理' })).toHaveCount(0)
  await page.locator('.nav-item').filter({ hasText: '供应商管理' }).click()
  const firstPending = page.locator('.supplier-grid').filter({ hasText: '待认证 · 待处理' }).first()
  await expect(firstPending.locator('.row-actions uni-button').filter({ hasText: '修改' })).toBeVisible()
  await expect(firstPending.locator('.row-actions uni-button').filter({ hasText: '通过' })).toHaveCount(0)
  await expect(firstPending.locator('.row-actions uni-button').filter({ hasText: '驳回' })).toHaveCount(0)
  await assertNoPageOverflow(page)
  monitor.assertClean()
})


test('shared supplier settlement is visible in the supplier workbench', async ({ page }) => {
  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.nav-item').filter({ hasText: '佣金结算' }).click()
  await page.locator('.head-actions uni-button').filter({ hasText: '供应商结算' }).click()
  const settlementDialog = page.locator('.uni-modal').filter({ hasText: '确认结算全部合作供应商的未结订单？' })
  await expect(settlementDialog).toBeVisible()
  await settlementDialog.getByText('OK', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('agritainment-platform-supplier-settlements') || '{}') as Record<string, { items?: Array<{ supplierId: string }> }>
    return Object.values(records).some((record) => record.items?.some((item) => item.supplierId === 'S002'))
  })).toBe(true)
  await page.locator('.filter-chips uni-button').filter({ hasText: '供应商结算' }).click()
  await expect(page.locator('.settlement-history').filter({ hasText: '供应商结算记录' })).toContainText('湘西腊味合作社')

  await page.goto('/supplier/')
  await loginSupplier(page, '13787366688', '13787366688')
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.work-link').filter({ hasText: '结算账单' }).click()
  await expect.poll(() => page.locator('.list-card').count(), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(page.locator('.list-card').first()).toContainText('关联订单')
})

test('admin farm changes refresh the production dashboard and keep unresolved stores off the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '驾驶舱同源联动仅需在桌面视口执行一次')
  await page.goto('/dashboard/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-panel input').nth(0).fill('leader')
  await page.locator('.login-panel input').nth(1).fill('123456')
  await page.getByRole('button', { name: '登录驾驶舱' }).click()
  const storeKpi = page.locator('.kpi').filter({ hasText: '门店总数' })
  await expect(storeKpi.locator('strong')).toHaveText('30')
  await expect(page.locator('.map-legend')).toContainText('城市聚合 14')

  const adminPage = await page.context().newPage()
  await adminPage.goto('/admin/')
  await adminPage.locator('.login-field input').nth(0).fill('admin')
  await adminPage.locator('.login-field input').nth(1).fill('123456')
  await adminPage.locator('.login-button').click()
  await adminPage.locator('.nav-item').filter({ hasText: '农家乐管理' }).click()
  await adminPage.locator('.head-actions .button.primary').filter({ hasText: '新增农家乐门店' }).click()
  const modal = adminPage.locator('.modal')
  await modal.locator('.field').filter({ hasText: '门店名称' }).locator('input').fill('同源未定位门店')
  const selectFarmRegion = async (fieldLabel: string, optionLabel: string) => {
    const select = modal.locator('.field').filter({ hasText: fieldLabel }).locator('.searchable-select')
    await select.locator('.searchable-select__trigger').click()
    await adminPage.getByRole('option', { name: optionLabel, exact: true }).click()
  }
  await selectFarmRegion('城市', '长沙市')
  await selectFarmRegion('县区', '岳麓区')
  await modal.locator('.field').filter({ hasText: '详细地址' }).locator('input').fill('联调路 1 号')
  await modal.locator('.modal-actions .button.primary').click()
  await expect(modal).toBeHidden()

  await expect(storeKpi.locator('strong')).toHaveText('31', { timeout: 3_000 })
  await expect(page.locator('.map-legend')).toContainText('城市聚合 14')
  await expect(page.locator('.map-legend')).toContainText('未定位 1')
  await adminPage.close()
})

test('user withdrawal review synchronizes approval and rejection across portals', async ({ page }) => {
  const userId = 'U-INTEGRATION-WITHDRAW'
  const openid = 'openid-integration-withdraw'
  const commissionKey = 'agritainment-platform-c-commissions'
  const withdrawalKey = 'agritainment-platform-withdrawals'
  const profileKey = 'agritainment-platform-c-distributors'
  const linksKey = 'agritainment-platform-user-links'

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.evaluate(({ userId, openid, commissionKey, withdrawalKey, profileKey, linksKey }) => {
    ;[commissionKey, withdrawalKey, profileKey, linksKey, 'agritainment-mock-openid'].forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('agritainment-mock-openid', openid)
    localStorage.setItem(linksKey, JSON.stringify({ [openid]: userId }))
    localStorage.setItem(profileKey, JSON.stringify({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } }))
    localStorage.setItem(commissionKey, JSON.stringify([
      { id: 'CC-INTEGRATION-APPROVE', orderId: 'CO-INTEGRATION-APPROVE', subOrderId: 'CSO-INTEGRATION-APPROVE', beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 25, status: 'available', createdAt: '2026-08-01T10:00:00.000Z' }
    ]))
  }, { userId, openid, commissionKey, withdrawalKey, profileKey, linksKey })
  await page.reload()
  await loginUser(page)
  await page.evaluate(({ userId, commissionKey, profileKey }) => {
    localStorage.setItem(profileKey, JSON.stringify({ [userId]: { userId, promoterId: 'T002', level: 'level2', parentPromoterId: 'T001', status: 'active' } }))
    localStorage.setItem(commissionKey, JSON.stringify([{ id: 'CC-INTEGRATION-APPROVE', orderId: 'CO-INTEGRATION-APPROVE', subOrderId: 'CSO-INTEGRATION-APPROVE', beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 25, status: 'available', createdAt: '2026-08-01T10:00:00.000Z' }]))
  }, { userId, commissionKey, profileKey })
  await page.reload()
  await loginUser(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.me-page')).toBeVisible()
  await expect(page.locator('.commission-summary')).toContainText('¥25.00')
  await clickUserWithdrawal(page)
  await expect.poll(() => page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.values(raw).find((item: any) => item.requesterId === 'U-INTEGRATION-WITHDRAW')?.status
  }, withdrawalKey)).toBe('pending')
  const approvedRequest = await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.values(raw).find((item: any) => item.requesterId === 'U-INTEGRATION-WITHDRAW') as { id: string; amount: number } | undefined
  }, withdrawalKey)
  expect(approvedRequest?.amount).toBe(25)
  await expect(page.locator('.withdrawal-history')).toContainText('处理中')

  await loginAdmin(page)
  await page.locator('.nav-item').filter({ hasText: '佣金结算' }).click()
  await page.locator('.filter-chips').filter({ hasText: '提现审核' }).getByText('提现审核', { exact: true }).click()
  const approvedRow = page.locator('.withdrawal-grid').filter({ hasText: userId }).last()
  await expect(approvedRow).toContainText('¥25')
  page.once('dialog', (dialog) => dialog.accept())
  await approvedRow.getByText('通过', { exact: true }).click()
  if (await page.getByText('OK', { exact: true }).count()) await page.getByText('OK', { exact: true }).click()
  await expect.poll(() => page.evaluate(({ key, id }) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.values(raw).find((item: any) => item.id === id)?.status
  }, { key: withdrawalKey, id: approvedRequest?.id })).toBe('approved')

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.reload()
  await loginUser(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.me-page')).toBeVisible()
  await expect(page.locator('.withdrawal-history')).toContainText('已通过')
  await expect(page.locator('.commission-row').filter({ hasText: '已提现' })).toHaveCount(1)

  await page.evaluate((key) => {
    const records = JSON.parse(localStorage.getItem(key) || '[]') as Array<Record<string, unknown>>
    records.push({ id: 'CC-INTEGRATION-REJECT', orderId: 'CO-INTEGRATION-REJECT', subOrderId: 'CSO-INTEGRATION-REJECT', beneficiaryId: 'T002', beneficiaryLevel: 'level2', amount: 18, status: 'available', createdAt: '2026-08-02T10:00:00.000Z' })
    localStorage.setItem(key, JSON.stringify(records))
  }, commissionKey)
  await page.reload()
  await loginUser(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.me-page')).toBeVisible()
  await expect(page.locator('.commission-summary')).toContainText('¥18.00')
  await clickUserWithdrawal(page)
  await expect.poll(() => page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.values(raw).find((item: any) => item.requesterId === 'U-INTEGRATION-WITHDRAW' && item.status === 'pending')?.id
  }, withdrawalKey)).toBeTruthy()

  await loginAdmin(page)
  await page.locator('.nav-item').filter({ hasText: '佣金结算' }).click()
  await page.locator('.filter-chips').filter({ hasText: '提现审核' }).getByText('提现审核', { exact: true }).click()
  const rejectedRow = page.locator('.withdrawal-grid').filter({ hasText: userId }).filter({ hasText: '待审核' }).last()
  await expect(rejectedRow).toContainText('¥18')
  await rejectedRow.getByText('驳回', { exact: true }).click()
  const rejectModal = page.locator('.modal:visible')
  await rejectModal.locator('input').fill('收款资料不完整')
  await rejectModal.locator('.modal-actions .button.primary').click()
  await expect.poll(() => page.evaluate(({ key, userId }) => {
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.values(raw).find((item: any) => item.requesterId === userId && item.status === 'rejected')?.reviewedNote
  }, { key: withdrawalKey, userId })).toBe('收款资料不完整')

  await page.goto('/user/#/pages/index/index?promoter=T002')
  await page.reload()
  await loginUser(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.me-page')).toBeVisible()
  await expect(page.locator('.withdrawal-history')).toContainText('已驳回')
  await expect(page.locator('.withdrawal-history')).toContainText('收款资料不完整')
  await expect(page.locator('.commission-summary')).toContainText('¥18.00')
  await expect(page.locator('.commission-row').filter({ hasText: '二级分佣' }).filter({ hasText: '可用' })).toHaveCount(1)
})
