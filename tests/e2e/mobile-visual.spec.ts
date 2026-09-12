import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { assertCenteredButtonContent, assertFixedLayerWithinViewport, assertNoClippedText, assertNoPageOverflow, assertNoRepeatedElementOverlap, assertNoUnexpectedOverlap, assertReadableText } from './layout'

const viewports = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 }
]

async function reset(page: Page, url: string) {
  await page.goto(url)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
}

async function waitForVisualStability(page: Page) {
  await expect(page.locator('.toast:visible, .uni-toast:visible, uni-toast:visible')).toHaveCount(0, { timeout: 3500 })
  await page.evaluate(async () => {
    await document.fonts?.ready
    const pendingImages = [...document.images]
      .filter((image) => !image.complete)
      .map((image) => new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }))
    await Promise.all(pendingImages)
  })
  await page.waitForTimeout(200)
}

async function assertMobileFrame(page: Page, width: number) {
  const layout = await page.evaluate(() => {
    const visible = (element: Element | null) => element instanceof HTMLElement && element.offsetParent !== null
    const rect = (element: Element | null) => element instanceof HTMLElement ? element.getBoundingClientRect() : null
    const shell = document.querySelector('.app-shell')
    const navigation = [...document.querySelectorAll('.tabbar, .bottom-tabs')].find(visible) || null
    const primaryButtons = [...document.querySelectorAll('.primary-button:not(.mini-button):not(.small), .primary-btn, .login-button')]
      .filter(visible)
      .map((element) => ({ text: element.textContent?.trim() || '', height: rect(element)?.height || 0 }))
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      shell: rect(shell),
      navigation: rect(navigation),
      primaryButtons
    }
  })

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  await assertNoPageOverflow(page)
  expect(layout.shell?.x || 0).toBeGreaterThanOrEqual(-1)
  expect((layout.shell?.right || 0)).toBeLessThanOrEqual(width + 1)
  if (layout.navigation) {
    expect(layout.navigation.x).toBeGreaterThanOrEqual(-1)
    expect(layout.navigation.right).toBeLessThanOrEqual(width + 1)
    expect(layout.navigation.bottom).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
  }
  for (const button of layout.primaryButtons) expect(button.height, button.text).toBeGreaterThanOrEqual(44)
  const visibleLabels = page.locator('.tab-item:visible, .sheet-title:visible, .primary-button:visible, .login-button:visible')
  if (await visibleLabels.count()) await assertNoClippedText(visibleLabels)
  const centeredButtons = page.locator('.primary-button:visible, .primary-btn:visible, .login-button:visible, .outline-button:visible, .sheet-actions > uni-button:visible, .modal-actions > uni-button:visible')
  if (await centeredButtons.count()) await assertCenteredButtonContent(centeredButtons)
  const shell = page.locator('.app-shell:visible, .operation-page:visible')
  if (await shell.count()) await assertReadableText(shell.first(), 12)
  const fixedLayer = page.locator('.sheet:visible, .sheet-panel:visible, .category-picker-sheet:visible, .bottom-sheet:visible, .drawer:visible')
  if (await fixedLayer.count() === 1) await assertFixedLayerWithinViewport(fixedLayer)
  await assertNoUnexpectedOverlap(page, [
    ['.cart-bar', '.tabbar'],
    ['.cart-bar', '.bottom-tabs'],
    ['.cart-checkout', '.tabbar'],
    ['.cart-checkout', '.bottom-tabs']
  ])
  await assertNoRepeatedElementOverlap(page, [
    ['.verify-status', '.verify-btn'],
    ['.verify-status', '.verify-amount'],
    ['.status-badge', '.order-actions button'],
    ['.live-title', '.live-title-row span']
  ])
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await waitForVisualStability(page)
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false })
}

async function scrollVisibleSheetToBottom(page: Page) {
  await page.locator('.sheet-scroll').evaluate((host) => {
    const candidates = [host, ...host.querySelectorAll<HTMLElement>('.uni-scroll-view')]
    const scrollable = candidates.find((element) => {
      const overflowY = getComputedStyle(element).overflowY
      return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight
    }) || host
    scrollable.scrollTop = scrollable.scrollHeight
  })
}

