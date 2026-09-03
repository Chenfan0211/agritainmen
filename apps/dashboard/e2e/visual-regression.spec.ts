import { expect, test, type Page } from '@playwright/test'

type Account = 'leader' | 'regulator' | 'service'

async function installMapStub(page: Page) {
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
      on() {}
      off() {}
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
}

async function openFreshDashboard(page: Page, account: Account, mapStub = true) {
  if (mapStub) await installMapStub(page)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.locator('.login-panel input').nth(0).fill(account)
  await page.locator('.login-panel input').nth(1).fill('123456')
  await page.getByRole('button', { name: '登录驾驶舱' }).click()
  await expect(page.locator('.dashboard-shell')).toBeVisible()
}

async function expectInsideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
}

async function expectNoViewportOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight
  }))
  expect(size.width).toBeLessThanOrEqual(size.clientWidth)
  expect(size.height).toBeLessThanOrEqual(size.clientHeight)
}

test('keeps Tencent SDK and key errors inside the map component', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openFreshDashboard(page, 'leader', false)

  await expect(page.locator('.map-chart .map-state-error')).toContainText('腾讯地图 JS Key 未配置')
  await expect(page.locator('.dashboard-shell > [role="alert"]')).toHaveCount(0)
  await expect(page.locator('.data-error-strip')).toHaveCount(0)
})

test('shows page data errors in flow without covering KPI cards at 1366x768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openFreshDashboard(page, 'leader')
  await page.evaluate(() => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('全屏权限被浏览器拒绝'))
    })
  })
  await page.getByTitle('切换全屏').click()

  const alert = page.locator('.data-error-strip')
  await expect(alert).toContainText('全屏权限被浏览器拒绝')
  const alertBox = await alert.boundingBox()
  const kpiBox = await page.locator('.kpi-grid').boundingBox()
  expect(alertBox).not.toBeNull()
  expect(kpiBox).not.toBeNull()
  expect(alertBox!.y + alertBox!.height).toBeLessThanOrEqual(kpiBox!.y)
  await expectInsideViewport(page, '.data-error-strip')
  await expectNoViewportOverflow(page)
})

const moduleCases: Array<{ account: Account; module: string; view: string }> = [
  { account: 'leader', module: '综合总览', view: '.main-grid' },
  { account: 'leader', module: '区域对比', view: '[data-module-view="regional-comparison"]' },
  { account: 'regulator', module: '监管监测', view: '[data-module-view="regulatory-monitoring"]' },
  { account: 'service', module: '产业赋能', view: '[data-module-view="industry-empowerment"]' }
]

for (const scenario of moduleCases) {
  test(`keeps ${scenario.module} inside 1280x600`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await openFreshDashboard(page, scenario.account)
    if (scenario.module !== '综合总览') await page.getByRole('button', { name: scenario.module }).click()

    await expect(page.locator(scenario.view)).toBeVisible()
    await expectInsideViewport(page, scenario.view)
    await expectNoViewportOverflow(page)
    await testInfo.attach(`${scenario.module}-1280x600`, { body: await page.screenshot(), contentType: 'image/png' })
  })
}

test('keeps all regulatory metrics visible and table headings subordinate at 1280x600', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await openFreshDashboard(page, 'regulator')
  await page.getByRole('button', { name: '监管监测' }).click()

  const panel = await page.locator('.regulatory-metrics-panel').boundingBox()
  const metrics = await page.locator('.control-grid > *').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }))
  const headings = await page.locator('.risk-table.table-head > *').evaluateAll((elements) => elements.map((element) => ({
    color: getComputedStyle(element).color,
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize)
  })))

  expect(panel).not.toBeNull()
  expect(metrics).toHaveLength(6)
  metrics.forEach((metric) => {
    expect(metric.top).toBeGreaterThanOrEqual(panel!.y)
    expect(metric.bottom).toBeLessThanOrEqual(panel!.y + panel!.height + 0.5)
  })
  headings.forEach((heading) => {
    expect(heading.fontSize).toBeLessThanOrEqual(13)
    expect(heading.color).not.toBe('rgb(242, 100, 100)')
  })
})

test('keeps compact overview risk labels and regional growth values readable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await openFreshDashboard(page, 'leader')

  const riskLabel = page.locator('.risk-level').first()
  const riskLabelMetrics = await riskLabel.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    lineCount: (() => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length })(),
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth
  }))
  expect(riskLabelMetrics.lineCount).toBe(1)
  expect(riskLabelMetrics.scrollHeight).toBeLessThanOrEqual(riskLabelMetrics.clientHeight)
  expect(riskLabelMetrics.scrollWidth).toBeLessThanOrEqual(riskLabelMetrics.clientWidth)

  await page.getByRole('button', { name: '区域对比' }).click()
  const growthMetrics = await page.locator('.region-table-scroll .region-table b').evaluateAll((elements) => elements.map((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })))
  growthMetrics.forEach((growth) => expect(growth.scrollWidth).toBeLessThanOrEqual(growth.clientWidth))
})

test('keeps definitions, risk and farm overlays usable at compact height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await openFreshDashboard(page, 'regulator')

  await page.getByTitle('指标口径').click()
  await expectInsideViewport(page, '.definition-dialog')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '监管监测' }).click()
  const risk = page.locator('.risk-table-button').first()
  if (await risk.count()) {
    await risk.click()
    await expectInsideViewport(page, '.risk-drawer')
    await page.keyboard.press('Escape')
  }

  await page.getByRole('button', { name: '综合总览' }).click()
  await page.locator('.map-chart .point-farm').first().click()
  await expectInsideViewport(page, '.farm-drawer')
  await expectNoViewportOverflow(page)
})

test('drills from city bubble to authorized farm points without changing map contracts', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openFreshDashboard(page, 'leader')
  await page.getByRole('button', { name: '区域对比' }).click()
  await page.locator('.module-map-panel .point-city').first().click()

  await expect(page.getByLabel('市州范围')).not.toHaveValue('')
  await expect(page.locator('.module-map-panel .point-farm')).not.toHaveCount(0)
  await expect(page.locator('.module-map-panel .tencent-map-shell')).toBeVisible()
})
