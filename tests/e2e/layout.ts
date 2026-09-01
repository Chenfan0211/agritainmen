import { expect, type ConsoleMessage, type Locator, type Page, type Response } from '@playwright/test'

export function monitorPageErrors(page: Page) {
  const errors: string[] = []
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error' && !/Failed to load resource: the server responded with a status of 404/i.test(message.text())) errors.push(`console.error: ${message.text()}`)
  }
  const onResponse = (response: Response) => {
    if (response.status() === 404 && !/favicon\.ico$/i.test(response.url())) errors.push(`http 404: ${response.url()}`)
  }
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`)
  page.on('console', onConsole)
  page.on('response', onResponse)
  page.on('pageerror', onPageError)
  return {
    assertClean: () => expect(errors, errors.join('\n')).toEqual([]),
    dispose: () => { page.off('console', onConsole); page.off('response', onResponse); page.off('pageerror', onPageError) }
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

export async function assertReadableText(locator: Locator, minimumPx = 11) {
  const unreadable = await locator.evaluateAll((roots, minimum) => {
    const candidates = roots.flatMap((root) => [root, ...Array.from(root.querySelectorAll('*'))])
    return candidates.flatMap((element) => {
      const html = element as HTMLElement
      const style = getComputedStyle(html)
      const ownText = Array.from(html.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join(' ')
        .trim()
      if (!ownText || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return []
      if (html.closest('[aria-hidden="true"], .ui-icon, [class*="icon-"]')) return []
      const size = Number.parseFloat(style.fontSize)
      const interactive = html.closest('button, uni-button, [role="button"]')
      const compactInteractive = html.closest('[data-typography-compact]')
      const required = interactive && !compactInteractive ? Math.max(13, minimum) : minimum
      return size + .01 < required ? [{ text: ownText.slice(0, 60), size, required, tag: html.tagName.toLowerCase(), className: html.className }] : []
    })
  }, minimumPx)
  expect(unreadable, unreadable.map((item) => `${item.size}px < ${item.required}px ${item.tag}.${item.className}: ${item.text}`).join('\n')).toEqual([])
}
