import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

const userUrl = 'http://127.0.0.1:5179/#/pages/index/index?promoter=T002'

function trackPageErrors(page: Page) {
  const errors: string[] = []
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  }
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  return { assertClean: () => expect(errors, errors.join('\n')).toEqual([]), dispose: () => { page.off('console', onConsole); page.off('pageerror', onPageError) } }
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

async function login(page: Page) {
  await page.evaluate(() => localStorage.setItem('agritainment-user-demo-orders-disabled', '1'))
  await page.reload()
  await page.locator('.auth-btn').click()
  await expect(page.locator('.c-mall')).toBeVisible()
}

async function openHome(page: Page) {
  await page.locator('.tab-item').filter({ hasText: /^首页$/ }).click()
}

async function openOrders(page: Page) {
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.order-entry').click()
  await expect(page.locator('.orders-page')).toBeVisible()
}

async function openCart(page: Page) {
  await page.locator('.tab-item').filter({ hasText: '购物车' }).click()
  await expect(page.locator('.cart-page-content')).toBeVisible()
}

async function openCategory(page: Page) {
  await page.locator('.tab-item').filter({ hasText: /^分类$/ }).click()
  await expect(page.locator('.category-page')).toBeVisible()
}

async function syncSupplierShipping(page: Page, subIndex: number) {
  const supplierStatePage = await page.context().newPage()
  await supplierStatePage.goto(userUrl)
  await supplierStatePage.evaluate((index) => {
    const orderState = JSON.parse(localStorage.getItem('agritainment-platform-c-orders') || '{}')
    const order = Object.values(orderState)[0] as { subOrders: Array<{ id: string }> }
    const sub = order.subOrders[index]
    const platformOrders = JSON.parse(localStorage.getItem('agritainment-platform-orders') || '{}')
    const supplierOrder = platformOrders[`C-MALL-${sub.id}`]
    supplierOrder.status = 'shipping'
    supplierOrder.trackingNo = `SF-E2E-${index + 1}`
    supplierOrder.supplierFulfillment.status = 'shipped'
    supplierOrder.supplierFulfillment.shipType = 'courier'
    supplierOrder.supplierFulfillment.trackingNo = supplierOrder.trackingNo
    supplierOrder.logistics = [...(supplierOrder.logistics || []), { time: new Date().toISOString(), title: '运输中', detail: '供应商已写回快递物流' }]
    platformOrders[supplierOrder.id] = supplierOrder
    localStorage.setItem('agritainment-platform-orders', JSON.stringify(platformOrders))
  }, subIndex)
  await supplierStatePage.close()
  await openOrders(page)
}

