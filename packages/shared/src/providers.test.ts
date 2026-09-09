import { afterEach, describe, expect, it } from 'vitest'
import * as providersModule from './providers'
import { configurePlatformProviders, createDrivingRouteOptimizationProvider, createMockPlatformProviders } from './providers'

type RouteProvider = {
  optimize(input: {
    origin: { longitude: number; latitude: number }
    stops: Array<{ storeId: string; storeName: string; address: string; longitude?: number; latitude?: number; orderIds: string[] }>
  }): Promise<{ ok: boolean; code?: string; value?: { orderedStops: Array<{ storeId: string }>; segments: Array<{ distanceKm: number }>; totalDistanceKm: number; estimatedDurationMinutes: number; provider: string; warnings: string[] } }>
}

afterEach(() => { configurePlatformProviders() })

describe('platform provider contracts', () => {
  it('offers deterministic mock adapters for every external capability', async () => {
    const providers = createMockPlatformProviders()
    expect(await providers.payment.createPayment({ orderId: 'O1', amount: 10 })).toMatchObject({ ok: true, value: { transactionId: 'mock-pay-O1' } })
    expect(await providers.refund.refundPayment({ transactionId: 'mock-pay-O1', amount: 10 })).toMatchObject({ ok: true, value: { refundId: expect.any(String) } })
    expect(await providers.logistics.createShipment({ orderId: 'O1', address: '湖南' })).toMatchObject({ ok: true, value: { trackingNo: 'MOCK-O1' } })
    const navigation = new URL(providers.map.navigationUrl({ longitude: 110, latitude: 28, name: '门店' }))
    expect(`${navigation.origin}${navigation.pathname}`).toBe('https://apis.map.qq.com/uri/v1/routeplan')
    expect(Object.fromEntries(navigation.searchParams)).toMatchObject({ type: 'drive', to: '门店', tocoord: '28,110', referer: 'agritainment-platform' })
    expect(await providers.sms.sendCode({ phone: '13800000000' })).toMatchObject({ ok: true })
    expect(await providers.media.put({ key: 'a.jpg', data: 'data:image/png;base64,x' })).toMatchObject({ ok: true, value: { url: 'mock://a.jpg' } })
    expect(await providers.backup.run({ reason: 'test' })).toMatchObject({ ok: true, value: { backupId: expect.any(String) } })
    expect(await providers.monitoring.capture({ event: 'test' })).toMatchObject({ ok: true })
  })

  it('keeps configurable singleton providers idempotent by operationId', async () => {
    type ProviderAccess = {
      getPlatformProviders?: () => ReturnType<typeof createMockPlatformProviders>
      configurePlatformProviders?: (overrides?: Partial<ReturnType<typeof createMockPlatformProviders>>) => ReturnType<typeof createMockPlatformProviders>
    }
    const { getPlatformProviders, configurePlatformProviders } = providersModule as ProviderAccess

    expect(getPlatformProviders).toBeTypeOf('function')
    expect(configurePlatformProviders).toBeTypeOf('function')
    configurePlatformProviders!()
    const providers = getPlatformProviders!()

    expect(await providers.payment.createPayment({ orderId: 'O1', amount: 10, operationId: 'PAY-1' })).toEqual(await providers.payment.createPayment({ orderId: 'O1', amount: 10, operationId: 'PAY-1' }))
    expect(await providers.refund.refundPayment({ transactionId: 'mock-pay-O1', amount: 10, operationId: 'REFUND-1' })).toEqual(await providers.refund.refundPayment({ transactionId: 'mock-pay-O1', amount: 10, operationId: 'REFUND-1' }))
    expect(await providers.logistics.createShipment({ orderId: 'O1', address: '湖南', operationId: 'SHIP-1' })).toEqual(await providers.logistics.createShipment({ orderId: 'O1', address: '湖南', operationId: 'SHIP-1' }))
  })

  it('queries the same mock payment operation before and after confirmation', async () => {
    const providers = createMockPlatformProviders()

    expect(await providers.payment.queryPayment({ operationId: 'PAY-QUERY-1' })).toEqual({
      ok: true,
      value: { status: 'unknown' }
    })

    const created = await providers.payment.createPayment({ orderId: 'O1', amount: 10, operationId: 'PAY-QUERY-1' })

    expect(await providers.payment.queryPayment({ operationId: 'PAY-QUERY-1' })).toEqual({
      ok: true,
      value: { status: 'confirmed', transactionId: created.ok ? created.value?.transactionId : undefined }
    })
  })

  it('orders coordinate stops deterministically, leaves missing coordinates last, and reports route metrics', async () => {
    const providers = createMockPlatformProviders() as ReturnType<typeof createMockPlatformProviders> & { routeOptimization?: RouteProvider }
    expect(providers.routeOptimization).toBeDefined()
    if (!providers.routeOptimization) return
    const tiedStops = [
      { storeId: 'STORE-B', storeName: 'B', address: 'B road', longitude: 1, latitude: 0, orderIds: ['O-B'] },
      { storeId: 'STORE-Z', storeName: 'Z', address: 'Z road', orderIds: ['O-Z'] },
      { storeId: 'STORE-A', storeName: 'A', address: 'A road', longitude: -1, latitude: 0, orderIds: ['O-A'] }
    ]
    const result = await providers.routeOptimization.optimize({ origin: { longitude: 0, latitude: 0 }, stops: tiedStops })
    expect(result).toMatchObject({ ok: true, value: { provider: 'mock-route-optimization', warnings: ['missing_coordinates:STORE-Z'] } })
    if (!result.ok || !result.value) throw new Error('expected successful route optimization')
    expect(result.value.orderedStops.map((stop) => stop.storeId)).toEqual(['STORE-A', 'STORE-B', 'STORE-Z'])
    expect(result.value.segments).toHaveLength(2)
    expect(result.value.totalDistanceKm).toBeGreaterThan(0)
    expect(result.value.estimatedDurationMinutes).toBeGreaterThan(0)
  })

  it('uses deterministic 2-opt without returning a longer route than nearest-neighbor', async () => {
    const providers = createMockPlatformProviders() as ReturnType<typeof createMockPlatformProviders> & { routeOptimization?: RouteProvider }
    expect(providers.routeOptimization).toBeDefined()
    if (!providers.routeOptimization) return
    const result = await providers.routeOptimization.optimize({
      origin: { longitude: 0, latitude: 0 },
      stops: [
        { storeId: 'A', storeName: 'A', address: 'A', longitude: 0, latitude: 1, orderIds: ['A'] },
        { storeId: 'B', storeName: 'B', address: 'B', longitude: 0, latitude: 2, orderIds: ['B'] },
        { storeId: 'C', storeName: 'C', address: 'C', longitude: 0, latitude: 4, orderIds: ['C'] },
        { storeId: 'D', storeName: 'D', address: 'D', longitude: 1, latitude: 1, orderIds: ['D'] }
      ]
    })
    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) throw new Error('expected successful route optimization')
    expect(result.value.totalDistanceKm).toBeLessThanOrEqual(731.5)
    expect(result.value.orderedStops.map((stop) => stop.storeId)).toEqual(['A', 'D', 'B', 'C'])
  })

  it('returns a provider error for invalid input without modifying the caller payload', async () => {
    const providers = createMockPlatformProviders() as ReturnType<typeof createMockPlatformProviders> & { routeOptimization?: RouteProvider }
    expect(providers.routeOptimization).toBeDefined()
    if (!providers.routeOptimization) return
    const input = {
      origin: { longitude: Number.NaN, latitude: 0 },
      stops: [{ storeId: 'STORE-A', storeName: 'A', address: 'A road', longitude: 1, latitude: 1, orderIds: ['O-A'] }]
    }
    const before = structuredClone(input)
    expect(await providers.routeOptimization.optimize(input)).toEqual({ ok: false, code: 'invalid_route_input', message: 'Invalid route optimization input' })
    expect(input).toEqual(before)
  })

  it('enriches a locally ordered route with Tencent driving metrics and falls back when the gateway fails', async () => {
    const stops = [
      { storeId: 'A', storeName: 'A', address: 'A', longitude: 109.86, latitude: 28.63, orderIds: ['O-A'] },
      { storeId: 'B', storeName: 'B', address: 'B', longitude: 110.48, latitude: 29.12, orderIds: ['O-B'] },
      { storeId: 'Z', storeName: 'Z', address: 'Z', orderIds: ['O-Z'] }
    ]
    const success = createDrivingRouteOptimizationProvider({
      requestDirection: async () => ({
        ok: true,
        value: {
          distanceKm: 88.4,
          durationMinutes: 120,
          polyline: [{ longitude: 109.85, latitude: 28.62 }, { longitude: 110.48, latitude: 29.12 }],
          segments: [
            { fromId: 'origin', toStoreId: 'A', distanceKm: 12.2 },
            { fromId: 'A', toStoreId: 'B', distanceKm: 76.2 }
          ]
        }
      })
    })
    const enriched = await success.optimize({ origin: { longitude: 109.85, latitude: 28.62 }, stops })
    expect(enriched).toMatchObject({
      ok: true,
      value: {
        provider: 'tencent-direction',
        totalDistanceKm: 88.4,
        estimatedDurationMinutes: 120,
        polyline: [{ longitude: 109.85, latitude: 28.62 }, { longitude: 110.48, latitude: 29.12 }],
        warnings: ['missing_coordinates:Z']
      }
    })
    if (enriched.ok && enriched.value) expect(enriched.value.orderedStops.map((stop) => stop.storeId)).toEqual(['A', 'B', 'Z'])

    const fallback = createDrivingRouteOptimizationProvider({
      requestDirection: async () => ({ ok: false, code: 'UPSTREAM_ERROR', message: '地图服务暂不可用' })
    })
    const local = await fallback.optimize({ origin: { longitude: 109.85, latitude: 28.62 }, stops })
    expect(local).toMatchObject({ ok: true, value: { provider: 'haversine', warnings: ['missing_coordinates:Z', 'direction_fallback'] } })
    expect(local.ok && local.value && local.value.totalDistanceKm).toBeGreaterThan(0)
  })
})