async function expectContentAboveSheetFoot(page: Page, selector: string, minimumGap = 8) {
  const bounds = await page.locator(selector).evaluate((content) => {
    const contentRect = content.getBoundingClientRect()
    const footRect = document.querySelector('.sheet-foot')?.getBoundingClientRect()
    return { contentBottom: contentRect.bottom, footTop: footRect?.top || 0 }
  })
  expect(bounds.footTop - bounds.contentBottom, `${selector} 被固定操作栏遮挡`).toBeGreaterThanOrEqual(minimumGap)
}

async function auditTabs(page: Page, selector: string, expectedCount: number, testInfo: TestInfo, prefix: string) {
  const tabs = page.locator(selector)
  await expect(tabs.first()).toBeVisible()
  await expect(tabs).toHaveCount(expectedCount)
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (let index = 0; index < expectedCount; index += 1) {
      await tabs.nth(index).click()
      await waitForVisualStability(page)
      await assertMobileFrame(page, viewport.width)
      await screenshot(page, testInfo, `${prefix}-${viewport.width}-tab-${index + 1}`)
    }
  }
}

async function loginFarmhouseManager(page: Page) {
  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.login-prompt .primary-button').click()
  await page.locator('.sheet-foot .primary-button').click()
  await expect(page.locator('.member-hero')).toBeVisible()
  await page.locator('.roles uni-button', { hasText: '店长' }).click()
}

test('farmhouse mobile views stay inside all supported widths', async ({ page }, testInfo) => {
  await reset(page, 'http://127.0.0.1:8792')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
  await auditTabs(page, '.tabbar uni-button', 4, testInfo, 'farmhouse')
})

test('farmhouse workspaces stay readable at all supported widths', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8792')
  await loginFarmhouseManager(page)
  await page.locator('.tabbar uni-button').nth(3).click()

  const workspaces = [
    ['订单核销', 'verify'],
    ['特色包厢', 'design-rooms'],
    ['招牌土菜', 'design-foods'],
    ['体验项目', 'design-experiences'],
    ['选品上架', 'select'],
    ['店员管理', 'staff-admin']
  ] as const
  const mineViews = [
    ['我的订单', 'orders'],
    ['我的预订', 'bookings'],
    ['储值记录', 'ledger'],
    ['设置帮助', 'help']
  ] as const

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const [label, view] of [...workspaces, ...mineViews]) {
      const source = workspaces.some(([item]) => item === label) ? '.workbench' : '.mine-list'
      await page.locator(`${source} uni-button`, { hasText: label }).click()
      await expect(page.locator(`[data-visual-view="${view}"]`)).toBeVisible()
      await assertMobileFrame(page, viewport.width)
      await screenshot(page, testInfo, `farmhouse-workspace-${viewport.width}-${view}`)
      await page.getByLabel('返回会员中心').click()
      await expect(page.locator('.member-hero')).toBeVisible()
    }
  }
})

