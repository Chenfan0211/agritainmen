import { createHash } from 'node:crypto'

const TENCENT_MAP_ORIGIN = 'https://apis.map.qq.com'
const GEOCODER_PATH = '/ws/geocoder/v1/'
const TRANSLATE_PATH = '/ws/coord/v1/translate'
const COORDINATE_TYPES = {
  WGS84: 1,
  SOGOU: 2,
  BAIDU: 3,
  MAPBAR: 4,
  SOGOU_MERCATOR: 6
}

export class TencentMapGatewayError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TencentMapGatewayError'
    this.code = code
  }
}

function encode(value) {
  return encodeURIComponent(String(value))
}

function canonicalQuery(params, urlEncode = true) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, value]) => urlEncode ? `${encode(key)}=${encode(value)}` : `${key}=${String(value)}`)
    .join('&')
}

export function createTencentSignature(path, params, secretKey) {
  const source = `${path}?${canonicalQuery(params, false)}${secretKey}`
  return createHash('md5').update(source).digest('hex')
}

export function buildSignedTencentUrl(path, params, secretKey, origin = TENCENT_MAP_ORIGIN) {
  const query = canonicalQuery(params)
  const signature = createTencentSignature(path, params, secretKey)
  return `${origin}${path}?${query}&sig=${signature}`
}

export function tencentCoordinateType(source) {
  const type = COORDINATE_TYPES[source]
  if (!type) throw new TencentMapGatewayError('INVALID_SOURCE', '不支持的坐标来源')
  return type
}

function normalizeText(value) {
  if (Array.isArray(value)) return value.map(String).join('')
  return value === undefined || value === null ? '' : String(value)
}

function validChinaCoordinate(location) {
  const longitude = Number(location?.longitude)
  const latitude = Number(location?.latitude)
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= 73 && longitude <= 135 && latitude >= 18 && latitude <= 54
}

function normalizeCoordinate(location) {
  const normalized = {
    longitude: Number(location?.longitude),
    latitude: Number(location?.latitude)
  }
  if (!validChinaCoordinate(normalized)) {
    throw new TencentMapGatewayError('INVALID_COORDINATE', '坐标不在支持范围内')
  }
  return normalized
}

function normalizeMercatorCoordinate(location) {
  const normalized = { longitude: Number(location?.longitude), latitude: Number(location?.latitude) }
  if (!Number.isFinite(normalized.longitude) || !Number.isFinite(normalized.latitude) ||
      Math.abs(normalized.longitude) > 30_000_000 || Math.abs(normalized.latitude) > 30_000_000 ||
      (normalized.longitude === 0 && normalized.latitude === 0)) {
    throw new TencentMapGatewayError('INVALID_COORDINATE', '坐标不在支持范围内')
  }
  return normalized
}

function upstreamCoordinate(location) {
  return normalizeCoordinate({ longitude: location?.lng, latitude: location?.lat })
}

function ensureConfigured(key, secretKey) {
  if (!key || !secretKey) throw new TencentMapGatewayError('NOT_CONFIGURED', '腾讯地图服务未配置')
}

