import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import {
  TencentMapGatewayError,
  buildSignedTencentUrl,
  createTencentMapClient,
  createTencentMapGatewayHandler,
  createTencentSignature,
  tencentCoordinateType
} from './index.mjs'

const options = {
  key: 'test-key',
  secretKey: 'test-secret'
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('Tencent map gateway client', () => {
  it('signs sorted raw parameters before URL-encoding the final request', () => {
    const params = {
      region: '长沙市',
      key: 'test-key',
      address: '湖南省 长沙市&岳麓区'
    }

    expect(createTencentSignature('/ws/geocoder/v1/', params, 'test-secret')).toBe('994b27f3b266f5bc54437980c1d3f0bf')
    expect(buildSignedTencentUrl('/ws/geocoder/v1/', params, 'test-secret')).toBe(
      'https://apis.map.qq.com/ws/geocoder/v1/?address=%E6%B9%96%E5%8D%97%E7%9C%81%20%E9%95%BF%E6%B2%99%E5%B8%82%26%E5%B2%B3%E9%BA%93%E5%8C%BA&key=test-key&region=%E9%95%BF%E6%B2%99%E5%B8%82&sig=994b27f3b266f5bc54437980c1d3f0bf'
    )
  })

  it('decodes compressed driving polylines and splits waypoints across signed requests', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        status: 0,
        result: { routes: [{ distance: 12000, duration: 900, polyline: [28.62, 109.85, 10000, -20000] }] }
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 0,
        result: { routes: [{ distance: 34000, duration: 1500, polyline: [28.64, 109.87, -5000, 30000] }] }
      }))
    const client = createTencentMapClient({ ...options, fetch: request, maxWaypointsPerRequest: 1 })
    await expect(client.direction({
      origin: { longitude: 109.85, latitude: 28.62 },
      stops: [
        { storeId: 'A', longitude: 109.86, latitude: 28.63 },
        { storeId: 'B', longitude: 109.87, latitude: 28.64 },
        { storeId: 'C', longitude: 109.9, latitude: 28.7 }
      ]
    })).resolves.toEqual({
      distanceKm: 46,
      durationMinutes: 40,
      polyline: [
        { longitude: 109.85, latitude: 28.62 },
        { longitude: 109.83, latitude: 28.63 },
        { longitude: 109.87, latitude: 28.64 },
        { longitude: 109.9, latitude: 28.635 }
      ],
      segments: [
        { fromId: 'origin', toStoreId: 'A', distanceKm: 6 },
        { fromId: 'A', toStoreId: 'B', distanceKm: 6 },
        { fromId: 'B', toStoreId: 'C', distanceKm: 34 }
      ]
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toContain('/ws/direction/v1/driving/')
    expect(request.mock.calls[0][0]).toContain('from=28.62%2C109.85')
    expect(request.mock.calls[0][0]).not.toContain('test-secret')
  })

  it('normalizes Tencent geocoder output as a GCJ-02 FarmLocation', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({
      status: 0,
      result: {
        location: { lng: 112.9388, lat: 28.2282 },
        ad_info: { adcode: 430104 },
        address_components: { province: '湖南省', city: '长沙市', district: '岳麓区' },
        title: '潇湘中路',
        address: '湖南省长沙市岳麓区潇湘中路'
      }
    }))
    const client = createTencentMapClient({ ...options, fetch: request, now: () => new Date('2026-09-02T08:00:00.000Z') })

    await expect(client.geocode({ address: ' 潇湘中路 ', city: ' 长沙市 ' })).resolves.toEqual({
      longitude: 112.9388,
      latitude: 28.2282,
      coordinateSystem: 'GCJ-02',
      adCode: '430104',
      province: '湖南省',
      city: '长沙市',
      district: '岳麓区',
      formattedAddress: '湖南省长沙市岳麓区潇湘中路',
      provider: 'tencent',
      geocodedAt: '2026-09-02T08:00:00.000Z'
    })
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/ws/geocoder/v1/?address=%E6%BD%87%E6%B9%98%E4%B8%AD%E8%B7%AF'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it.each([
    ['WGS84', 1],
    ['SOGOU', 2],
    ['BAIDU', 3],
    ['MAPBAR', 4],
    ['SOGOU_MERCATOR', 6]
  ])('maps %s to Tencent coordinate type %i', (source, type) => {
    expect(tencentCoordinateType(source)).toBe(type)
  })

  it('keeps valid GCJ-02 coordinates unchanged without spending an upstream request', async () => {
    const request = vi.fn()
    const client = createTencentMapClient({ ...options, fetch: request })

    await expect(client.translate({
      source: 'GCJ-02',
      locations: [{ longitude: 112.9388, latitude: 28.2282 }]
    })).resolves.toEqual({
      coordinateSystem: 'GCJ-02',
      locations: [{ longitude: 112.9388, latitude: 28.2282 }]
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('splits coordinate conversion batches and preserves input order', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 0, locations: [{ lng: 110.1, lat: 28.1 }, { lng: 110.2, lat: 28.2 }] }))
      .mockResolvedValueOnce(jsonResponse({ status: 0, locations: [{ lng: 110.3, lat: 28.3 }] }))
    const client = createTencentMapClient({ ...options, fetch: request, maxLocationsPerRequest: 2 })

    await expect(client.translate({
      source: 'WGS84',
      locations: [
        { longitude: 110, latitude: 28 },
        { longitude: 111, latitude: 29 },
        { longitude: 112, latitude: 30 }
      ]
    })).resolves.toEqual({
      coordinateSystem: 'GCJ-02',
      locations: [
        { longitude: 110.1, latitude: 28.1 },
        { longitude: 110.2, latitude: 28.2 },
        { longitude: 110.3, latitude: 28.3 }
      ]
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][0]).toContain('locations=28%2C110%3B29%2C111')
    expect(request.mock.calls[0][0]).toContain('type=1')
  })

  it('accepts Sogou Mercator values without applying longitude and latitude bounds', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ status: 0, locations: [{ lng: 112.93, lat: 28.22 }] }))
    const client = createTencentMapClient({ ...options, fetch: request })

    await expect(client.translate({
      source: 'SOGOU_MERCATOR',
      locations: [{ longitude: 12958160, latitude: 4825907 }]
    })).resolves.toEqual({ coordinateSystem: 'GCJ-02', locations: [{ longitude: 112.93, latitude: 28.22 }] })
    expect(request.mock.calls[0][0]).toContain('type=6')
  })

  it('rejects empty addresses, oversized batches, and invalid coordinates before calling Tencent', async () => {
    const request = vi.fn()
    const client = createTencentMapClient({ ...options, fetch: request, maxBatchSize: 2 })

    await expect(client.geocode({ address: '   ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(client.translate({ source: 'WGS84', locations: [{ longitude: 0, latitude: 0 }] })).rejects.toMatchObject({ code: 'INVALID_COORDINATE' })
    await expect(client.translate({ source: 'WGS84', locations: [
      { longitude: 110, latitude: 28 },
      { longitude: 111, latitude: 29 },
      { longitude: 112, latitude: 30 }
    ] })).rejects.toMatchObject({ code: 'BATCH_TOO_LARGE' })
    expect(request).not.toHaveBeenCalled()
  })

  it('aborts timed out requests and exposes only a standardized error', async () => {
    const request = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    }))
    const client = createTencentMapClient({ ...options, fetch: request, timeoutMs: 5 })

    await expect(client.geocode({ address: '湖南省长沙市' })).rejects.toEqual(expect.objectContaining({
      name: 'TencentMapGatewayError',
      code: 'UPSTREAM_TIMEOUT',
      message: '腾讯地图服务请求超时'
    }))
  })

  it('does not expose Tencent response messages or credentials in upstream errors', async () => {
    const client = createTencentMapClient({
      ...options,
      fetch: vi.fn().mockResolvedValue(jsonResponse({ status: 120, message: 'invalid test-secret for test-key' }))
    })

    let error
    try {
      await client.geocode({ address: '湖南省长沙市' })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(TencentMapGatewayError)
    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', message: '腾讯地图服务暂不可用' })
    expect(JSON.stringify(error)).not.toContain('test-secret')
    expect(JSON.stringify(error)).not.toContain('test-key')
  })
})