test('farmhouse address, sku and checkout surfaces stay readable at all supported widths', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize(viewports[0])
  await reset(page, 'http://127.0.0.1:8792')
  await loginFarmhouseManager(page)
  await page.locator('.mine-list uni-button').filter({ hasText: '收货地址' }).click()

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.address-list .pc-empty')).toBeVisible()
    await assertMobileFrame(page, viewport.width)
    await screenshot(page, testInfo, `farmhouse-address-empty-${viewport.width}`)
  }

  await page.locator('.address-page-action uni-button').filter({ hasText: '新增收货地址' }).click()
  await expect(page.locator('.default-choice')).toHaveClass(/selected/)
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
    await screenshot(page, testInfo, `farmhouse-address-form-${viewport.width}`)
  }
  const longReceiver = 'W'.repeat(30)
  const firstInputs = page.locator('.address-form input')
  await firstInputs.nth(0).fill(longReceiver)
  await firstInputs.nth(1).fill('13800002001')
  await page.locator('.address-form textarea').fill('石板溪村 1 号')
  await page.locator('.address-page-action uni-button').filter({ hasText: '保存地址' }).click()

  await page.locator('.address-page-action uni-button').filter({ hasText: '新增收货地址' }).click()
  const secondInputs = page.locator('.address-form input')
  await secondInputs.nth(0).fill('视觉验收地址二')
  await secondInputs.nth(1).fill('13800002002')
  await page.locator('.address-form textarea').fill('梅溪湖路 2 号')
  await page.locator('.address-page-action uni-button').filter({ hasText: '保存地址' }).click()

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.address-card')).toHaveCount(2)
    await assertMobileFrame(page, viewport.width)
    const addressLayout = await page.locator('.app-shell').evaluate((shell) => ({ clientWidth: shell.clientWidth, scrollWidth: shell.scrollWidth }))
    expect(addressLayout.scrollWidth, `连续英文收货人导致地址页横向溢出 ${addressLayout.scrollWidth - addressLayout.clientWidth}px`).toBeLessThanOrEqual(addressLayout.clientWidth)
    const addressCardBounds = await page.locator('.address-card').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().toJSON()))
    for (const bounds of addressCardBounds) {
      expect(bounds.left, '地址卡左侧越出视口').toBeGreaterThanOrEqual(-1)
      expect(bounds.right, '地址卡右侧越出视口').toBeLessThanOrEqual(viewport.width + 1)
    }
    const overflowingAddressContent = await page.locator('.address-card').evaluateAll((cards) => cards.flatMap((card) => {
      const cardRect = card.getBoundingClientRect()
      return [...card.querySelectorAll('*')].flatMap((element) => {
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height || rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1) return []
        return [(element.textContent || element.tagName).trim().slice(0, 50)]
      })
    }))
    expect(overflowingAddressContent, `地址卡内容越界：${overflowingAddressContent.join('、')}`).toEqual([])
    const actionHeights = await page.locator('.address-card-actions uni-button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
    for (const height of actionHeights) expect(height).toBeGreaterThanOrEqual(44)
    await screenshot(page, testInfo, `farmhouse-address-list-${viewport.width}`)
  }

  await page.getByLabel('返回会员中心').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()
  const product = page.locator('.product-card').filter({ hasText: '湘西烟熏柴火腊肉' })
  await product.locator('.add-btn').click()
  await page.locator('.sku-options').evaluate((options) => {
    const source = options.querySelector('uni-button:last-child')
    if (!source) throw new Error('规格弹层缺少可复制的 SKU 按钮')
    for (let index = 0; index < 8; index += 1) {
      const clone = source.cloneNode(true) as HTMLElement
      clone.classList.remove('active')
      const name = clone.querySelector('uni-text span')
      if (name) name.textContent = `${index + 2}kg农家手工超长规格名称（家庭礼盒装）`
      options.appendChild(clone)
    }
  })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.sku-product-summary')).toBeVisible()
    await assertMobileFrame(page, viewport.width)
    const skuHeights = await page.locator('.sku-options uni-button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
    for (const height of skuHeights) expect(height).toBeGreaterThanOrEqual(44)
    await scrollVisibleSheetToBottom(page)
    await expectContentAboveSheetFoot(page, '.sku-options uni-button:last-child')
    await expect(page.locator('.sku-product-summary')).toBeVisible()
    await screenshot(page, testInfo, `farmhouse-sku-${viewport.width}`)
  }
  await page.locator('.sheet-foot .primary-button').filter({ hasText: '加入购物车' }).click()
  await page.locator('.cart-bar uni-button').filter({ hasText: '去结算' }).click()
  await page.locator('.cart-category-tabs uni-button').filter({ hasText: '快递直发' }).click()
  await page.locator('.cart-sheet-foot .primary-button').filter({ hasText: '去结算' }).click()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.checkout-address-card')).toContainText(longReceiver)
    await assertMobileFrame(page, viewport.width)
    await expect(page.locator('.checkout-page-foot')).toBeVisible()
    await screenshot(page, testInfo, `farmhouse-checkout-address-${viewport.width}`)
  }

  await page.locator('.checkout-address-card').click()
  const addressGroup = page.getByRole('radiogroup', { name: '选择本单收货地址' })
  const addressChoices = page.getByRole('radio')
  await expect(addressGroup).toBeVisible()
  await expect(addressChoices).toHaveCount(2)
  await expect(page.locator('.address-card[role]')).toHaveCount(0)
  await expect(addressChoices.first()).not.toContainText('编辑')
  await page.getByLabel('返回确认订单').focus()
  await page.keyboard.press('Tab')
  await expect(addressChoices.first()).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.address-card').first().locator('.address-card-actions uni-button').filter({ hasText: '编辑' })).toBeFocused()
  await addressChoices.nth(1).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-visual-view="addresses"]')).toHaveCount(0)
  await expect(page.locator('.checkout-address-card')).toContainText('视觉验收地址二')
})