test('user C mall covers pricing, checkout, fulfillment, commission and live entry', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(userUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page)

  await expect(page.locator('.product-card').first().locator('.product-price')).toContainText('45.00')
  await page.locator('.product-card').first().click()
  await expect(page.locator('.detail-price')).toContainText('45.00')
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.switch-option')).toHaveCount(0)
  await expect(page.locator('.profile-role')).toContainText('普通用户')
  await openHome(page)
  await expect(page.locator('.product-card').first().locator('.product-price')).toContainText('45.00')
  await page.locator('.product-card').filter({ hasText: '炎陵黄桃鲜果礼盒' }).first().click()
  await expect(page.locator('.detail-price')).toContainText('52.00')
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await expect(page.locator('.tab-icon-wrap small')).toContainText('2')
  await openCart(page)
  await page.locator('.cart-checkout').getByText('去结算', { exact: true }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const addressInputs = page.locator('.address-form input')
  await addressInputs.nth(0).fill('李女士')
  await addressInputs.nth(1).fill('13800000000')
  await addressInputs.nth(2).fill('湖南省湘西州')
  await addressInputs.nth(3).fill('测试地址 1 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '李女士' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  await expect(page.locator('.orders-page')).toBeVisible()
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('c-orders')).map(([, value]) => value).join(''))).toContain('level2')
  const order = page.locator('.order-card').first()
  await expect(order.locator('.sub-order')).toHaveCount(2)
  await expect(order).toContainText('待支付')
  await order.locator('.primary-small').filter({ hasText: '模拟支付' }).click()
  await expect(order).toContainText('备货中')
  const firstSub = order.locator('.sub-order').nth(0)
  const secondSub = order.locator('.sub-order').nth(1)
  await firstSub.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('等待发货')
  await expect(page.locator('.logistics-content')).toContainText('暂无运单号')
  await page.locator('.sheet-head uni-button').click({ force: true })
  await syncSupplierShipping(page, 0)
  const refreshedOrder = page.locator('.order-card').first()
  const refreshedFirstSub = refreshedOrder.locator('.sub-order').nth(0)
  const refreshedSecondSub = refreshedOrder.locator('.sub-order').nth(1)
  await expect(refreshedFirstSub).toContainText('已发货')
  await expect(refreshedFirstSub).toContainText('SF-E2E-1')
  await refreshedFirstSub.locator('.outline-small').filter({ hasText: '查看物流' }).click()
  await expect(page.locator('.logistics-content')).toContainText('运输中')
  await page.locator('.sheet-head uni-button').click({ force: true })
  await refreshedFirstSub.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await expect(refreshedFirstSub).toContainText('已收货')
  await syncSupplierShipping(page, 1)
  const receivedOrder = page.locator('.order-card').first()
  const receivedSecondSub = receivedOrder.locator('.sub-order').nth(1)
  await receivedSecondSub.locator('.primary-small').filter({ hasText: '确认收货' }).click()
  await expect(receivedSecondSub).toContainText('已收货')
  const level2Commissions = await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('agritainment-platform-c-commissions') || '[]') as Array<{ beneficiaryId: string; amount: number; status: string }>
    return records.filter((item) => item.beneficiaryId === 'T002')
  })
  expect(level2Commissions).toHaveLength(2)
  expect(level2Commissions.reduce((sum, item) => sum + item.amount, 0)).toBe(27)
  expect(level2Commissions.every((item) => item.status === 'available')).toBe(true)
  await openOrders(page)
  await receivedOrder.locator('.sub-order').nth(0).locator('.outline-small').filter({ hasText: '申请售后' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交售后申请' }).click()
  await expect(receivedOrder).toContainText('部分售后')
  await page.reload()
  await expect(page.locator('.c-mall')).toBeVisible()
  await openOrders(page)
  await expect(page.locator('.order-card').first()).toContainText('部分售后')
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; skus: Array<{ id: string; retailPrice: number }> }> }
    const product = catalog.products?.find((item) => item.id === 'P007')
    if (!product) return
    localStorage.setItem('agritainment-platform-store-catalog-selections', JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      selections: [{ storeId: 'F001', productId: product.id, listed: true, skuRetailPrices: Object.fromEntries(product.skus.map((sku) => [sku.id, sku.retailPrice])), updatedAt: new Date().toISOString() }]
    }))
  })
  await page.goto(`${userUrl}&live=L001`)
  await page.reload()
  await expect(page.locator('.c-mall')).toBeVisible()
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.live-entry').click()
  await expect(page.locator('.live-room')).toBeVisible()
  await expect(page.locator('.live-room')).toContainText('立即购买')
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('user C mall filters catalog and manages addresses', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(userUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page)

  await page.locator('.search-input input').fill('黄桃')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('.product-name')).toContainText('黄桃')
  await page.locator('.search-input input').fill('')
  await openCategory(page)
  await page.locator('.category-item').filter({ hasText: '生鲜水果' }).click()
  await expect(page.locator('.product-card')).toHaveCount(1)

  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.settings-list > uni-view').first().click()
  await expect(page.locator('.address-content')).toBeVisible()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const inputs = page.locator('.address-form input')
  await inputs.nth(0).fill('王女士')
  await inputs.nth(1).fill('13900000000')
  await inputs.nth(2).fill('湖南省长沙市')
  await inputs.nth(3).fill('测试街道 2 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await expect(page.locator('.address-row')).toContainText('王女士')
  await expect(page.locator('.address-row')).toContainText('默认')
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const secondInputs = page.locator('.address-form input')
  await secondInputs.nth(0).fill('张先生')
  await secondInputs.nth(1).fill('13700000000')
  await secondInputs.nth(2).fill('湖南省衡阳市')
  await secondInputs.nth(3).fill('测试街道 3 号')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await expect(page.locator('.address-row')).toHaveCount(2)
  await page.locator('.address-row').filter({ hasText: '王女士' }).click()
  await expect(page.locator('.address-content')).toBeVisible()
  await page.locator('.sheet-head uni-button').click()

  await openHome(page)
  await page.locator('.product-card').first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await openCart(page)
  await page.locator('.cart-checkout').getByText('去结算', { exact: true }).click()
  await page.locator('.address-select').click()
  await page.locator('.address-row').filter({ hasText: '王女士' }).click()
  await expect(page.locator('.checkout-content')).toContainText('王女士')
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('authorized identity ignores URL userId and isolates carts by openid', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(`${userUrl}&userId=U-MALICIOUS`)
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('agritainment-mock-openid', 'openid-e2e-a')
  })
  await page.reload()
  await login(page)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await expect(page.locator('.profile-id')).not.toContainText('U-MALICIOUS')
  await openHome(page)
  await page.locator('.product-card').first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.settings-list > uni-view').last().click()
  await expect(page.locator('.auth-page')).toBeVisible()

  await page.evaluate(() => localStorage.setItem('agritainment-mock-openid', 'openid-e2e-b'))
  await page.reload()
  await login(page)
  await expect(page.locator('.tab-icon-wrap small')).toHaveCount(0)
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  await page.locator('.settings-list > uni-view').last().click()
  await page.evaluate(() => localStorage.setItem('agritainment-mock-openid', 'openid-e2e-a'))
  await page.reload()
  await login(page)
  await expect(page.locator('.tab-icon-wrap small')).toContainText('1')
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})

