import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('supplier and driver mobile routing navigation', () => {
  const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8')

  it('uses four supplier tabs and three driver tabs while keeping work areas on back-navigable secondary pages', () => {
    const supplierTabs = source.match(/const supplierTabs = \[([\s\S]*?)\n\]/)?.[1] || ''
    const driverTabs = source.match(/const driverTabs = \[([\s\S]*?)\n\]/)?.[1] || ''
    expect([...supplierTabs.matchAll(/label: '([^']+)'/g)].map((match) => match[1])).toEqual(['首页', '订单', '商品', '我的'])
    expect([...driverTabs.matchAll(/label: '([^']+)'/g)].map((match) => match[1])).toEqual(['今日线路', '历史任务', '我的'])
    expect(source).toMatch(/secondaryWorkspace[\s\S]*返回/)
    expect(source).toContain("'drivers'")
    expect(source).toContain("'routes'")
    expect(source).toContain("'settlements'")
    expect(source).toContain("'handovers'")
    expect(source).toContain("'warehouse'")
  })

  it('subscribes to routing collections and includes mobile touch and overflow guards', () => {
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY')
    expect(source).toMatch(/\.bottom-tab\s*\{[^}]*min-height:\s*44px/s)
    expect(source).toMatch(/@media\s*\(max-width:\s*375px\)/)
    expect(source).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(source).toMatch(/\.task-store[^{]*\{[^}]*min-width:\s*0/s)
  })

  it('shows contact details on published route stops and only confirms a successful driver status change', () => {
    const publishedRoute = source.match(/<view v-if="store\.currentDriverRoute"[\s\S]*?<view v-else class="empty-state compact-empty"/)?.[0] || ''
    expect(publishedRoute).toContain('storeInfoOf(stop).contact')
    expect(publishedRoute).toContain('storeInfoOf(stop).phone')
    const confirmToggle = source.match(/function confirmToggle\(\)[\s\S]*?\n}/)?.[0] || ''
    expect(confirmToggle).toMatch(/if \(!store\.toggleDriverStatus\(driverStatusTarget\.value\.id\)\) return/)
  })

  it('shows route completion progress and the next stop without offering handover for completed orders', () => {
    const todayRoute = source.match(/<view v-if="store\.currentDriverRoute"[\s\S]*?<view v-else class="empty-state compact-empty"/)?.[0] || ''
    expect(todayRoute).toContain('routeCompletedOrderCount')
    expect(todayRoute).toContain('routeOrderCount')
    expect(todayRoute).toContain('nextRouteStop')
    expect(todayRoute).toContain("orderFulfillment(order).status !== 'received'")
  })
})
