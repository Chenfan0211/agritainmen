export interface DeliveryMapPoint {
  longitude: number
  latitude: number
}

const sdkPromises = new Map<string, Promise<unknown>>()

export function loadTencentMapSdk(options: { key: string; document?: Document; globalObject?: { TMap?: unknown } }): Promise<unknown> {
  const globalObject = options.globalObject || (globalThis as { TMap?: unknown })
  if (globalObject.TMap) return Promise.resolve(globalObject.TMap)
  const key = options.key.trim()
  if (!key) return Promise.reject(new Error('腾讯地图 JS Key 未配置'))
  const existing = sdkPromises.get(key)
  if (existing) return existing
  const documentObject = options.document || (globalThis as { document?: Document }).document
  if (!documentObject) return Promise.reject(new Error('腾讯地图 SDK 仅支持浏览器环境'))
  const scriptId = `tencent-delivery-map-sdk-${encodeURIComponent(key)}`
  const promise = new Promise<unknown>((resolve, reject) => {
    const script = (documentObject.getElementById(scriptId) || documentObject.createElement('script')) as HTMLScriptElement
    script.id = scriptId
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => {
      if (globalObject.TMap) resolve(globalObject.TMap)
      else {
        sdkPromises.delete(key)
        reject(new Error('腾讯地图 SDK 初始化失败'))
      }
    }
    script.onerror = () => {
      sdkPromises.delete(key)
      reject(new Error('腾讯地图 SDK 加载失败'))
    }
    if (!script.parentNode) documentObject.head.appendChild(script)
  })
  sdkPromises.set(key, promise)
  return promise
}

export function deliveryMapSummary(input: { stopCount: number; totalDistanceKm: number; estimatedDurationMinutes: number }): string {
  return `${input.stopCount} 家农家乐 · ${input.totalDistanceKm.toFixed(1)} km · 约 ${input.estimatedDurationMinutes} 分钟`
}

export function deliveryMapMarkers(input: {
  origin?: { longitude: number; latitude: number }
  stops: Array<{ storeId: string; longitude?: number; latitude?: number }>
}): Array<{ id: string; label: string; longitude: number; latitude: number }> {
  const markers = input.origin
    ? [{ id: 'origin', label: '仓', longitude: input.origin.longitude, latitude: input.origin.latitude }]
    : []
  input.stops.forEach((stop, index) => {
    if (stop.longitude === undefined || stop.latitude === undefined) return
    markers.push({ id: stop.storeId, label: String(index + 1), longitude: stop.longitude, latitude: stop.latitude })
  })
  return markers
}

export function routeOptimizationWarningText(warning: string): string {
  if (warning.startsWith('missing_coordinates:')) return '有门店缺少坐标，已排在末尾，请维护坐标'
  if (warning.startsWith('off_route:')) return '有门店不在命名线路中，已排在末尾'
  if (warning === 'direction_fallback') return '驾车路线暂不可用，已按直线距离估算'
  return warning
}
