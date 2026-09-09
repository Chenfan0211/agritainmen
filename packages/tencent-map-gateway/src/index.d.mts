import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export type TencentCoordinateSource = 'GCJ-02' | 'WGS84' | 'SOGOU' | 'BAIDU' | 'MAPBAR' | 'SOGOU_MERCATOR'
export interface TencentCoordinate { longitude: number; latitude: number }

export class TencentMapGatewayError extends Error {
  code: string
  constructor(code: string, message: string)
}

export function createTencentSignature(path: string, params: Record<string, unknown>, secretKey: string): string
export function buildSignedTencentUrl(path: string, params: Record<string, unknown>, secretKey: string, origin?: string): string
export function tencentCoordinateType(source: TencentCoordinateSource): number
export function createTencentMapClient(options?: Record<string, unknown>): {
  geocode(input: { address: string; city?: string }): Promise<Record<string, unknown>>
  translate(input: { source: TencentCoordinateSource; locations: TencentCoordinate[] }): Promise<{ coordinateSystem: 'GCJ-02'; locations: TencentCoordinate[] }>
  direction(input: { origin: TencentCoordinate; stops: Array<TencentCoordinate & { storeId: string }> }): Promise<{
    distanceKm: number
    durationMinutes: number
    polyline: TencentCoordinate[]
    segments: Array<{ fromId: string; toStoreId: string; distanceKm: number }>
  }>
}
export function createTencentMapGatewayHandler(options?: Record<string, unknown>): (request: IncomingMessage, response: ServerResponse) => Promise<void>
export function createTencentMapVitePlugin(options?: Record<string, unknown>): Plugin