test('farmhouse 320px member card and store rating keep compact text hierarchy', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[0])
  await reset(page, 'http://127.0.0.1:8792')

  const rating = page.locator('.store-summary .rating')
  const ratingIcon = rating.locator('.ui-icon')
  const ratingMetrics = await rating.evaluate((element) => {
    const icon = element.querySelector('.ui-icon')
    const ratingRect = element.getBoundingClientRect()
    const iconRect = icon?.getBoundingClientRect()
    return {
      display: icon ? getComputedStyle(icon).display : '',
      ratingTop: ratingRect.top,
      iconTop: iconRect?.top || 0,
      iconBottom: iconRect?.bottom || 0
    }
  })
  await expect(ratingIcon).toBeVisible()
  expect(ratingMetrics.display).toBe('inline-block')
  expect(ratingMetrics.iconTop).toBeGreaterThanOrEqual(ratingMetrics.ratingTop)
  expect(ratingMetrics.iconTop - ratingMetrics.ratingTop).toBeLessThan(8)

  await loginFarmhouseManager(page)
  for (const selector of ['.member-hero .lv', '.member-hero .recharge', '.member-asset-row strong']) {
    const metrics = await page.locator(selector).evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace
    }))
    expect(metrics.whiteSpace, selector).toBe('nowrap')
    expect(metrics.scrollWidth, `${selector} 内容溢出`).toBeLessThanOrEqual(metrics.clientWidth)
  }
  const uidMetrics = await page.locator('.member-hero .uid').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    whiteSpace: getComputedStyle(element).whiteSpace,
    textOverflow: getComputedStyle(element).textOverflow
  }))
  expect(uidMetrics.whiteSpace).toBe('nowrap')
  expect(uidMetrics.textOverflow).toBe('ellipsis')
  expect(uidMetrics.scrollWidth).toBeGreaterThanOrEqual(uidMetrics.clientWidth)
  await assertMobileFrame(page, viewports[0].width)
  await screenshot(page, testInfo, 'farmhouse-member-compact-320')

  for (const viewport of [viewports[1], viewports[3]]) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
})

test('farmhouse checkout falls back to pickup after removing the last courier item', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize(viewports[0])
  await reset(page, 'http://127.0.0.1:8792')
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; expressDelivery?: boolean; skus: Array<{ id: string; retailPrice: number }> }> }
    const products = catalog.products?.filter((item) => item.id === 'P001' || item.id === 'P002') || []
    const courierProduct = products.find((item) => item.id === 'P001')
    const pickupProduct = products.find((item) => item.id === 'P002')
    if (!courierProduct || !pickupProduct) throw new Error('统一目录缺少混合配送验收商品')
    courierProduct.expressDelivery = true
    pickupProduct.expressDelivery = false
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
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()

  const addProduct = async (name: string) => {
    await page.locator('.product-card').filter({ hasText: name }).locator('.add-btn').click()
    await page.locator('.sheet-foot .primary-button').filter({ hasText: '加入购物车' }).click()
  }
  await addProduct('湘西烟熏柴火腊肉')
  await addProduct('炎陵黄桃')
  await page.locator('.cart-bar uni-button').filter({ hasText: '去结算' }).click()
  await page.locator('.cart-category-tabs uni-button').filter({ hasText: '快递直发' }).click()

  const courierLine = page.locator('.sheet-line').filter({ hasText: '湘西烟熏柴火腊肉' })
  await courierLine.getByLabel('减少数量').click()
  await expect(courierLine).toHaveCount(0)
  await expect(page.locator('.cart-category-tabs')).toContainText('社区团购')

  await page.locator('.cart-sheet-foot .primary-button').filter({ hasText: '去结算' }).click()
  await expect(page.locator('.pickup-point-card')).toBeVisible()
  await page.locator('.checkout-page-foot .primary-button').filter({ hasText: '提交订单' }).click()
  await expect(page.locator('[data-visual-view="orders"]')).toBeVisible()
  const order = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('agritainment-platform-farmhouse-commerce') || '{}') as { F001?: { orders?: Array<{ delivery?: { mode?: string }; items?: Array<{ name?: string; deliveryMode?: string }> }> } }
    return state.F001?.orders?.[0] || null
  })
  expect(order).toMatchObject({
    delivery: { mode: 'pickup' },
    items: [{ deliveryMode: 'pickup' }]
  })
  expect(order?.items?.[0]?.name).toContain('炎陵黄桃')
})

