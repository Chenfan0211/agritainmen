import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('supplier and driver mobile routing navigation', () => {
  const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8')

  it('uses three supplier tabs and no driver tabbar while keeping work areas back-navigable', () => {
    const supplierTabs = source.match(/const supplierTabs = \[([\s\S]*?)\n\]/)?.[1] || ''
    expect([...supplierTabs.matchAll(/label: '([^']+)'/g)].map((match) => match[1])).toEqual(['订单', '商品', '我的'])
    expect(source).not.toContain('const driverTabs')
    expect(source).toMatch(/store\.auth\.role === 'supplier'[\s\S]*class="tabbar"/)
    expect(source).toMatch(/secondaryWorkspace[\s\S]*返回/)
    expect(source).toMatch(/class="page-back" aria-label="返回"/)
    expect(source).not.toMatch(/<text>返回<\/text>/)
    expect(source).not.toContain('.secondary-workspace { position: fixed')
    expect(source).toContain("active === 'orders'")
    expect(source).toContain("'drivers'")
    expect(source).toContain("'routes'")
    expect(source).toContain("'outbound'")
    expect(source).toContain("'settlements'")
    expect(source).toContain("'handovers'")
    expect(source).toContain("'warehouse'")
  })

  it('puts driver work records first and exposes date, route and handover searches', () => {
    const todayTemplate = source.match(/<view class="page-pad driver-role-page driver-today-page"[\s\S]*?<\/view>\s*<\/view>/)?.[0] || ''
    expect(todayTemplate.indexOf('作业记录')).toBeGreaterThan(-1)
    expect(todayTemplate.indexOf('作业记录')).toBeLessThan(todayTemplate.indexOf('driver-status-segments'))
    expect(todayTemplate).not.toContain('最近 7 天线路与配送汇总')
    expect(todayTemplate).not.toContain('出仓与到店交接明细')
    expect(source).toContain("const driverDataDate = ref(todayString())")
    expect(source).toContain("const driverDataKeyword = ref('')")
    expect(source).toContain("const handoverKeyword = ref('')")
    expect(source).toContain('placeholder="搜索线路 / 门店 / 订单 / 状态"')
    expect(source).toContain('placeholder="搜索订单号 / 门店 / 司机 / 备注"')
    expect(source).toContain("driverAuxView === 'data' ? driverDataTitle : '交接记录'")
  })

  it('keeps driver record filters across aux view switches and searches shortage text', () => {
    expect(source).toContain('driverAuxFilterSnapshot')
    expect(source).toMatch(/function openDriverAux[\s\S]*restoreDriverAuxFilters\(\)/)
    expect(source).toMatch(/function closeDriverAux[\s\S]*saveDriverAuxFilters\(\)/)
    expect(source).toContain('log.shortageCount ? `缺货 ${log.shortageCount} 项` : \'\'')
  })

  it('subscribes to routing collections and includes mobile touch and overflow guards', () => {
    const subscribed = source.match(/const platformChangeKeys = \[([^\]]+)\]/)?.[1] || ''
    expect(subscribed).toContain('PLATFORM_DRIVER_STORE_SCOPES_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_NAMED_DELIVERY_ROUTES_STORAGE_KEY')
    expect(subscribed).toContain('PLATFORM_DAILY_DELIVERY_ROUTES_STORAGE_KEY')
    expect(source).toMatch(/\.bottom-tab\s*\{[^}]*min-height:\s*44px/s)
    expect(source).toMatch(/@media\s*\(max-width:\s*375px\)/)
    expect(source).toMatch(/\.app-shell\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(source).toMatch(/\.task-store[^{]*\{[^}]*min-width:\s*0/s)
  })

  it('shows contact details in the driver store detail and only confirms a successful driver status change', () => {
    const storeDetail = source.match(/<template v-else-if="driverStoreDetailId && selectedDriverStop"[\s\S]*?<view class="secondary-foot sheet-actions">/)?.[0] || ''
    expect(storeDetail).toContain('storeInfoOf(selectedDriverStop).contact')
    expect(storeDetail).toContain('storeInfoOf(selectedDriverStop).phone')
    const confirmToggle = source.match(/function confirmToggle\(\)[\s\S]*?\n}/)?.[0] || ''
    expect(confirmToggle).toMatch(/if \(!store\.toggleDriverStatus\(driverStatusTarget\.value\.id\)\) return/)
  })

  it('shows route summary cards, warehouse handover and store delivery in separate full pages', () => {
    const todayRoute = source
    expect(todayRoute).toContain('driver-route-metrics')
    expect(todayRoute).toContain('routeGoodsQuantity(route)')
    expect(todayRoute).toContain('routeGoodsKinds(route)')
    expect(todayRoute).toContain('route.estimatedDurationMinutes')
    expect(todayRoute).not.toContain('openDriverHandover(order)')
    expect(todayRoute).not.toContain('待排线路')
    expect(todayRoute).toContain('配送数据')
    expect(todayRoute).toContain('交接记录')
    expect(source).toContain('checkInWarehouse(selectedDriverRoute)')
    expect(source).toContain('submitDriverOutbound(selectedDriverRoute)')
    expect(source).toContain('dispatchDriverRoute(selectedDriverRoute)')
    expect(source).toContain('handoverDriverStop(selectedDriverRoute, selectedDriverStop)')
    expect(source).toContain('按今天补生成')
    expect(source).toContain('到店打卡')
    expect(source).toContain('新建线路')
    expect(source).not.toContain('配送范围')
    expect(source).toContain('createDrivingRouteOptimizationProvider')
    expect(source).toContain('ensureTodayRoutes')
    expect(source).toContain('routeOptimizationWarningText')
  })
})
