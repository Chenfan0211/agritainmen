import type { DashboardCityMapPoint, DashboardMapPoint } from '@agritainment/shared'

export type TencentMapRegionLevel = 'province' | 'city' | 'district'
export type TencentMapPointTone = 'normal' | 'risk' | 'active' | 'pending' | 'paused'

export interface TencentMapPointModel {
  id: string
  kind: 'city' | 'farm'
  longitude: number
  latitude: number
  title: string
  subtitle: string
  tone: TencentMapPointTone
  count?: number
  cityCode?: string
  farmId?: string
  transactionAmount: number
  orderCount: number
  riskCount?: number
}

interface TencentSdkLoaderOptions {
  key: string
  timeoutMs?: number
  document?: {
    head: { appendChild(node: unknown): void }
    createElement(tag: string): Record<string, unknown>
    getElementById(id: string): Record<string, unknown> | null
  }
  globalObject?: { TMap?: unknown }
}

const sdkPromises = new Map<string, Promise<unknown>>()

export function loadTencentMapSdk(options: TencentSdkLoaderOptions): Promise<unknown> {
  const globalObject = options.globalObject || (globalThis as { TMap?: unknown })
  if (globalObject.TMap) return Promise.resolve(globalObject.TMap)
  const key = options.key.trim()
  if (!key) return Promise.reject(new Error('腾讯地图 JS Key 未配置'))
  const existing = sdkPromises.get(key)
  if (existing) return existing
  const documentObject = options.document || (globalThis as { document?: TencentSdkLoaderOptions['document'] }).document
  if (!documentObject) return Promise.reject(new Error('腾讯地图 SDK 仅支持浏览器环境'))
  const scriptId = `tencent-map-gl-sdk-${encodeURIComponent(key)}`
  const promise = new Promise<unknown>((resolve, reject) => {
    const script = documentObject.getElementById(scriptId) || documentObject.createElement('script')
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs! > 0 ? options.timeoutMs! : 10_000
    let timer: ReturnType<typeof setTimeout> | null = null
    const removeScript = () => {
      const parent = script.parentNode as { removeChild?(node: unknown): void } | undefined
      parent?.removeChild?.(script)
    }
    script.id = scriptId
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (timer) clearTimeout(timer)
      if (globalObject.TMap) resolve(globalObject.TMap)
      else {
        sdkPromises.delete(key)
        removeScript()
        reject(new Error('腾讯地图 SDK 初始化失败'))
      }
    }
    script.onerror = () => {
      if (timer) clearTimeout(timer)
      sdkPromises.delete(key)
      removeScript()
      reject(new Error('腾讯地图 SDK 加载失败'))
    }
    if (!script.parentNode) documentObject.head.appendChild(script)
    timer = setTimeout(() => {
      sdkPromises.delete(key)
      removeScript()
      reject(new Error('腾讯地图 SDK 加载超时'))
    }, timeoutMs)
  })
  sdkPromises.set(key, promise)
  return promise
}

export function buildTencentMapPoints(level: TencentMapRegionLevel, cities: DashboardCityMapPoint[], farms: DashboardMapPoint[]): TencentMapPointModel[] {
  if (level === 'province') {
    return cities.map((point) => ({
      id: `city:${point.cityCode}`,
      kind: 'city',
      cityCode: point.cityCode,
      longitude: point.longitude,
      latitude: point.latitude,
      title: point.cityName,
      subtitle: `${point.storeCount} 家门店 · ${point.orderCount} 单`,
      count: point.storeCount,
      tone: point.riskCount > 0 ? 'risk' : 'normal',
      transactionAmount: point.transactionAmount,
      orderCount: point.orderCount,
      riskCount: point.riskCount
    }))
  }
  const farmModels = farms.map((point): TencentMapPointModel => ({
    id: `farm:${point.farmId}`,
    kind: 'farm',
    farmId: point.farmId,
    longitude: point.longitude,
    latitude: point.latitude,
    title: point.name,
    subtitle: `${point.regionName} · ${point.orderCount} 单`,
    tone: point.status,
    transactionAmount: point.transactionAmount,
    orderCount: point.orderCount
  }))
  const groups = new Map<string, TencentMapPointModel[]>()
  farmModels.forEach((point) => {
    const key = `${point.longitude.toFixed(5)}:${point.latitude.toFixed(5)}`
    groups.set(key, [...(groups.get(key) || []), point])
  })
  groups.forEach((group) => {
    if (group.length < 2) return
    const radius = 0.003
    group.forEach((point, index) => {
      const angle = Math.PI * 2 * index / group.length
      point.longitude += Math.cos(angle) * radius
      point.latitude += Math.sin(angle) * radius
    })
  })
  return farmModels
}

export function fitTencentMapViewport(
  map: { fitBounds(bounds: unknown, options?: unknown): void; setCenter(center: unknown): void; setZoom(zoom: number): void },
  TMap: { LatLng: new (latitude: number, longitude: number) => unknown; LatLngBounds: new () => { extend(point: unknown): unknown } },
  points: Array<{ longitude: number; latitude: number }>
): void {
  if (!points.length) return
  if (points.length === 1) {
    map.setCenter(new TMap.LatLng(points[0].latitude, points[0].longitude))
    map.setZoom(13)
    return
  }
  const bounds = new TMap.LatLngBounds()
  points.forEach((point) => bounds.extend(new TMap.LatLng(point.latitude, point.longitude)))
  map.fitBounds(bounds, { padding: 48 })
}

export function layoutTencentMapPoints<T extends { id: string; x: number; y: number }>(
  points: T[],
  width: number,
  height: number,
  minimumDistance = 36
): Array<T & { x: number; y: number }> {
  if (!points.length || width <= 0 || height <= 0) return []
  const margin = minimumDistance / 2
  const clampX = (value: number) => Math.max(margin, Math.min(width - margin, value))
  const clampY = (value: number) => Math.max(margin, Math.min(height - margin, value))
  const placed: Array<T & { x: number; y: number }> = []
  const available = (x: number, y: number) => placed.every((point) => Math.hypot(point.x - x, point.y - y) >= minimumDistance)

  points.forEach((point, pointIndex) => {
    const baseX = clampX(point.x)
    const baseY = clampY(point.y)
    let selected: { x: number; y: number } | null = available(baseX, baseY) ? { x: baseX, y: baseY } : null
    for (let radius = minimumDistance; !selected && radius <= Math.max(width, height); radius += minimumDistance * 0.7) {
      const samples = Math.max(8, Math.ceil(Math.PI * 2 * radius / (minimumDistance * 0.75)))
      for (let sample = 0; sample < samples; sample += 1) {
        const angle = Math.PI * 2 * sample / samples + pointIndex * 0.618
        const x = clampX(baseX + Math.cos(angle) * radius)
        const y = clampY(baseY + Math.sin(angle) * radius)
        if (available(x, y)) {
          selected = { x, y }
          break
        }
      }
    }
    if (!selected) {
      outer: for (let y = margin; y <= height - margin; y += minimumDistance) {
        for (let x = margin; x <= width - margin; x += minimumDistance) {
          if (available(x, y)) {
            selected = { x, y }
            break outer
          }
        }
      }
    }
    placed.push({ ...point, ...(selected || { x: baseX, y: baseY }) })
  })
  return placed
}
