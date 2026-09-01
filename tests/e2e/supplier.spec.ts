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

test('supplier workspace covers metrics, driver handovers and reassignment warning', async ({ page }) => {
  const monitor = trackPageErrors(page)
  await page.goto(supplierUrl)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await login(page, 'supplier')
  await expect(page.locator('.hero-stat').filter({ hasText: '今日缺货' })).toContainText('2')
  await assertNoHorizontalOverflow(page)
  monitor.assertClean()

  await page.locator('.hero-logout').click()
  await expect(page.locator('.login-page')).toBeVisible()
  await login(page, 'driver')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  await page.locator('.tab-item').filter({ hasText: '今日线路' }).click()
  const todayTasks = page.locator('.page-pad .list-card')
  await expect(todayTasks.first()).toBeVisible()
  await expect(todayTasks.first().locator('.distance-text')).toHaveText(/约 \d+\.\d+ km|距离待补充/)
  await page.evaluate(() => {
    const pageWithNavigation = window as typeof window & { __navigationUrl?: string }
    pageWithNavigation.__navigationUrl = undefined
    pageWithNavigation.open = (url?: string | URL) => {
      pageWithNavigation.__navigationUrl = url?.toString()
      return null
    }
  })
  await todayTasks.first().locator('.task-nav').click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __navigationUrl?: string }).__navigationUrl || '')).toContain('uri.amap.com/navigation?to=')
  const navigationUrl = await page.evaluate(() => (window as typeof window & { __navigationUrl?: string }).__navigationUrl || '')
  expect(navigationUrl).toContain('109.8542,28.6267')
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
