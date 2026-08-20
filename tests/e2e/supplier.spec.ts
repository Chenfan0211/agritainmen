import { expect, test, type Page } from '@playwright/test'

const SUPPLIER_URL = 'http://127.0.0.1:8798'

async function reset(page: Page) {
  await page.goto(SUPPLIER_URL)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function supplierLogin(page: Page) {
  await page.locator('.role-tabs uni-button', { hasText: '供应商' }).click()
  await page.locator('.login-field input').nth(0).fill('supplier')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.supplier-shell')).toBeVisible()
}

async function driverLogin(page: Page, account: string, password = '123456') {
  await page.locator('.role-tabs uni-button', { hasText: '司机' }).click()
  await page.locator('.login-field input').nth(0).fill(account)
  await page.locator('.login-field input').nth(1).fill(password)
  await page.locator('.login-button').click()
  await expect(page.locator('.driver-shell')).toBeVisible()
}

test('supplier desktop: accepts, assigns driver, hands over with shortage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await reset(page)
  await supplierLogin(page)
  await expect(page.locator('.metric-band')).toBeVisible()

  await page.locator('.nav-item', { hasText: '配送订单' }).click()
  await page.locator('.order-actions uni-button', { hasText: '接单' }).first().click()
  await expect(page.locator('.order-actions uni-button', { hasText: '指派司机' }).first()).toBeVisible()

  await page.locator('.order-actions uni-button', { hasText: '指派司机' }).first().click()
  await page.locator('.driver-option').first().click()
  await page.locator('.sheet-actions uni-button', { hasText: '确认指派' }).click()
  await expect(page.locator('.order-card').first()).toContainText('司机 张伟')

  await page.locator('.order-actions uni-button', { hasText: '出库交接' }).first().click()
  await page.locator('.actual-input input').first().fill('0')
  await page.locator('.sheet-actions uni-button', { hasText: '确认交接' }).click()
  await expect(page.locator('.handover-result')).toContainText('缺货')
  await page.locator('.sheet-actions uni-button').last().click()
  await expect(page.locator('.order-card').first()).toContainText('缺货')

  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('driver mobile: sees today task with shortage and completes store handover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await reset(page)
  await driverLogin(page, 'driver03')

  await expect(page.locator('.task-card').first()).toContainText('SO-S007')
  await expect(page.locator('.task-card').first()).toContainText('缺货')
  await page.locator('.task-actions uni-button', { hasText: '到店交接' }).click()
  await expect(page.locator('.handover-sheet')).toContainText('石板溪')
  await page.locator('.sheet-actions uni-button', { hasText: '确认已送达门店' }).click()
  await expect(page.locator('.driver-page .empty-page')).toContainText('今日暂无配送任务')
  await expect(page.locator('.driver-metrics strong').nth(1)).toHaveText('1')

  await page.locator('.driver-tabs uni-button', { hasText: '我的交接' }).click()
  await expect(page.locator('.handover-list')).toContainText('到店交接')
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390)
})

test('supplier manages drivers: create, reassign, disable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await reset(page)
  await supplierLogin(page)

  await page.locator('.nav-item', { hasText: '司机管理' }).click()
  await page.locator('.module-toolbar uni-button', { hasText: '新增司机' }).click()
  const formInputs = page.locator('.form-fields .login-field input')
  await formInputs.nth(0).fill('测试司机')
  await formInputs.nth(1).fill('13900001111')
  await formInputs.nth(2).fill('driver99')
  await formInputs.nth(3).fill('abc123')
  await page.locator('.sheet-actions uni-button', { hasText: '创建账号' }).click()
  await expect(page.locator('.driver-list')).toContainText('driver99')
  await page.locator('.side-foot .logout-button').click()
  await driverLogin(page, 'driver99', 'abc123')

  await page.locator('.driver-head .logout-button').click()
  await supplierLogin(page)
  await page.locator('.nav-item', { hasText: '配送订单' }).click()
  const s003 = page.locator('.order-card').filter({ hasText: 'SO-S003' })
  await s003.locator('uni-button', { hasText: '改派司机' }).click()
  await page.locator('.driver-option').filter({ hasText: '李强' }).click()
  await page.locator('.sheet-actions uni-button', { hasText: '确认改派' }).click()
  await expect(s003).toContainText('司机 李强')

  await page.locator('.side-foot .logout-button').click()
  await driverLogin(page, 'driver02')
  await expect(page.locator('.task-card').filter({ hasText: 'SO-S003' })).toHaveCount(1)
  await page.locator('.driver-head .logout-button').click()
  await driverLogin(page, 'driver01')
  await expect(page.locator('.task-card').filter({ hasText: 'SO-S003' })).toHaveCount(0)

  await page.locator('.driver-head .logout-button').click()
  await supplierLogin(page)
  await page.locator('.nav-item', { hasText: '司机管理' }).click()
  await page.locator('.driver-card').filter({ hasText: 'driver01' }).locator('uni-button', { hasText: '停用' }).click()
  await page.locator('.sheet-actions uni-button', { hasText: '确认停用' }).click()
  await page.locator('.side-foot .logout-button').click()
  await page.locator('.role-tabs uni-button', { hasText: '司机' }).click()
  await page.locator('.login-field input').nth(0).fill('driver01')
  await page.locator('.login-field input').nth(1).fill('123456')
  await page.locator('.login-button').click()
  await expect(page.locator('.login-error')).toContainText('账号已停用')

  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1440)
})
