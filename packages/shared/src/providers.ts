import { optimizeDeliveryRoute } from './index'
import type { RouteOptimizationInput, RouteOptimizationOutput, RouteOrigin, RouteSegment } from './index'

export type ProviderResult<T = void> = { ok: true; value?: T } | { ok: false; code: string; message: string }

/**
 * Providers that create external side effects must treat the same non-empty
 * operationId as one idempotent request and return the original result on retry.
 */
export type PaymentQueryStatus = 'unknown' | 'confirmed' | 'failed'
export interface PaymentProvider {
  createPayment(input: { orderId: string; amount: number; operationId?: string }): Promise<ProviderResult<{ transactionId: string }>>
  queryPayment(input: { operationId: string }): Promise<ProviderResult<{ status: PaymentQueryStatus; transactionId?: string }>>
}
export interface RefundProvider { refundPayment(input: { transactionId: string; amount: number; operationId?: string }): Promise<ProviderResult<{ refundId: string }>> }
export interface LogisticsProvider { createShipment(input: { orderId: string; address: string; operationId?: string }): Promise<ProviderResult<{ trackingNo: string }>>; queryShipment(trackingNo: string): Promise<ProviderResult<{ status: string }>> }
export interface MapNavigationProvider { navigationUrl(input: { longitude: number; latitude: number; name: string }): string; openLocation?(input: { longitude: number; latitude: number; name: string }): Promise<ProviderResult> }
export interface SmsProvider { sendCode(input: { phone: string }): Promise<ProviderResult> }
export interface MediaStorageProvider { put(input: { key: string; data: string }): Promise<ProviderResult<{ url: string }>>; remove(key: string): Promise<ProviderResult> }
export interface BackupProvider { run(input: { reason: string }): Promise<ProviderResult<{ backupId: string }>>; restore(backupId: string): Promise<ProviderResult> }
export interface MonitoringProvider { capture(input: { event: string; payload?: unknown }): Promise<ProviderResult> }
export interface RouteOptimizationProvider { optimize(input: RouteOptimizationInput): Promise<ProviderResult<RouteOptimizationOutput>> }
export interface PlatformProviders { payment: PaymentProvider; refund: RefundProvider; logistics: LogisticsProvider; map: MapNavigationProvider; sms: SmsProvider; media: MediaStorageProvider; backup: BackupProvider; monitoring: MonitoringProvider; routeOptimization: RouteOptimizationProvider }

export function buildTencentNavigationUrl(input: { longitude: number; latitude: number; name: string }, referer = 'agritainment-platform'): string {
  const query = new URLSearchParams({
    type: 'drive',
    to: input.name,
    tocoord: `${input.latitude},${input.longitude}`,
    referer
  })
  return `https://apis.map.qq.com/uri/v1/routeplan?${query}`
}

export function buildTencentMapSearchUrl(keyword: string, referer = 'agritainment-platform'): string {
  return `https://apis.map.qq.com/uri/v1/search?${new URLSearchParams({ keyword, referer })}`
}

