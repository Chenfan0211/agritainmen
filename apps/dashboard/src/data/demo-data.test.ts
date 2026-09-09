import { createPlatformDashboardDataSource, type DashboardRange } from '@agritainment/shared'
import { describe, expect, it } from 'vitest'
import { supplementDashboardDataSource } from './demo-data'

const now = new Date('2026-08-25T12:00:00+08:00')

function range(days: number): DashboardRange {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

describe('dashboard demo supplement', () => {
  it('keeps default province KPI after supplement', () => {
    const source = createPlatformDashboardDataSource()
    const supplemented = supplementDashboardDataSource(source, range(30), now)
    expect(supplemented.farms.length).toBeGreaterThan(0)
    expect(supplemented.cOrders.length).toBeGreaterThan(0)
    expect(supplemented.fulfillmentOrders.length).toBeGreaterThan(0)
  })

  it('does not mix demo consumer orders into a dataset that has valid shared data', () => {
    const source = createPlatformDashboardDataSource()
    const selectedRange = range(30)
    source.cOrders = [{
      id: 'REAL-C-1',
      farmId: source.farms[0].id,
      amount: 680,
      status: 'paid',
      createdAt: now.toISOString(),
      items: [{ productId: source.catalog?.products[0]?.id || 'P1', quantity: 2 }]
    }]
    const originalOrders = [...source.cOrders]

    const supplemented = supplementDashboardDataSource(source, selectedRange, now)

    expect(supplemented).not.toBe(source)
    expect(supplemented.cOrders).toEqual(originalOrders)
    expect(supplemented.cOrders.some((order) => order.id.startsWith('DASH-SEED-C-'))).toBe(false)
    expect(supplemented.demoSupplement?.datasets).not.toContain('consumerOrders')
    expect(source.cOrders).toEqual(originalOrders)
  })

  it('supplements empty after-sale and commission datasets from valid shared orders', () => {
    const source = createPlatformDashboardDataSource()
    const selectedRange = range(30)
    source.cOrders = [{
      id: 'REAL-C-FOR-DERIVED-DATA', farmId: source.farms[0].id, amount: 880, status: 'received',
      createdAt: now.toISOString(), items: [{ productId: source.catalog?.products[0]?.id || 'P1', quantity: 3 }]
    }]
    source.afterSales = []
    source.commissionLedger = []

    const supplemented = supplementDashboardDataSource(source, selectedRange, now)

    expect(supplemented.afterSales).toEqual(expect.arrayContaining([
      expect.objectContaining({ orderId: 'REAL-C-FOR-DERIVED-DATA', dataOrigin: 'dashboard_demo' })
    ]))
    expect(supplemented.commissionLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceOrderId: 'REAL-C-FOR-DERIVED-DATA', dataOrigin: 'dashboard_demo' })
    ]))
    expect(supplemented.demoSupplement?.datasets).toEqual(expect.arrayContaining(['afterSales', 'commissionLedger']))
  })

  it.each([7, 30, 90, 238])('creates current and previous consumer periods for a %i-day range', (days) => {
    const source = createPlatformDashboardDataSource()
    source.cOrders = []
    const selectedRange = range(days)

    const supplemented = supplementDashboardDataSource(source, selectedRange, now)
    const current = supplemented.cOrders.filter((order) => order.id.endsWith('-CURRENT'))
    const previous = supplemented.cOrders.filter((order) => order.id.endsWith('-PREVIOUS'))

    expect(current).toHaveLength(source.farms.length)
    expect(previous).toHaveLength(source.farms.length)
    expect(current.every((order) => Date.parse(order.createdAt) >= Date.parse(selectedRange.start) && Date.parse(order.createdAt) <= Date.parse(selectedRange.end))).toBe(true)
    expect(previous.every((order) => Date.parse(order.createdAt) < Date.parse(selectedRange.start))).toBe(true)
  })
})