test('paid and shipped sub-order after-sale apply different inventory rules', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(userUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page)

  await page.locator('.product-card').filter({ hasText: '湘西烟熏柴火腊肉' }).first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await page.locator('.product-card').filter({ hasText: '炎陵黄桃鲜果礼盒' }).first().click()
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await openCart(page)
  await page.locator('.cart-checkout').getByText('去结算', { exact: true }).click()
  await page.locator('.address-select').click()
  await page.locator('.primary-btn').filter({ hasText: '新增地址' }).click()
  const inputs = page.locator('.address-form input')
  await inputs.nth(0).fill('售后测试')
  await inputs.nth(1).fill('13800000000')
  await inputs.nth(2).fill('湖南省长沙市')
  await inputs.nth(3).fill('售后测试地址')
  await page.locator('.primary-btn').filter({ hasText: '保存地址' }).click()
  await page.locator('.address-row').filter({ hasText: '售后测试' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交订单' }).click()
  await page.locator('.order-card').first().locator('.primary-small').filter({ hasText: '模拟支付' }).click()

  const inventoryKey = 'agritainment-platform-catalog'
  const stockBeforeAfterSale = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}')
    return state.products.flatMap((product: { skus: { id: string; stock: number }[] }) => product.skus).map((sku: { id: string; stock: number }) => [sku.id, sku.stock])
  }, inventoryKey)
  const order = page.locator('.order-card').first()
  const paidSub = order.locator('.sub-order').nth(0)
  const shippedSub = order.locator('.sub-order').nth(1)
  await paidSub.locator('.outline-small').filter({ hasText: '申请售后' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交售后申请' }).click()
  await expect(paidSub).toContainText('售后处理中')
  const stockAfterPaidAfterSale = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}')
    return state.products.flatMap((product: { skus: { id: string; stock: number }[] }) => product.skus).map((sku: { id: string; stock: number }) => [sku.id, sku.stock])
  }, inventoryKey)
  expect(stockAfterPaidAfterSale).not.toEqual(stockBeforeAfterSale)

  await syncSupplierShipping(page, 1)
  const refreshedOrder = page.locator('.order-card').first()
  const refreshedShippedSub = refreshedOrder.locator('.sub-order').nth(1)
  const stockAfterShip = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}')
    return state.products.flatMap((product: { skus: { id: string; stock: number }[] }) => product.skus).map((sku: { id: string; stock: number }) => [sku.id, sku.stock])
  }, inventoryKey)
  await refreshedShippedSub.locator('.outline-small').filter({ hasText: '申请售后' }).click()
  await page.locator('.primary-btn').filter({ hasText: '提交售后申请' }).click()
  await expect(refreshedShippedSub).toContainText('售后处理中')
  const stockAfterShippedAfterSale = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}')
    return state.products.flatMap((product: { skus: { id: string; stock: number }[] }) => product.skus).map((sku: { id: string; stock: number }) => [sku.id, sku.stock])
  }, inventoryKey)
  expect(stockAfterShippedAfterSale).toEqual(stockAfterShip)
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})


