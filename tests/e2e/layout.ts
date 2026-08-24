import { expect, type ConsoleMessage, type Locator, type Page } from '@playwright/test'

export function monitorPageErrors(page: Page) {
  const errors: string[] = []
  const onConsole = (message: ConsoleMessage) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) }
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  return {
    assertClean: () => expect(errors, errors.join('\n')).toEqual([]),
    dispose: () => { page.off('console', onConsole); page.off('pageerror', onPageError) }
  }
}

export async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(overflow.scrollWidth, `页面横向溢出 ${overflow.scrollWidth - overflow.width}px`).toBeLessThanOrEqual(overflow.width)
}

export async function assertFixedLayerWithinViewport(locator: Locator) {
  await expect(locator, '固定层定位器未命中唯一元素').toHaveCount(1)
  await expect(locator, '固定层不可见').toBeVisible()
  const box = await locator.boundingBox()
  expect(box, '固定层没有可测量的布局边界').not.toBeNull()
  const viewport = locator.page().viewportSize()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1)
}

export async function assertNoClippedText(locator: Locator) {
  const count = await locator.count()
  expect(count, '文字裁切定位器未命中任何元素').toBeGreaterThan(0)
  const clipped = await locator.evaluateAll((elements) => elements.filter((element) => {
    const html = element as HTMLElement
    const style = getComputedStyle(html)
    if (!html.textContent?.trim() || style.overflow === 'auto' || style.overflowX === 'auto' || style.textOverflow === 'ellipsis') return false
    return html.scrollWidth > html.clientWidth + 1 || html.scrollHeight > html.clientHeight + 1
  }).map((element) => (element.textContent || '').trim().slice(0, 80)))
  expect(clipped, clipped.join('\n')).toEqual([])
}
