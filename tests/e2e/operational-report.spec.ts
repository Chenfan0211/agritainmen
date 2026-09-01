import { expect, test } from '@playwright/test'

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.login-button')).toBeVisible()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.admin-shell')).toBeVisible()
}

async function selectOption(select: import('@playwright/test').Locator, page: import('@playwright/test').Page, name: string) {
  await select.locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function loginFarmhouseManager(page: import('@playwright/test').Page) {
  await page.locator('.tabbar uni-button').nth(3).click()
  await page.locator('.login-prompt .primary-button').click()
  await page.locator('.login-sheet .primary-button').click()
  await expect(page.locator('.member-hero')).toBeVisible()
  await page.locator('.roles uni-button', { hasText: '店长' }).click()
}

test('admin operational report filters, dimensions and exports current rows', async ({ page }) => {
  await page.goto('/admin/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.login-field input').nth(0).fill('admin')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await page.locator('.nav-item').filter({ hasText: '经营报表' }).click()
  await expect(page.locator('.report-panel')).toBeVisible()
  await expect(page.locator('.report-summary')).toContainText('有效订单')
  await page.locator('.report-filters .field').filter({ hasText: '开始日期' }).locator('input').fill('2026-08-01')
  await page.locator('.report-filters .field').filter({ hasText: '结束日期' }).locator('input').fill('2026-08-31')
  await page.locator('.report-filters .field').filter({ hasText: '聚合维度' }).locator('.searchable-select__trigger').click()
  await page.getByRole('option', { name: '按供应商', exact: true }).click()
  await expect(page.locator('.report-grid:not(.table-head)').first()).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.head-actions .button.secondary').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('经营报表')
  const csv = await download.createReadStream()
  let content = ''
  for await (const chunk of csv || []) content += chunk.toString()
  expect(content.replace(/^\uFEFF/, '')).toContain('"聚合维度","名称","订单数","商品件数","GMV"')
  expect(content.replace(/^\uFEFF/, '').split('\n').length).toBeGreaterThan(1)
  await expect.poll(() => page.evaluate(() => {
    const logs = JSON.parse(localStorage.getItem('agritainment-platform-audit-log') || '[]') as Array<{ action?: string; metadata?: { module?: string } }>
    return logs.some((item) => item.action === 'report.export' && item.metadata?.module === '经营报表')
  })).toBe(true)
})

test('admin core layouts stay inside the 375, 768, short-desktop and wide viewports', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await loginAdmin(page)

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 900 },
    { width: 1280, height: 600 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.admin-shell')).toBeVisible()
    await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)

    const operator = await page.locator('.short-sidebar-account').boundingBox()
    const logout = await page.locator('.logout-button').boundingBox()
    expect(operator).not.toBeNull()
    expect(logout).not.toBeNull()
    expect(operator!.y + operator!.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(logout!.y + logout!.height).toBeLessThanOrEqual(viewport.height + 1)

    const categoryChart = page.locator('.chart-grid .panel').nth(1)
    const chartBox = await categoryChart.boundingBox()
    expect(chartBox).not.toBeNull()
    expect(chartBox!.x).toBeGreaterThanOrEqual(0)
    expect(chartBox!.x + chartBox!.width).toBeLessThanOrEqual(viewport.width + 1)

    await page.getByTitle('待办提醒').click()
    const drawer = await page.locator('.drawer').boundingBox()
    expect(drawer).not.toBeNull()
    expect(drawer!.width).toBeLessThanOrEqual(viewport.width)
    expect(drawer!.x + drawer!.width).toBeLessThanOrEqual(viewport.width + 1)
    await page.locator('.drawer-head .icon-button').click()

    if (viewport.width === 375) {
      await page.locator('.period-button').click()
      const toast = page.locator('.uni-sample-toast')
      await expect(toast).toBeVisible()
      const toastBox = await toast.boundingBox()
      expect(toastBox).not.toBeNull()
      const toastBottomGap = viewport.height - (toastBox!.y + toastBox!.height)
      expect(toastBottomGap).toBeGreaterThanOrEqual(15)
      expect(toastBottomGap).toBeLessThanOrEqual(32)
    }
  }

  await page.setViewportSize({ width: 375, height: 812 })
  await page.locator('.nav-item').filter({ hasText: '预约管理' }).click()
  await expect(page.locator('.booking-table-scroll')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  expect(consoleErrors).toEqual([])
})