test('farmhouse product detail keeps gallery, quantity controls and fixed actions visible', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize(viewports[0])
  await reset(page, 'http://127.0.0.1:8792')
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; image?: string; images?: string[]; skus?: Array<{ name: string; stock: number; retailPrice?: number; price?: number }> }> }
    const peach = catalog.products?.find((item) => item.id === 'P002')
    if (!peach || !peach.skus?.length) throw new Error('统一目录缺少详情验收商品')
    peach.images = [peach.image || '', peach.image || '', '/static/images/farmhouse.webp']
    peach.skus = peach.skus.map((sku, index) => ({ ...sku, name: index === 0 ? '5斤家庭分享装（长规格名称）' : '10斤节日礼盒家庭装（长规格名称）', stock: index === 0 ? 6 : 8 }))
    localStorage.setItem('agritainment-platform-catalog', JSON.stringify(catalog))
  })
  await page.reload()
  await page.waitForLoadState('networkidle')
  await loginFarmhouseManager(page)
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()

  const product = page.locator('.product-card').filter({ hasText: '炎陵黄桃' })
  await product.locator('.product-open').click()
  await expect(page.locator('.product-view')).toBeVisible()
  await expect(page.locator('.gallery-count')).toHaveText('1 / 2')
  await expect(page.locator('.detail-product-name')).toContainText('炎陵黄桃')
  await expect(page.locator('.product-detail-actions--fixed')).toBeVisible()
  await expect(page.locator('.tabbar')).toHaveCount(0)
  await expect(page.locator('.cart-bar')).toHaveCount(0)

  const firstPrice = await page.locator('.product-summary-card .detail-price').innerText()
  await page.locator('.gallery-arrow-next').click()
  await expect(page.locator('.gallery-count')).toHaveText('2 / 2')
  const secondSku = page.locator('.detail-sku-options uni-button').nth(1)
  await secondSku.click()
  await expect(page.locator('.product-summary-card .detail-price')).not.toHaveText(firstPrice)
  await expect(page.locator('.detail-quantity-row')).toContainText('1 件')

  const minus = page.getByLabel('减少购买数量')
  const plus = page.getByLabel('增加购买数量')
  await expect(minus).toHaveAttribute('disabled', 'true')
  await plus.click()
  await expect(page.locator('.detail-quantity-row')).toContainText('2 件')
  await assertMobileFrame(page, viewports[0].width)

  await page.locator('.product-detail-scroll').evaluate((host) => {
    const candidates = [host, ...host.querySelectorAll<HTMLElement>('.uni-scroll-view')]
    const scrollable = candidates.find((element) => element.scrollHeight > element.clientHeight) || host
    scrollable.scrollTop = scrollable.scrollHeight
  })
  const actionGap = await page.locator('.detail-gallery-section .detail-gallery-image').last().evaluate((content) => {
    const contentBottom = content.getBoundingClientRect().bottom
    const actionTop = document.querySelector('.product-detail-actions--fixed')?.getBoundingClientRect().top || 0
    return actionTop - contentBottom
  })
  expect(actionGap).toBeGreaterThanOrEqual(0)

  await page.locator('.product-detail-actions--fixed .primary-button').filter({ hasText: '立即购买' }).click()
  await expect(page.locator('[data-visual-view="checkout"]')).toBeVisible()
  await expect(page.locator('.checkout-items .checkout-line')).toHaveCount(1)
  await expect(page.locator('.checkout-items')).toContainText('炎陵黄桃')
  await expect(page.locator('.checkout-items')).toContainText('× 2')
  await page.locator('.checkout-page-foot .primary-button').click()
  await expect(page.locator('[data-visual-view="orders"]')).toBeVisible()
  await page.getByLabel('返回会员中心').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '商城' }).click()
  await expect(page.locator('.cart-bar')).toBeVisible()
  await page.locator('.cart-bar .cart-count').click()
  await expect(page.locator('.sheet-line')).toContainText('炎陵黄桃')
  await expect(page.locator('.sheet-line .stepper')).toContainText('1')
})

