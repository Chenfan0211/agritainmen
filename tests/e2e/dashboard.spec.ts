import { expect, test } from '@playwright/test'
import { assertReadableText } from './layout'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class LatLng {
      constructor(public latitude: number, public longitude: number) {}
    }
    class LatLngBounds {
      points: LatLng[] = []
      extend(point: LatLng) { this.points.push(point); return this }
    }
    class FakeMap {
      container: HTMLElement
      constructor(container: HTMLElement) {
        this.container = container
        const base = document.createElement('div')
        base.className = 'tmap-test-base'
        base.style.cssText = 'position:absolute;inset:0;background:#102630'
        container.appendChild(base)
      }
      projectToContainer(position: LatLng) {
        return { getX: () => 100 + (position.longitude - 109) * 180, getY: () => 60 + (30 - position.latitude) * 140 }
      }
      fitBounds() {}
      setCenter() {}
      setZoom() {}
      destroy() { this.container.replaceChildren() }
    }
    class DOMOverlay {
      map: FakeMap | null
      dom: HTMLElement
      constructor(options: Record<string, unknown> & { map: FakeMap }) {
        this.map = options.map
        ;(this as unknown as { onInit(options: unknown): void }).onInit(options)
        this.dom = (this as unknown as { createDOM(): HTMLElement }).createDOM()
        this.map.container.appendChild(this.dom)
        ;(this as unknown as { updateDOM(): void }).updateDOM()
      }
      setMap(map: FakeMap | null) {
        this.map = map
        if (!map) this.dom.remove()
      }
    }
    ;(window as typeof window & { TMap?: unknown }).TMap = { Map: FakeMap, LatLng, LatLngBounds, DOMOverlay }
  })
  await page.goto('http://127.0.0.1:5182/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.dashboard-login')).toBeVisible()
})

test('rejects invalid credentials and protects direct access', async ({ page }) => {
  await page.locator('.login-panel input').nth(0).fill('leader')
  await page.locator('.login-panel input').nth(1).fill('wrong')
  await page.getByRole('button', { name: '登录驾驶舱' }).click()
  await expect(page.locator('.dashboard-login')).toBeVisible()
  await expect(page.getByText('账号或密码错误')).toBeVisible()
  await expect(page.locator('.dashboard-shell')).toHaveCount(0)
})

async function login(page: import('@playwright/test').Page, account: 'leader' | 'regulator' | 'service') {
  await page.locator('.login-panel input').nth(0).fill(account)
  await page.locator('.login-panel input').nth(1).fill('123456')
  await page.getByRole('button', { name: '登录驾驶舱' }).click()
  await expect(page.locator('.dashboard-shell')).toBeVisible()
}

test('authenticates the leader and renders authorized regional comparison', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await login(page, 'leader')

  await expect(page.getByRole('button', { name: '综合总览' })).toBeVisible()
  await expect(page.getByRole('button', { name: '区域对比' })).toBeVisible()
  await expect(page.getByRole('button', { name: '监管监测' })).toHaveCount(0)
  await expect(page.locator('.kpi')).toHaveCount(6)
  await expect(page.locator('.map-chart .tmap-test-base')).toBeVisible()
  await expect(page.locator('.map-chart .point-city')).toHaveCount(14)
  await expect(page.locator('.map-legend')).toContainText('城市聚合 14')
  await expect(page.locator('.data-demo')).toContainText('演示补全')
  await expect(page.locator('.kpi').filter({ hasText: '消费交易额' })).not.toContainText('0元')
  await expect(page.getByLabel('当前角色')).toHaveCount(0)

  await page.getByRole('button', { name: '区域对比' }).click()
  await expect(page.locator('[data-module-view="regional-comparison"]')).toBeVisible()

  await page.getByTitle('指标口径').click()
  await expect(page.getByRole('dialog', { name: '指标口径' })).toContainText('在岗店员')
  expect(errors).toEqual([])
})

