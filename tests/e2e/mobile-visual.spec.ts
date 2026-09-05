import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { assertCenteredButtonContent, assertFixedLayerWithinViewport, assertNoClippedText, assertNoPageOverflow, assertNoRepeatedElementOverlap, assertNoUnexpectedOverlap, assertReadableText } from './layout'

const viewports = [
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
  await page.locator('.login-sheet .primary-button').click()
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
  await page.setViewportSize(viewports[1])
  await reset(page, 'http://127.0.0.1:8792')
  await loginFarmhouseManager(page)
  await page.locator('.tabbar uni-button').nth(3).click()

  const workspaces = [
    ['订单核销', 'verify'],
    ['设计特色包厢', 'design-rooms'],
    ['设计招牌土菜', 'design-foods'],
    ['设计体验项目', 'design-experiences'],
    ['选品上架', 'select'],
    ['店员管理', 'staff-admin']
  ] as const
  const mineViews = [
    ['我的订单', 'orders'],
    ['我的预订', 'bookings'],
    ['储值记录', 'ledger'],
    ['设置与帮助', 'help']
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
  await auditTabs(page, '.tabbar .tab-item', 4, testInfo, 'supplier')
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
    ['仓点设置', 'workspace-warehouse'],
    ['账号信息', 'workspace-account']
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
