import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { deliveryMapMarkers, deliveryMapSummary, routeOptimizationWarningText } from './delivery-map'

describe('delivery route map', () => {
  it('summarizes farm count and driving distance', () => {
    expect(deliveryMapSummary({ stopCount: 2, totalDistanceKm: 12.34, estimatedDurationMinutes: 40 })).toBe('2 家农家乐 · 12.3 km · 约 40 分钟')
  })

  it('keeps the overlay and H5 canvas in the map component', () => {
    const source = readFileSync(new URL('./components/DeliveryRouteMap.vue', import.meta.url), 'utf8')
    expect(source).toContain('delivery-route-map-overlay')
    expect(source).toContain('delivery-route-map-canvas')
    expect(source).toContain('loadTencentMapSdk')
    expect(source).toContain('MultiPolyline')
    expect(source).toContain('MultiLabel')
    expect(source).toContain('delivery-route-map-pin')
    expect(source).toContain('selectedStopId')
    expect(source).toContain("'is-selected': marker.id === selectedStopId")
    expect(source).toContain("content: marker.label")
    expect(source).toContain('select-stop')
    expect(source).toContain('<map')
  })

  it('moves driver assignment into route planning', () => {
    const source = readFileSync(new URL('./pages/index/index.vue', import.meta.url), 'utf8')
    expect(source).toContain('route-planning-map')
    expect(source).toContain('optimizeNamedRoute')
    expect(source).not.toContain("key: 'assign'")
    expect(source).not.toContain("key: 'reassign'")
    expect(source).toContain('invalidateRoutePreview')
    expect(source).toContain('todayDriverRoutes')
    expect(source).toContain('selectDriverRoute')
  })

  it('numbers warehouse and ordered farm stops for map labels', () => {
    expect(deliveryMapMarkers({
      origin: { longitude: 109.85, latitude: 28.62 },
      stops: [
        { storeId: 'F001', longitude: 109.86, latitude: 28.63 },
        { storeId: 'F002' },
        { storeId: 'F003', longitude: 110.48, latitude: 29.12 }
      ]
    })).toEqual([
      { id: 'origin', label: '仓', longitude: 109.85, latitude: 28.62 },
      { id: 'F001', label: '1', longitude: 109.86, latitude: 28.63 },
      { id: 'F003', label: '3', longitude: 110.48, latitude: 29.12 }
    ])
  })

  it('translates route optimization fallback warnings', () => {
    expect(routeOptimizationWarningText('missing_coordinates:F003')).toBe('有门店缺少坐标，已排在末尾，请维护坐标')
    expect(routeOptimizationWarningText('off_route:F003')).toBe('有门店不在命名线路中，已排在末尾')
    expect(routeOptimizationWarningText('direction_fallback')).toBe('驾车路线暂不可用，已按直线距离估算')
    expect(routeOptimizationWarningText('other')).toBe('other')
  })
})