test('store mobile views stay inside all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8795')
  await screenshot(page, testInfo, 'store-login')
  await page.locator('.login-field input').nth(0).fill('13800000001')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
  await auditTabs(page, '.tabbar uni-button', 4, testInfo, 'store')
})

test('store product detail keeps gallery, ladder pricing and fixed ordering actions usable', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize(viewports[0])
  await reset(page, 'http://127.0.0.1:8795')
  await page.evaluate(() => {
    const catalog = JSON.parse(localStorage.getItem('agritainment-platform-catalog') || '{}') as { products?: Array<{ id: string; name: string; category: string; image?: string; images?: string[]; skus?: Array<{ id: string; name: string; image?: string; stock: number; cost: number; retailPrice: number; minimumOrderQuantity?: number }> }> }
    const product = catalog.products?.find((item) => item.id === 'P001')
    if (!product || !product.skus?.length) throw new Error('统一目录缺少门店详情验收商品')
    product.name = '湘西烟熏柴火腊肉家庭宴席分享装'
    product.category = '详情阶梯测试'
    product.images = [product.image || '', '/static/images/farmhouse.webp']
    product.skus = product.skus.map((sku, index) => ({
      ...sku,
      name: index === 0 ? '500g农家手工烟熏长规格名称' : '1kg家庭宴席分享长规格名称',
      cost: index === 0 ? 100 : 110,
      retailPrice: index === 0 ? 128 : 148,
      stock: 30,
      minimumOrderQuantity: 2
    }))
    localStorage.setItem('agritainment-platform-catalog', JSON.stringify(catalog))
    localStorage.setItem('agritainment-platform-entities', JSON.stringify({
      updatedAt: new Date().toISOString(),
      policies: {
        'DETAIL-TIER': {
          id: 'DETAIL-TIER', name: '详情阶梯价', type: 'ladder', scope: '详情阶梯测试类目', discount: 30, enabled: true,
          tiers: [
            { minQty: 1, maxQty: 2, price: 90, discountOff: 10 },
            { minQty: 3, maxQty: null, price: 80, discountOff: 20 }
          ]
        }
      }
    }))
  })
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.locator('.login-field input').nth(0).fill('13800000001')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '购物车' }).click()
  await page.locator('.cart-all').click()
  await page.locator('.cart-del').click()
  await page.locator('.tabbar uni-button').filter({ hasText: '首页' }).click()

  const product = page.locator('.product-card').filter({ hasText: '湘西烟熏柴火腊肉家庭宴席分享装' })
  await product.locator('.product-open').click()
  await expect(page.locator('.product-view')).toBeVisible()
  await expect(page.locator('.detail-gallery-count')).toBeVisible()
  await expect(page.locator('.detail-product-name')).toContainText('湘西烟熏柴火腊肉家庭宴席分享装')
  await expect(page.locator('.tabbar')).toHaveCount(0)

  for (const viewport of [viewports[0], viewports[1], viewports[3]]) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
    const controls = await page.locator('.detail-sku-option, .detail-quantity-stepper uni-button, .product-detail-bar uni-button').evaluateAll((elements) => elements.map((element) => ({ height: element.getBoundingClientRect().height, text: element.textContent?.trim() || '' })))
    for (const control of controls) expect(control.height, `${control.text} 触控高度不足`).toBeGreaterThanOrEqual(44)
    await screenshot(page, testInfo, `store-product-detail-${viewport.width}`)
  }

  const initialRetailPrice = await page.locator('.detail-retail-price').innerText()
  await page.getByLabel('下一张商品图').click()
  await expect(page.locator('.detail-gallery-count')).toContainText('2 /')
  await page.locator('.detail-sku-option').nth(1).click()
  await expect(page.locator('.detail-retail-price')).not.toHaveText(initialRetailPrice)
  await expect(page.locator('.detail-current-price del')).toContainText('¥110')
  await expect(page.locator('.detail-quantity-row')).toContainText('2 件')
  await expect(page.locator('.detail-current-price strong')).toContainText('¥90')
  await page.getByLabel('增加采购数量').click()
  await expect(page.locator('.detail-quantity-row')).toContainText('3 件')
  await expect(page.locator('.detail-current-price strong')).toContainText('¥80')
  await expect(page.locator('.detail-ladder-row.active')).toContainText('3 件以上')

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const bottomGap = await page.locator('.detail-section').last().evaluate((section) => {
    const sectionBottom = section.getBoundingClientRect().bottom
    const barTop = document.querySelector('.product-detail-bar')?.getBoundingClientRect().top || 0
    return barTop - sectionBottom
  })
  expect(bottomGap).toBeGreaterThanOrEqual(0)
  await page.locator('.detail-bar-add').click()
  await expect(page.locator('.detail-cart-badge')).toHaveText('3')
  await page.getByLabel('进入进货单').click()
  await expect(page.locator('.cart-row')).toContainText('3')
  await expect(page.locator('.cart-row-price')).toContainText('¥80')
  await expect(page.locator('.cart-footer-total')).toContainText('¥240')
})