test('admin todo navigation keeps every matching order id visible and can be cleared', async ({ page }) => {
  await loginAdmin(page)
  await page.locator('.nav-item').filter({ hasText: '订单履约' }).click()
  const orderSearch = page.locator('.module-toolbar .module-search')
  await orderSearch.locator('input').fill('不会命中任何待办订单')
  const orderSelects = orderSearch.locator('.searchable-select')
  await orderSelects.nth(0).locator('.searchable-select__trigger').click()
  await page.getByRole('option').nth(1).click()
  await selectOption(orderSelects.nth(1), page, '直播')
  await selectOption(orderSelects.nth(2), page, '已完成')
  await selectOption(orderSelects.nth(3), page, '已退款')
  await expect(page.locator('.order-grid.table-row:not(.table-head)')).toHaveCount(0)

  await page.locator('.nav-item').filter({ hasText: '数据看板' }).click()
  const todo = page.locator('.todo-row').first()
  const summary = await todo.locator('small').innerText()
  const expectedCount = Number(summary.match(/\d+/)?.[0] || 0)
  expect(expectedCount).toBeGreaterThan(1)

  await todo.click()
  const banner = page.locator('.todo-filter-banner')
  await expect(banner).toBeVisible()
  const rows = page.locator('.order-grid.table-row:not(.table-head)')
  await expect(rows).toHaveCount(expectedCount)
  const ids = await rows.locator('.order-id strong').allTextContents()
  const bannerText = await banner.innerText()
  for (const id of ids) expect(bannerText).toContain(id)

  await banner.locator('.todo-filter-clear').click()
  await expect(banner).toBeHidden()
  await expect(page.locator('.order-grid.table-row:not(.table-head)')).not.toHaveCount(expectedCount)
  await expect(orderSearch.locator('input')).toHaveValue('')
  await expect(orderSelects.nth(0).locator('.searchable-select__trigger')).toContainText('全部门店')
  await expect(orderSelects.nth(1).locator('.searchable-select__trigger')).toContainText('全部来源')
  await expect(orderSelects.nth(2).locator('.searchable-select__trigger')).toContainText('全部状态')
  await expect(orderSelects.nth(3).locator('.searchable-select__trigger')).toContainText('全部售后')
})

test('farmhouse manager verifies a confirmed shared booking from the page', async ({ page }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || '')
  await page.goto(baseURL.includes(':8791') ? 'http://127.0.0.1:8792/' : '/farmhouse/')
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('agritainment-platform-bookings', JSON.stringify({
      'B-CONFIRMED-PAGE': {
        id: 'B-CONFIRMED-PAGE', farmId: 'F001', farmName: '页面已确认预约', userId: 'U-PAGE', source: 'alliance',
        date: '2026-08-31', session: '午市 11:30', people: 4, amount: 328, status: 'confirmed', createdAt: '2026-08-30T10:00:00.000Z'
      }
    }))
  })
  await page.reload()
  await loginFarmhouseManager(page)
  await page.locator('.workbench uni-button', { hasText: '订单核销' }).click()
  const booking = page.locator('.verify-item').filter({ hasText: '页面已确认预约' })
  await expect(booking.locator('.verify-status')).toHaveText('已确认')
  await booking.locator('.verify-btn').click()
  const verifyDialog = page.locator('.uni-modal').filter({ hasText: '核销预订' })
  await expect(verifyDialog).toBeVisible()
  await verifyDialog.getByText('OK', { exact: true }).click()
  await expect(booking.locator('.verify-status')).toHaveText('已核销')
  await expect.poll(() => page.evaluate(() => {
    const bookings = JSON.parse(localStorage.getItem('agritainment-platform-bookings') || '{}') as Record<string, { status?: string; amount?: number }>
    return bookings['B-CONFIRMED-PAGE']
  })).toMatchObject({ status: 'completed', amount: 328 })
})
