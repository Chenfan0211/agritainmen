
export type GeocodeProviderName = 'amap' | 'tencent'

export interface Gcj02Coordinate {
  longitude: number
  latitude: number
}

export interface GeocodeRequest {
  address: string
  city?: string
}

export interface FarmLocation {
  longitude: number
  latitude: number
  coordinateSystem: 'GCJ-02'
  adCode: string
  province: string
  city: string
  district: string
  formattedAddress: string
  provider: 'amap' | 'tencent'
  geocodedAt: string
}

export interface GeocoderProvider {
  name: GeocodeProviderName
  isConfigured(): boolean
  geocode(request: GeocodeRequest): Promise<FarmLocation>
}

/** @deprecated Use GeocoderProvider. */
export type GeocodeProvider = GeocoderProvider

export interface GeocodeOptions {
  /** @deprecated New geocoding requests only use the Tencent same-origin gateway. */
  amapKey?: string
  /** @deprecated New geocoding requests only use the Tencent same-origin gateway. */
  amapProxy?: string
  /** @deprecated Tencent WebService credentials must stay in the server gateway. */
  tencentKey?: string
  tencentProxy?: string
  /** @deprecated Provider ordering is retained only for source compatibility. */
  order?: readonly GeocodeProviderName[]
  fetch?: typeof fetch
}

export type TencentCoordinateSource = 'GCJ-02' | 'WGS84' | 'SOGOU' | 'BAIDU' | 'MAPBAR' | 'SOGOU_MERCATOR'

export interface TencentCoordinateTranslateRequest {
  source: TencentCoordinateSource
  locations: Gcj02Coordinate[]
}

export interface TencentCoordinateTranslateResponse {
  coordinateSystem: 'GCJ-02'
  locations: Gcj02Coordinate[]
}

export interface TencentCoordinateTranslateOptions {
  proxy?: string
  fetch?: typeof fetch
}

export type GeocodeResult =
  | { status: 'resolved'; provider: GeocodeProviderName; coordinate: Gcj02Coordinate; location: FarmLocation }
  | { status: 'failed'; reason?: GeocodeFailureReason }

export type GeocodeFailureReason = 'NOT_CONFIGURED' | 'TIMEOUT' | 'INVALID_COORDINATE' | 'REQUEST_FAILED'

export interface GeocodeRunOptions {
  timeoutMs?: number
}

function requestJson(url: string, request: typeof fetch, init?: RequestInit): Promise<unknown> {
  return request(url, init).then(async (response) => {
    if (!response.ok) throw new Error(`地理编码请求失败：${response.status}`)
    return response.json()
  })
}

export function isValidChinaCoordinate(longitude: unknown, latitude: unknown): boolean {
  const lng = Number(longitude)
  const lat = Number(latitude)
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= 73 && lng <= 135 && lat >= 18 && lat <= 54
}

function coordinate(longitude: unknown, latitude: unknown): Gcj02Coordinate {
  if (!isValidChinaCoordinate(longitude, latitude)) throw new Error('地理编码未返回中国境内有效坐标')
  return { longitude: Number(longitude), latitude: Number(latitude) }
}

function mercatorCoordinate(longitude: unknown, latitude: unknown): Gcj02Coordinate {
  const normalized = { longitude: Number(longitude), latitude: Number(latitude) }
  if (!Number.isFinite(normalized.longitude) || !Number.isFinite(normalized.latitude) ||
      Math.abs(normalized.longitude) > 30_000_000 || Math.abs(normalized.latitude) > 30_000_000 ||
      (normalized.longitude === 0 && normalized.latitude === 0)) throw new Error('坐标转换输入无效')
  return normalized
}