test('user mobile views stay inside all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8797/#/pages/index/index?promoter=T002')
  await page.evaluate(() => localStorage.setItem('agritainment-user-demo-orders-disabled', '1'))
  await page.reload()
  await screenshot(page, testInfo, 'user-auth')
  await page.locator('.auth-btn').click()
  await expect(page.locator('.c-mall')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
  await auditTabs(page, '.bottom-tabs .tab-item', 4, testInfo, 'user')
})

test('supplier mobile views stay inside all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8798')
  await screenshot(page, testInfo, 'supplier-login')
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
  await auditTabs(page, '.tabbar .tab-item', 3, testInfo, 'supplier')
})

test('promoter mobile view stays inside all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8796')
  await screenshot(page, testInfo, 'promoter-login')
  await page.locator('.login-field input').nth(0).fill('13800000000')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-card .primary-button').click()
  await expect(page.locator('.promoter-head')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await assertMobileFrame(page, viewport.width)
  }
  await page.setViewportSize(viewports[1])
  await screenshot(page, testInfo, 'promoter-home')
})

test('user operation pages stay readable at all supported widths', async ({ page }, testInfo) => {
  for (const type of ['income', 'fans', 'orders', 'performance']) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.goto(`http://127.0.0.1:8797/#/pages/operations/index?type=${type}`)
      await page.waitForLoadState('networkidle')
      await assertMobileFrame(page, viewport.width)
      await screenshot(page, testInfo, `user-operation-${type}-${viewport.width}`)
    }
  }
})

test('supplier driver tabs stay readable at all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8798')
  await page.locator('.role-tabs uni-button').filter({ hasText: '司机' }).click()
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await auditTabs(page, '.tabbar .tab-item', 3, testInfo, 'supplier-driver')
})

test('supplier secondary workspaces stay readable at all supported widths', async ({ page }, testInfo) => {
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8798')
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.locator('.tabbar .tab-item').filter({ hasText: '我的' }).click()

  const workspaces = [
    ['司机管理', 'workspace-drivers'],
    ['线路规划', 'workspace-routes'],
    ['结算账单', 'workspace-settlements'],
    ['交接日志', 'workspace-handovers'],
    ['仓点设置', 'workspace-warehouse']
  ] as const

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const [label, view] of workspaces) {
      await page.locator('.work-link', { hasText: label }).click()
      await expect(page.locator(`[data-visual-view="${view}"]`)).toBeVisible()
      await assertMobileFrame(page, viewport.width)
      await screenshot(page, testInfo, `supplier-workspace-${viewport.width}-${view}`)
      await page.getByLabel('返回').click()
      await expect(page.locator('[data-visual-view="supplier-mine"]')).toBeVisible()
    }
  }
})
