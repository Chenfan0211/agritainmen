
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
  amapKey?: string
  amapProxy?: string
  tencentKey?: string
  tencentProxy?: string
  order?: readonly GeocodeProviderName[]
  fetch?: typeof fetch
}

export type GeocodeResult =
  | { status: 'resolved'; provider: GeocodeProviderName; coordinate: Gcj02Coordinate; location: FarmLocation }
  | { status: 'failed'; reason?: GeocodeFailureReason }

export type GeocodeFailureReason = 'NOT_CONFIGURED' | 'TIMEOUT' | 'INVALID_COORDINATE' | 'REQUEST_FAILED'

export interface GeocodeRunOptions {
  timeoutMs?: number
}

function configured(key?: string, proxy?: string): boolean {
  return !!key?.trim() || !!proxy?.trim()
}

function endpoint(proxy: string | undefined, fallback: string): string {
  return proxy?.trim() || fallback
}

function requestJson(url: string, request: typeof fetch): Promise<unknown> {
  return request(url).then(async (response) => {
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

function text(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join('') : typeof value === 'string' ? value : value == null ? '' : String(value)
}

function buildLocation(input: Omit<FarmLocation, 'coordinateSystem' | 'geocodedAt'>): FarmLocation {
  const validCoordinate = coordinate(input.longitude, input.latitude)
  return { ...input, ...validCoordinate, coordinateSystem: 'GCJ-02', geocodedAt: new Date().toISOString() }
}

export function createAMapGeocodeProvider(options: GeocodeOptions = {}): GeocoderProvider {
  return {
    name: 'amap',
    isConfigured: () => configured(options.amapKey, options.amapProxy),
    async geocode(request: GeocodeRequest) {
      const address = request.address.trim()
      const query = new URLSearchParams({ address })
      if (request.city?.trim()) query.set('city', request.city.trim())
      if (options.amapKey?.trim()) query.set('key', options.amapKey.trim())
      const payload = await requestJson(`${endpoint(options.amapProxy, 'https://restapi.amap.com/v3/geocode/geo')}?${query}`, options.fetch || fetch) as {
        status?: string
        geocodes?: Array<{ location?: string; adcode?: string; province?: string; city?: string | string[]; district?: string; formatted_address?: string }>
      }
      const geocode = payload.geocodes?.[0]
      const [longitude, latitude] = geocode?.location?.split(',') || []
      if (payload.status !== '1') throw new Error('高德地理编码失败')
      return buildLocation({
        ...coordinate(longitude, latitude),
        provider: 'amap',
        adCode: text(geocode?.adcode),
        province: text(geocode?.province),
        city: text(geocode?.city),
        district: text(geocode?.district),
        formattedAddress: text(geocode?.formatted_address) || address
      })
    }
  }
}

export function createTencentGeocodeProvider(options: GeocodeOptions = {}): GeocoderProvider {
  return {
    name: 'tencent',
    isConfigured: () => configured(options.tencentKey, options.tencentProxy),
    async geocode(request: GeocodeRequest) {
      const address = request.address.trim()
      const query = new URLSearchParams({ address })
      if (request.city?.trim()) query.set('region', request.city.trim())
      if (options.tencentKey?.trim()) query.set('key', options.tencentKey.trim())
      const payload = await requestJson(`${endpoint(options.tencentProxy, 'https://apis.map.qq.com/ws/geocoder/v1/')}?${query}`, options.fetch || fetch) as {
        status?: number
        result?: {
          location?: { lng?: number; lat?: number }
          ad_info?: { adcode?: string | number }
          address_components?: { province?: string; city?: string; district?: string }
          title?: string
          address?: string
        }
      }
      if (payload.status !== 0) throw new Error('腾讯地理编码失败')
      return buildLocation({
        ...coordinate(payload.result?.location?.lng, payload.result?.location?.lat),
        provider: 'tencent',
        adCode: text(payload.result?.ad_info?.adcode),
        province: text(payload.result?.address_components?.province),
        city: text(payload.result?.address_components?.city),
        district: text(payload.result?.address_components?.district),
        formattedAddress: text(payload.result?.address) || text(payload.result?.title) || address
      })
    }
  }
}

export function createGeocodeProviders(options: GeocodeOptions = {}): GeocoderProvider[] {
  const providers: Record<GeocodeProviderName, GeocoderProvider> = {
    amap: createAMapGeocodeProvider(options),
    tencent: createTencentGeocodeProvider(options)
  }
  const order = options.order?.length ? options.order : ['amap', 'tencent']
  return [...new Set(order)].filter((name): name is GeocodeProviderName => name === 'amap' || name === 'tencent').map((name) => providers[name])
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
