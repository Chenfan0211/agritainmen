import { describe, expect, it } from 'vitest'
import { dashboardMapRegionCode, dashboardMapSourceCode, geoFeatureRegionCode, type DashboardGeoJson } from './region-map'

describe('dashboard region map', () => {
  it('loads the province map at province level and the parent city map below it', () => {
    expect(dashboardMapSourceCode('43')).toBe('430000')
    expect(dashboardMapSourceCode('4301')).toBe('430100')
    expect(dashboardMapSourceCode('430104')).toBe('430100')
    expect(dashboardMapRegionCode('430104')).toBe('430104')
  })

  it('reads navigation codes from the active GeoJSON feature instead of a global name map', () => {
    const geoJson: DashboardGeoJson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: '岳麓区', adcode: 430104 }, geometry: { type: 'Polygon', coordinates: [] } }
      ]
    }

    expect(geoFeatureRegionCode(geoJson, '岳麓区')).toBe('430104')
    expect(geoFeatureRegionCode(geoJson, '同名区域')).toBe('')
  })

  it('rejects unsupported region codes', () => {
    expect(() => dashboardMapSourceCode('4401')).toThrow('不支持的驾驶舱区域')
  })
})