async function requestTencentJson(url, request, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  try {
    const response = await request(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new TencentMapGatewayError('UPSTREAM_ERROR', '腾讯地图服务暂不可用')
    const payload = await response.json()
    if (!payload || payload.status !== 0) throw new TencentMapGatewayError('UPSTREAM_ERROR', '腾讯地图服务暂不可用')
    return payload
  } catch (error) {
    if (controller.signal.aborted) throw new TencentMapGatewayError('UPSTREAM_TIMEOUT', '腾讯地图服务请求超时')
    if (error instanceof TencentMapGatewayError) throw error
    throw new TencentMapGatewayError('UPSTREAM_ERROR', '腾讯地图服务暂不可用')
  } finally {
    clearTimeout(timer)
  }
}

export function createTencentMapClient(options = {}) {
  const key = options.key?.trim() || ''
  const secretKey = options.secretKey?.trim() || ''
  const request = options.fetch || fetch
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 5000
  const maxLocationsPerRequest = Number.isInteger(options.maxLocationsPerRequest) && options.maxLocationsPerRequest > 0 ? options.maxLocationsPerRequest : 10
  const maxBatchSize = Number.isInteger(options.maxBatchSize) && options.maxBatchSize > 0 ? options.maxBatchSize : 100
  const now = options.now || (() => new Date())

  async function call(path, params) {
    ensureConfigured(key, secretKey)
    return requestTencentJson(buildSignedTencentUrl(path, { ...params, key }, secretKey, options.origin), request, timeoutMs)
  }

  return {
    async geocode(input) {
      const address = input?.address?.trim() || ''
      const city = input?.city?.trim() || ''
      if (!address || address.length > 200 || city.length > 80) {
        throw new TencentMapGatewayError('INVALID_INPUT', '地址参数不合法')
      }
      const payload = await call(GEOCODER_PATH, { address, region: city })
      const coordinate = upstreamCoordinate(payload.result?.location)
      const components = payload.result?.address_components || {}
      return {
        ...coordinate,
        coordinateSystem: 'GCJ-02',
        adCode: normalizeText(payload.result?.ad_info?.adcode),
        province: normalizeText(components.province),
        city: normalizeText(components.city),
        district: normalizeText(components.district),
        formattedAddress: normalizeText(payload.result?.address) || normalizeText(payload.result?.title) || address,
        provider: 'tencent',
        geocodedAt: now().toISOString()
      }
    },

    async translate(input) {
      const source = input?.source
      const locations = input?.locations
      if (!Array.isArray(locations) || locations.length === 0) {
        throw new TencentMapGatewayError('INVALID_INPUT', '坐标列表不能为空')
      }
      if (locations.length > maxBatchSize) {
        throw new TencentMapGatewayError('BATCH_TOO_LARGE', '坐标数量超过限制')
      }
      const normalized = locations.map(source === 'SOGOU_MERCATOR' ? normalizeMercatorCoordinate : normalizeCoordinate)
      if (source === 'GCJ-02') return { coordinateSystem: 'GCJ-02', locations: normalized }
      const type = tencentCoordinateType(source)
      const converted = []
      for (let index = 0; index < normalized.length; index += maxLocationsPerRequest) {
        const batch = normalized.slice(index, index + maxLocationsPerRequest)
        const payload = await call(TRANSLATE_PATH, {
          locations: batch.map((item) => `${item.latitude},${item.longitude}`).join(';'),
          type
        })
        if (!Array.isArray(payload.locations) || payload.locations.length !== batch.length) {
          throw new TencentMapGatewayError('UPSTREAM_ERROR', '腾讯地图服务暂不可用')
        }
        converted.push(...payload.locations.map(upstreamCoordinate))
      }
      return { coordinateSystem: 'GCJ-02', locations: converted }
    }
  }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

function requestOriginAllowed(request, allowedOrigins) {
  const origin = request.headers.origin
  if (!origin) return true
  const host = request.headers.host
  const sameOrigin = host && (origin === `http://${host}` || origin === `https://${host}`)
  return !!sameOrigin || allowedOrigins.has(origin)
}

function readJsonBody(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0
    let oversized = false
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) oversized = true
      else chunks.push(chunk)
    })
    request.on('end', () => {
      if (oversized) {
        reject(new TencentMapGatewayError('PAYLOAD_TOO_LARGE', '请求体超过限制'))
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new TencentMapGatewayError('INVALID_JSON', '请求体不是有效 JSON'))
      }
    })
    request.on('error', () => reject(new TencentMapGatewayError('INVALID_INPUT', '请求读取失败')))
  })
}

function publicError(error) {
  const code = error instanceof TencentMapGatewayError ? error.code : 'INTERNAL_ERROR'
  const errors = {
    INVALID_INPUT: [400, '请求参数不合法'],
    INVALID_JSON: [400, '请求体不是有效 JSON'],
    INVALID_COORDINATE: [400, '坐标不在支持范围内'],
    INVALID_SOURCE: [400, '不支持的坐标来源'],
    BATCH_TOO_LARGE: [400, '坐标数量超过限制'],
    PAYLOAD_TOO_LARGE: [413, '请求体超过限制'],
    NOT_CONFIGURED: [503, '地图服务未配置'],
    UPSTREAM_TIMEOUT: [504, '地图服务请求超时'],
    UPSTREAM_ERROR: [502, '地图服务暂不可用']
  }
  const [status, message] = errors[code] || [500, '地图服务暂不可用']
  return { status, body: { error: { code, message } } }
}

export function createTencentMapGatewayHandler(options = {}) {
  const client = options.client || createTencentMapClient({
    key: options.key || process.env.TENCENT_MAP_KEY,
    secretKey: options.secretKey || process.env.TENCENT_MAP_SECRET_KEY,
    timeoutMs: options.timeoutMs || Number(process.env.TENCENT_MAP_TIMEOUT_MS),
    fetch: options.fetch
  })
  const allowedOrigins = new Set(
    (Array.isArray(options.allowedOrigins) ? options.allowedOrigins : String(options.allowedOrigins || process.env.TENCENT_MAP_ALLOWED_ORIGINS || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  )
  const maxBodyBytes = Number.isInteger(options.maxBodyBytes) && options.maxBodyBytes > 0 ? options.maxBodyBytes : 16 * 1024

  return async function tencentMapGatewayHandler(request, response) {
    const path = new URL(request.url || '/', 'http://localhost').pathname
    const action = path === '/api/tencent-map/geocode' ? 'geocode' : path === '/api/tencent-map/translate' ? 'translate' : ''
    if (!action) {
      writeJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      writeJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST' } })
      return
    }
    if (!requestOriginAllowed(request, allowedOrigins)) {
      writeJson(response, 403, { error: { code: 'ORIGIN_FORBIDDEN', message: '请求来源不受信任' } })
      return
    }
    try {
      const body = await readJsonBody(request, maxBodyBytes)
      writeJson(response, 200, await client[action](body))
    } catch (error) {
      const normalized = publicError(error)
      writeJson(response, normalized.status, normalized.body)
    }
  }
}

export function createTencentMapVitePlugin(options = {}) {
  const handler = createTencentMapGatewayHandler(options)
  return {
    name: 'agritainment-tencent-map-gateway',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url || '/', 'http://localhost').pathname
        if (!path.startsWith('/api/tencent-map/')) {
          next()
          return
        }
        void handler(request, response)
      })
    }
  }
}