test('binds regulator permissions to Changsha and shows the monitoring module', async ({ page }) => {
  await login(page, 'regulator')

  await expect(page.getByRole('button', { name: '监管监测' })).toBeVisible()
  await expect(page.getByRole('button', { name: '区域对比' })).toHaveCount(0)
  await expect(page.getByLabel('市州范围').locator('option[value=""]')).toHaveCount(0)
  await expect(page.getByLabel('市州范围')).toHaveValue('4301')

  await page.getByRole('button', { name: '监管监测' }).click()
  await expect(page.locator('[data-module-view="regulatory-monitoring"]')).toBeVisible()
  const risk = page.locator('.risk-table-button').first()
  if (await risk.count()) {
    await risk.click()
    await expect(page.getByRole('dialog', { name: '监管风险明细' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '监管风险明细' })).toHaveCount(0)
  }
})

test('loads city and district maps and returns through the authorized breadcrumb', async ({ page }) => {
  await login(page, 'leader')
  const city = page.getByLabel('市州范围')
  const district = page.getByLabel('县区范围')
  await expect(city.locator('option')).toHaveCount(15)

  await city.selectOption('4301')
  await expect(page.getByRole('heading', { name: '长沙市门店经营分布' })).toBeVisible()
  await expect(page.locator('.map-chart .tmap-test-base')).toBeVisible()
  await expect(page.locator('.map-chart .point-farm')).toHaveCount(3)
  await expect(page.locator('.map-chart .tencent-map-shell')).toHaveAttribute('aria-label', '长沙市门店经营分布')
  await page.locator('.map-chart .point-farm').last().click()
  await expect(page.getByRole('dialog', { name: '门店经营详情' })).toBeVisible()
  await page.keyboard.press('Escape')
  await district.selectOption('430104')
  await expect(page.getByRole('heading', { name: '岳麓区门店经营分布' })).toBeVisible()
  await expect(page.getByLabel('当前区域')).toContainText('湖南省')
  await expect(page.getByLabel('当前区域')).toContainText('长沙市')
  await expect(page.getByLabel('当前区域')).toContainText('岳麓区')

  await page.getByTitle('返回上级区域').click()
  await expect(city).toHaveValue('4301')
  await expect(district).toHaveValue('')
  await expect(page.getByRole('heading', { name: '长沙市门店经营分布' })).toBeVisible()
})

test('restores the session and clears it on logout', async ({ page }) => {
  await login(page, 'service')
  await page.reload()
  await expect(page.locator('.dashboard-shell')).toBeVisible()
  await expect(page.getByRole('button', { name: '产业赋能' })).toBeVisible()
  await page.getByTitle('退出登录').click()
  await expect(page.locator('.dashboard-login')).toBeVisible()
  await page.reload()
  await expect(page.locator('.dashboard-login')).toBeVisible()
})

test('shows empowerment content only to the industry service principal', async ({ page }) => {
  await login(page, 'service')

  await expect(page.getByRole('button', { name: '产业赋能' })).toBeVisible()
  await expect(page.getByRole('button', { name: '监管监测' })).toHaveCount(0)
  await page.getByRole('button', { name: '产业赋能' }).click()
  await expect(page.locator('[data-module-view="industry-empowerment"]')).toBeVisible()
})

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1280, height: 600 }]) {
  test(`keeps readable fixed panels inside ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await login(page, 'leader')
    const shell = await page.locator('.dashboard-shell').boundingBox()
    const toolbar = await page.locator('.toolbar').boundingBox()
    const bottom = await page.locator('.bottom-grid').boundingBox()
    const bodyFontSize = await page.locator('.risk-row strong').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    const auxiliaryFontSize = await page.locator('.map-footer').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))

    expect(shell).not.toBeNull()
    expect(toolbar).not.toBeNull()
    expect(bottom).not.toBeNull()
    expect(shell!.x).toBeGreaterThanOrEqual(0)
    expect(shell!.width).toBeLessThanOrEqual(viewport.width)
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(viewport.width)
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(viewport.height)
    expect(bodyFontSize).toBeGreaterThanOrEqual(12)
    expect(auxiliaryFontSize).toBeGreaterThanOrEqual(11)
    await assertReadableText(page.locator('.dashboard-shell'), 11)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height)
    await page.screenshot({ path: testInfo.outputPath(`dashboard-overview-${viewport.width}x${viewport.height}.png`), fullPage: false })
  })
}