async function withGateway(handler, run) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    return await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('Tencent map same-origin HTTP gateway', () => {
  it('routes geocode and translate requests without exposing upstream credentials', async () => {
    const client = {
      geocode: vi.fn().mockResolvedValue({ provider: 'tencent', coordinateSystem: 'GCJ-02', longitude: 112.9, latitude: 28.2 }),
      translate: vi.fn().mockResolvedValue({ coordinateSystem: 'GCJ-02', locations: [{ longitude: 112.9, latitude: 28.2 }] }),
      direction: vi.fn().mockResolvedValue({ distanceKm: 12, durationMinutes: 20, polyline: [], segments: [] })
    }
    await withGateway(createTencentMapGatewayHandler({ client }), async (origin) => {
      const geocode = await fetch(`${origin}/api/tencent-map/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ address: '湖南省长沙市' })
      })
      expect(geocode.status).toBe(200)
      expect(await geocode.json()).toMatchObject({ provider: 'tencent', coordinateSystem: 'GCJ-02' })

      const translate = await fetch(`${origin}/api/tencent-map/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'GCJ-02', locations: [{ longitude: 112.9, latitude: 28.2 }] })
      })
      expect(translate.status).toBe(200)
      expect(await translate.json()).toEqual({ coordinateSystem: 'GCJ-02', locations: [{ longitude: 112.9, latitude: 28.2 }] })

      const direction = await fetch(`${origin}/api/tencent-map/direction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: { longitude: 109.85, latitude: 28.62 }, stops: [{ storeId: 'A', longitude: 109.86, latitude: 28.63 }] })
      })
      expect(direction.status).toBe(200)
      expect(await direction.json()).toMatchObject({ distanceKm: 12, durationMinutes: 20 })
    })
    expect(client.geocode).toHaveBeenCalledWith({ address: '湖南省长沙市' })
    expect(client.direction).toHaveBeenCalled()
  })

  it('rejects cross-origin, non-POST, unknown, and oversized requests', async () => {
    const client = { geocode: vi.fn(), translate: vi.fn() }
    const handler = createTencentMapGatewayHandler({ client, allowedOrigins: ['https://ops.example.com'], maxBodyBytes: 32 })
    await withGateway(handler, async (origin) => {
      expect((await fetch(`${origin}/api/tencent-map/geocode`)).status).toBe(405)
      expect((await fetch(`${origin}/api/tencent-map/missing`, { method: 'POST' })).status).toBe(404)
      expect((await fetch(`${origin}/api/tencent-map/geocode`, {
        method: 'POST', headers: { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' }, body: '{}'
      })).status).toBe(403)
      expect((await fetch(`${origin}/api/tencent-map/geocode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: 'x'.repeat(80) })
      })).status).toBe(413)
    })
    expect(client.geocode).not.toHaveBeenCalled()
  })

  it('returns standardized gateway errors and never serializes private error details', async () => {
    const client = {
      geocode: vi.fn().mockRejectedValue(new TencentMapGatewayError('UPSTREAM_ERROR', 'invalid secret test-secret')),
      translate: vi.fn()
    }
    await withGateway(createTencentMapGatewayHandler({ client }), async (origin) => {
      const response = await fetch(`${origin}/api/tencent-map/geocode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: '湖南省长沙市' })
      })
      const body = await response.text()
      expect(response.status).toBe(502)
      expect(JSON.parse(body)).toEqual({ error: { code: 'UPSTREAM_ERROR', message: '地图服务暂不可用' } })
      expect(body).not.toContain('test-secret')
    })
  })
})
