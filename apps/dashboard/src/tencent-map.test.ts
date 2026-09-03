import { describe, expect, it, vi } from 'vitest'
import {
  buildTencentMapPoints,
  fitTencentMapViewport,
  layoutTencentMapPoints,
  loadTencentMapSdk
} from './tencent-map'

describe('Tencent dashboard map models', () => {
  it('builds province city bubbles with store counts and risk tones', () => {
    expect(buildTencentMapPoints('province', [{
      cityCode: '4301', cityName: '长沙市', longitude: 112.93, latitude: 28.22,
      storeCount: 8, transactionAmount: 12800, orderCount: 42, riskCount: 2
    }], [])).toEqual([expect.objectContaining({
      id: 'city:4301', kind: 'city', longitude: 112.93, latitude: 28.22,
      count: 8, tone: 'risk', title: '长沙市', cityCode: '4301'
    })])
  })

  it('builds city and district farm points using operating status tones', () => {
    const farms = [
      { farmId: 'F1', name: '经营门店', regionName: '岳麓区', adCode: '430104', longitude: 112.9, latitude: 28.2, status: 'active' as const, transactionAmount: 100, orderCount: 2 },
      { farmId: 'F2', name: '筹备门店', regionName: '芙蓉区', adCode: '430102', longitude: 113, latitude: 28.1, status: 'pending' as const, transactionAmount: 0, orderCount: 0 },
      { farmId: 'F3', name: '停用门店', regionName: '天心区', adCode: '430103', longitude: 112.98, latitude: 28.15, status: 'paused' as const, transactionAmount: 0, orderCount: 0 }
    ]

    expect(buildTencentMapPoints('city', [], farms).map((point) => point.tone)).toEqual(['active', 'pending', 'paused'])
    expect(buildTencentMapPoints('district', [], farms)[0]).toMatchObject({ id: 'farm:F1', kind: 'farm', farmId: 'F1' })
  })

  it('spreads coincident farm coordinates for display without moving their shared center', () => {
    const farms = ['F1', 'F2', 'F3'].map((farmId) => ({
      farmId, name: farmId, regionName: '岳麓区', adCode: '430104', longitude: 112.9388, latitude: 28.2278,
      status: 'active' as const, transactionAmount: 0, orderCount: 0
    }))
    const points = buildTencentMapPoints('city', [], farms)
    expect(new Set(points.map((point) => `${point.longitude},${point.latitude}`)).size).toBe(3)
    expect(points.reduce((sum, point) => sum + point.longitude, 0) / points.length).toBeCloseTo(112.9388, 6)
    expect(points.reduce((sum, point) => sum + point.latitude, 0) / points.length).toBeCloseTo(28.2278, 6)
  })
})

describe('Tencent map viewport', () => {
  class LatLng {
    constructor(public latitude: number, public longitude: number) {}
  }
  class LatLngBounds {
    points: LatLng[] = []
    extend(point: LatLng) { this.points.push(point); return this }
  }
  const TMap = { LatLng, LatLngBounds }

  it('fits multiple points and uses controlled zoom for a single point', () => {
    const map = { fitBounds: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn() }
    const points = [
      { longitude: 112.9, latitude: 28.2 },
      { longitude: 113, latitude: 28.3 }
    ]
    fitTencentMapViewport(map, TMap, points)
    expect(map.fitBounds).toHaveBeenCalledWith(expect.objectContaining({ points: expect.arrayContaining([expect.any(LatLng)]) }), { padding: 48 })

    fitTencentMapViewport(map, TMap, [points[0]])
    expect(map.setCenter).toHaveBeenCalledWith(expect.objectContaining({ latitude: 28.2, longitude: 112.9 }))
    expect(map.setZoom).toHaveBeenCalledWith(13)
  })
})

describe('Tencent map point collision layout', () => {
  it('keeps dense bubbles inside the map and separates their centers', () => {
    const input = Array.from({ length: 14 }, (_, index) => ({ id: String(index), x: 120 + index % 3 * 4, y: 70 + index % 4 * 4 }))
    const output = layoutTencentMapPoints(input, 690, 168, 32)
    expect(output).toHaveLength(input.length)
    for (const point of output) {
      expect(point.x).toBeGreaterThanOrEqual(16)
      expect(point.x).toBeLessThanOrEqual(674)
      expect(point.y).toBeGreaterThanOrEqual(16)
      expect(point.y).toBeLessThanOrEqual(152)
    }
    for (let left = 0; left < output.length; left += 1) {
      for (let right = left + 1; right < output.length; right += 1) {
        expect(Math.hypot(output[left].x - output[right].x, output[left].y - output[right].y)).toBeGreaterThanOrEqual(31.9)
      }
    }
  })
})

function fakeDocument() {
  const scripts: Array<Record<string, unknown>> = []
  const head = {
    appendChild(script: Record<string, unknown>) {
      scripts.push(script)
      script.parentNode = head
    },
    removeChild(script: Record<string, unknown>) {
      const index = scripts.indexOf(script)
      if (index >= 0) scripts.splice(index, 1)
    }
  }
  return {
    scripts,
    document: {
      head,
      createElement: () => ({}),
      getElementById: (id: string) => scripts.find((script) => script.id === id) || null
    }
  }
}

describe('Tencent JS API loader', () => {
  it('loads the SDK once for concurrent callers', async () => {
    const fixture = fakeDocument()
    const globalObject: { TMap?: object } = {}
    const first = loadTencentMapSdk({ key: 'loader-key', document: fixture.document, globalObject })
    const second = loadTencentMapSdk({ key: 'loader-key', document: fixture.document, globalObject })
    expect(first).toBe(second)
    expect(fixture.scripts).toHaveLength(1)
    expect(fixture.scripts[0].src).toBe('https://map.qq.com/api/gljs?v=1.exp&key=loader-key')

    globalObject.TMap = { Map: class {} }
    ;(fixture.scripts[0].onload as () => void)()
    await expect(first).resolves.toBe(globalObject.TMap)
  })

  it('removes a failed script so retry can create a fresh request', async () => {
    const fixture = fakeDocument()
    const globalObject = {}
    const failed = loadTencentMapSdk({ key: 'retry-key', document: fixture.document, globalObject })
    ;(fixture.scripts[0].onerror as () => void)()
    await expect(failed).rejects.toThrow('腾讯地图 SDK 加载失败')
    expect(fixture.scripts).toHaveLength(0)

    const retried = loadTencentMapSdk({ key: 'retry-key', document: fixture.document, globalObject })
    expect(fixture.scripts).toHaveLength(1)
    ;(fixture.scripts[0].onerror as () => void)()
    await expect(retried).rejects.toThrow('腾讯地图 SDK 加载失败')
  })

  it('times out a stalled SDK request and removes its script', async () => {
    const fixture = fakeDocument()
    await expect(loadTencentMapSdk({ key: 'timeout-key', document: fixture.document, globalObject: {}, timeoutMs: 5 })).rejects.toThrow('腾讯地图 SDK 加载超时')
    expect(fixture.scripts).toHaveLength(0)
  })

  it('fails clearly when the browser key is missing', async () => {
    await expect(loadTencentMapSdk({ key: '' })).rejects.toThrow('腾讯地图 JS Key 未配置')
  })
})