test('homepage live room purchases a package and shows seeded demo orders', async ({ page }) => {
  await page.goto(userUrl + '&live=L001')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.auth-btn').click()
  await expect(page.locator('.c-mall')).toBeVisible()

  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; productType: string; skus: Array<{ id: string; retailPrice: number }> }> }
    const product = catalog.products?.find((item) => item.id === 'P007' && item.productType === 'package')
    if (!product) return
    localStorage.setItem('agritainment-platform-store-catalog-selections', JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      selections: [{ storeId: 'F001', productId: 'P007', listed: true, skuRetailPrices: Object.fromEntries(product.skus.map((sku) => [sku.id, sku.retailPrice])), updatedAt: new Date().toISOString() }]
    }))
  })
  await page.reload()
  await expect(page.locator('.c-mall')).toBeVisible()
  await expect(page.locator('.live-card')).toBeVisible()
  await page.locator('.live-card-enter').click()
  await expect(page.locator('.live-room')).toBeVisible()
  await expect(page.locator('.live-room')).toContainText('立即购买')
  await page.locator('.live-buy-btn').first().click()
  await expect.poll(() => page.evaluate(() => {
    const vouchers = JSON.parse(localStorage.getItem('agritainment-platform-vouchers') || '{}') as Record<string, { id: string; status: string }>
    return Object.values(vouchers).some((voucher) => voucher.id.startsWith('VO') && voucher.status === 'paid')
  })).toBe(true)
  await expect.poll(() => page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('agritainment-platform-commission-ledger') || '{}') as Record<string, { sourceOrderId: string; status: string }>
    return Object.values(ledger).some((entry) => entry.sourceOrderId.startsWith('VO') && entry.status === 'pending')
  })).toBe(true)
  await page.locator('.live-room [aria-label="关闭直播间"]').click()

  await openOrders(page)
  await expect(page.locator('.order-card').first()).toContainText('DEMO-ORD')
  await expect(page.locator('.demo-badge')).toHaveCount(4)
  await expect(page.locator('.voucher-card')).toBeVisible()
})

test('H5 keeps fixed controls inside the responsive phone frame', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(userUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page)

  const shell = await page.locator('.app-shell').boundingBox()
  const tabs = await page.locator('.bottom-tabs').boundingBox()
  expect(shell?.width).toBe(430)
  expect(shell?.x).toBeCloseTo((1280 - 430) / 2, 0)
  expect(tabs?.width).toBe(430)
  expect(tabs?.x).toBeCloseTo(shell!.x, 0)

  await page.locator('.product-card').first().click()
  const mask = await page.locator('.sheet-mask').boundingBox()
  expect(mask?.width).toBe(430)
  expect(mask?.x).toBeCloseTo(shell!.x, 0)
  await page.locator('.primary-btn').filter({ hasText: '加入购物车' }).click()
  await openCart(page)
  const cart = await page.locator('.cart-checkout').boundingBox()
  expect(cart).not.toBeNull()
  expect(cart!.x).toBeGreaterThanOrEqual(shell!.x)
  expect(cart!.x + cart!.width).toBeLessThanOrEqual(shell!.x + shell!.width)
  await assertNoHorizontalOverflow(page)

  await page.setViewportSize({ width: 375, height: 812 })
  const mobileShell = await page.locator('.app-shell').boundingBox()
  const mobileCart = await page.locator('.cart-checkout').boundingBox()
  expect(mobileShell?.width).toBe(375)
  expect((await page.locator('.bottom-tabs').boundingBox())?.width).toBe(375)
  expect(mobileCart).not.toBeNull()
  expect(mobileCart!.x).toBeGreaterThanOrEqual(mobileShell!.x)
  expect(mobileCart!.x + mobileCart!.width).toBeLessThanOrEqual(mobileShell!.x + mobileShell!.width)
  await assertNoHorizontalOverflow(page)
})