export function createDrivingRouteOptimizationProvider(options: {
  requestDirection?: (input: { origin: RouteOrigin; stops: Array<{ storeId: string; longitude: number; latitude: number }> }) => Promise<ProviderResult<{
    distanceKm: number
    durationMinutes: number
    polyline: RouteOrigin[]
    segments: RouteSegment[]
  }>>
  fetch?: typeof fetch
  gateway?: string
} = {}): RouteOptimizationProvider {
  const requestDirection = options.requestDirection || (async (input) => {
    const request = options.fetch || fetch
    const response = await request(options.gateway || '/api/tencent-map/direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (!response.ok) return { ok: false, code: 'UPSTREAM_ERROR', message: '地图服务暂不可用' }
    return { ok: true, value: await response.json() as { distanceKm: number; durationMinutes: number; polyline: RouteOrigin[]; segments: RouteSegment[] } }
  })
  return {
    async optimize(input) {
      try {
        const local = optimizeDeliveryRoute(input)
        if (!local) return { ok: false, code: 'invalid_route_input', message: 'Invalid route optimization input' }
        const located = local.orderedStops.filter((stop) => stop.longitude !== undefined && stop.latitude !== undefined)
        if (!located.length) return { ok: true, value: { ...local, provider: 'haversine', warnings: [...local.warnings, 'direction_fallback'] } }
        try {
          const directed = await requestDirection({
            origin: input.origin,
            stops: located.map((stop) => ({ storeId: stop.storeId, longitude: stop.longitude!, latitude: stop.latitude! }))
          })
          if (!directed.ok || !directed.value) {
            return { ok: true, value: { ...local, provider: 'haversine', warnings: [...local.warnings, 'direction_fallback'] } }
          }
          return {
            ok: true,
            value: {
              ...local,
              segments: directed.value.segments,
              totalDistanceKm: directed.value.distanceKm,
              estimatedDurationMinutes: directed.value.durationMinutes,
              polyline: directed.value.polyline,
              provider: 'tencent-direction'
            }
          }
        } catch {
          return { ok: true, value: { ...local, provider: 'haversine', warnings: [...local.warnings, 'direction_fallback'] } }
        }
      } catch {
        return { ok: false, code: 'route_optimization_failed', message: 'Route optimization failed' }
      }
    }
  }
}

export function createMockPlatformProviders(): PlatformProviders {
  const paymentOperations = new Map<string, string>()
  const refundOperations = new Map<string, string>()
  const shipmentOperations = new Map<string, string>()
  return {
    payment: {
      async createPayment(input) {
        const key = input.operationId || `payment:${input.orderId}`
        const transactionId = paymentOperations.get(key) || `mock-pay-${input.operationId || input.orderId}`
        paymentOperations.set(key, transactionId)
        return { ok: true, value: { transactionId } }
      },
      async queryPayment(input) {
        const transactionId = paymentOperations.get(input.operationId)
        return { ok: true, value: transactionId ? { status: 'confirmed', transactionId } : { status: 'unknown' } }
      }
    },
    refund: { async refundPayment(input) {
      const key = input.operationId || `refund:${input.transactionId}`
      const refundId = refundOperations.get(key) || `mock-refund-${input.operationId || input.transactionId}`
      refundOperations.set(key, refundId)
      return { ok: true, value: { refundId } }
    } },
    logistics: { async createShipment(input) {
      const key = input.operationId || `shipment:${input.orderId}`
      const trackingNo = shipmentOperations.get(key) || `MOCK-${input.operationId || input.orderId}`
      shipmentOperations.set(key, trackingNo)
      return { ok: true, value: { trackingNo } }
    }, async queryShipment() { return { ok: true, value: { status: 'shipping' } } } },
    map: { navigationUrl(input) { return buildTencentNavigationUrl(input) } },
    sms: { async sendCode() { return { ok: true } } },
    media: { async put(input) { return { ok: true, value: { url: `mock://${input.key}` } } }, async remove() { return { ok: true } } },
    backup: { async run() { return { ok: true, value: { backupId: `mock-backup-${Date.now()}` } } }, async restore() { return { ok: true } } },
    monitoring: { async capture() { return { ok: true } } },
    routeOptimization: { async optimize(input) {
      try {
        const value = optimizeDeliveryRoute(input)
        return value ? { ok: true, value } : { ok: false, code: 'invalid_route_input', message: 'Invalid route optimization input' }
      } catch {
        return { ok: false, code: 'route_optimization_failed', message: 'Route optimization failed' }
      }
    } }
  }
}

let configuredPlatformProviders = createMockPlatformProviders()

type PlatformProviderOverrides = Omit<Partial<PlatformProviders>, 'payment'> & { payment?: Partial<PaymentProvider> }

/** Replaces selected adapters while preserving mock defaults for unconfigured capabilities. */
export function configurePlatformProviders(overrides: PlatformProviderOverrides = {}): PlatformProviders {
  const defaults = createMockPlatformProviders()
  configuredPlatformProviders = { ...defaults, ...overrides, payment: { ...defaults.payment, ...overrides.payment } }
  return configuredPlatformProviders
}

export function getPlatformProviders(): PlatformProviders {
  return configuredPlatformProviders
}