function text(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join('') : typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function createTencentGeocodeProvider(options: GeocodeOptions = {}): GeocoderProvider {
  const proxy = options.tencentProxy?.trim() || ''
  return {
    name: 'tencent',
    isConfigured: () => !!proxy,
    async geocode(request: GeocodeRequest) {
      const address = request.address.trim()
      const city = request.city?.trim()
      const body = city ? { address, city } : { address }
      const payload = await requestJson(proxy, options.fetch || fetch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }) as Partial<FarmLocation>
      if (payload.coordinateSystem !== 'GCJ-02' || payload.provider !== 'tencent') throw new Error('腾讯地理编码响应无效')
      const validCoordinate = coordinate(payload.longitude, payload.latitude)
      return {
        ...validCoordinate,
        coordinateSystem: 'GCJ-02',
        provider: 'tencent',
        adCode: text(payload.adCode),
        province: text(payload.province),
        city: text(payload.city),
        district: text(payload.district),
        formattedAddress: text(payload.formattedAddress) || address,
        geocodedAt: text(payload.geocodedAt) || new Date().toISOString()
      }
    }
  }
}

export function createGeocodeProviders(options: GeocodeOptions = {}): GeocoderProvider[] {
  return [createTencentGeocodeProvider(options)]
}

export async function translateTencentCoordinates(input: TencentCoordinateTranslateRequest, options: TencentCoordinateTranslateOptions = {}): Promise<TencentCoordinateTranslateResponse> {
  if (!Array.isArray(input.locations) || input.locations.length === 0) throw new Error('坐标列表不能为空')
  const locations = input.locations.map((item) => input.source === 'SOGOU_MERCATOR'
    ? mercatorCoordinate(item.longitude, item.latitude)
    : coordinate(item.longitude, item.latitude))
  if (input.source === 'GCJ-02') return { coordinateSystem: 'GCJ-02', locations }
  const sources: TencentCoordinateSource[] = ['WGS84', 'SOGOU', 'BAIDU', 'MAPBAR', 'SOGOU_MERCATOR']
  if (!sources.includes(input.source)) throw new Error('不支持的坐标来源')
  const payload = await requestJson(options.proxy?.trim() || '/api/tencent-map/translate', options.fetch || fetch, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: input.source, locations })
  }) as Partial<TencentCoordinateTranslateResponse>
  if (payload.coordinateSystem !== 'GCJ-02' || !Array.isArray(payload.locations) || payload.locations.length !== locations.length) throw new Error('坐标转换响应无效')
  return { coordinateSystem: 'GCJ-02', locations: payload.locations.map((item) => coordinate(item.longitude, item.latitude)) }
}

function timeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    work.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

function failureReason(error: unknown): GeocodeFailureReason {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'TIMEOUT') return 'TIMEOUT'
  if (message.includes('坐标')) return 'INVALID_COORDINATE'
  return 'REQUEST_FAILED'
}

export async function geocodeAddress(request: string | GeocodeRequest, providers: GeocoderProvider[] = createGeocodeProviders(), options: GeocodeRunOptions = {}): Promise<GeocodeResult> {
  const normalizedAddress = (typeof request === 'string' ? request : request.address).trim()
  if (!normalizedAddress) return { status: 'failed' }
  const requestedCity = typeof request === 'string' ? '' : request.city?.trim()
  const geocodeRequest: GeocodeRequest = requestedCity ? { address: normalizedAddress, city: requestedCity } : { address: normalizedAddress }
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs! > 0 ? options.timeoutMs! : 5000
  let attempted = false
  let latestReason: GeocodeFailureReason = 'REQUEST_FAILED'
  for (const provider of providers) {
    if (!provider.isConfigured()) continue
    attempted = true
    try {
      const location = await timeout(provider.geocode(geocodeRequest), timeoutMs)
      if (!isValidChinaCoordinate(location.longitude, location.latitude)) throw new Error('供应商返回非法坐标')
      return { status: 'resolved', provider: provider.name, coordinate: { longitude: location.longitude, latitude: location.latitude }, location }
    } catch (error) {
      latestReason = failureReason(error)
      // 单个供应商异常应继续使用后备供应商。
    }
  }
  return attempted ? { status: 'failed', reason: latestReason } : { status: 'failed', reason: 'NOT_CONFIGURED' }
}
