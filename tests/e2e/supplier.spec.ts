import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

const supplierUrl = 'http://127.0.0.1:5178/'

function trackPageErrors(page: Page) {
  const errors: string[] = []
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(`console.${message.type()}: ${message.text()}`)
  }
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  return {
    assertClean: () => expect(errors, errors.join('\n')).toEqual([]),
    dispose: () => {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
    }
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

async function login(page: Page, role: 'supplier' | 'driver') {
  await page.locator('.role-tabs uni-button').filter({ hasText: role === 'driver' ? '司机' : '供应商' }).click()
  await page.locator('.login-button').click()
  await expect(page.locator('.app-shell')).toBeVisible()
}

test('supplier workspace covers metrics, route planning and driver handovers', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(supplierUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page, 'supplier')
  await expect(page.locator('.hero-stat').filter({ hasText: '今日门店' })).toContainText('2')
  await expect(page.locator('.hero-stat').filter({ hasText: '今日件数' })).toContainText('45')
  await expect(page.locator('.hero-stat').filter({ hasText: '待发货件' })).toContainText('24')
  await expect(page.locator('.hero-stat').filter({ hasText: '缺货件数' })).toContainText('4')
  await expect(page.locator('.hero-stat').filter({ hasText: '配送中件' })).toContainText('52')
  await assertNoHorizontalOverflow(page)
  await page.locator('.tab-item').filter({ hasText: '订单' }).click()
  await expect(page.getByText('指派司机')).toHaveCount(0)
  await expect(page.getByText('改派司机')).toHaveCount(0)
  const acceptButtons = page.locator('.order-actions').getByText('接单')
  for (let index = 0; index < await acceptButtons.count(); index += 1) await acceptButtons.first().click()
  await page.locator('.tab-item').filter({ hasText: /^首页$/ }).click()
  await page.locator('.dashboard-foot .outline-button').filter({ hasText: '今日线路' }).click()
  await expect(page.locator('.secondary-workspace')).toBeVisible()
  const namedRoute = page.locator('.secondary-workspace .list-card').first()
  await expect(namedRoute).toContainText('东线')
  await namedRoute.getByText('规划').click()
  await expect(page.locator('.route-planning-map')).toBeVisible()
  await expect(page.getByText('生成路线预览')).toBeVisible()
  await page.getByText('生成路线预览').click()
  await expect(page.locator('.delivery-route-map-overlay')).toContainText('km')
  await expect(page.locator('.route-preview')).toContainText('总距离')
  await page.locator('.page-back[aria-label="返回"]').click()
  await page.locator('.page-back[aria-label="返回"]').click()
  monitor.assertClean()

  await page.locator('.hero-logout').click()
  await expect(page.locator('.login-page')).toBeVisible()
  await login(page, 'driver')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  await page.locator('.tab-item').filter({ hasText: '今日线路' }).click()
  await expect(page.locator('.delivery-route-map-overlay')).toContainText('家农家乐')
  await expect(page.locator('.delivery-route-map-overlay')).toContainText('km')
  await expect(page.locator('.driver-route .route-stop')).toHaveCount(2)
  await expect(page.locator('.driver-route').getByText('到店打卡').first()).toBeVisible()
  const todayTasks = page.locator('.page-pad .list-card')
  await expect(todayTasks.first()).toBeVisible()
  await expect(todayTasks.first().locator('.distance-text')).toHaveText(/约 \d+\.\d+ km|距离待补充|分段 /)
  await page.evaluate(() => {
    const pageWithNavigation = window as typeof window & { __navigationUrl?: string }
    pageWithNavigation.__navigationUrl = undefined
    pageWithNavigation.open = (url?: string | URL) => {
      pageWithNavigation.__navigationUrl = url?.toString()
      return null
    }
  })
  await todayTasks.first().locator('.task-nav').click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navigationUrl?: string }).__navigationUrl || '')).toContain('apis.map.qq.com/uri/v1/routeplan?')
  const navigationUrl = await page.evaluate(() => (window as typeof window & { __navigationUrl?: string }).__navigationUrl || '')
  expect(navigationUrl).toContain('tocoord=28.6267%2C109.8542')
  expect(navigationUrl).toContain('%E7%9F%B3%E6%9D%BF%E6%BA%AA')
  await page.locator('.tab-item').filter({ hasText: /^我的$/ }).click()
  const handovers = page.locator('.list-card')
  await expect(handovers.filter({ hasText: 'SO-S005' })).toContainText('石板溪农家乐·门店')
  await expect(handovers.filter({ hasText: 'SO-S017' })).toContainText('云上人家·门店')
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()

  await page.locator('.hero-logout').click()
  await expect(page.locator('.login-page')).toBeVisible()
  await login(page, 'supplier')
  await expect(page.locator('.tab-item')).toHaveCount(4)
  await page.locator('.dashboard-foot .outline-button').filter({ hasText: '司机管理' }).click()
  await expect(page.locator('.secondary-workspace')).toBeVisible()
  await expect(page.locator('.page-back[aria-label="返回"]')).toBeVisible()
  expect(await page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    const workspace = document.querySelector('.secondary-workspace')
    const back = document.querySelector('.page-back[aria-label="返回"]')
    if (!shell || !workspace || !back) return false
    const frame = shell.getBoundingClientRect()
    const area = workspace.getBoundingClientRect()
    const button = back.getBoundingClientRect()
    return area.left >= frame.left - 1 && area.right <= frame.right + 1
      && button.left >= frame.left - 1 && button.right <= frame.right + 1
      && button.width > 0 && button.height > 0
  })).toBe(true)
  const driverCard = page.locator('.list-card').filter({ hasText: '张伟' }).first()
  await driverCard.locator('.outline-button').filter({ hasText: '停用' }).click()
  await expect(page.locator('.driver-form-sheet')).toContainText(/有 \d+ 个进行中任务/)
  await expect(page.locator('.driver-form-sheet')).toContainText('建议先改派')
  await page.locator('.sheet-actions .outline-button').filter({ hasText: '取 消' }).click()
  await expect(page.locator('.driver-form-sheet')).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()
  monitor.dispose()
})
