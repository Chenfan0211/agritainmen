<template>
  <view class="delivery-route-map" :aria-label="summary">
    <view class="delivery-route-map-overlay">{{ summary }}</view>
    <view class="delivery-route-map-stops">
      <text v-for="marker in markers" :key="marker.id" class="delivery-route-map-pin" :class="marker.id === 'origin' ? 'origin' : 'stop'">{{ marker.label }}</text>
    </view>
    <!-- #ifdef H5 -->
    <view ref="container" class="delivery-route-map-canvas" />
    <text v-if="status === 'error'" class="delivery-route-map-fallback">地图暂不可用，可使用站点导航</text>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteOrigin, RouteStop } from '@agritainment/shared'
import { deliveryMapMarkers, deliveryMapSummary, loadTencentMapSdk } from '../delivery-map'

const props = defineProps<{
  origin?: RouteOrigin
  stops: RouteStop[]
  polyline?: RouteOrigin[]
  stopCount: number
  totalDistanceKm: number
  estimatedDurationMinutes: number
}>()

const container = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const status = ref<'idle' | 'ready' | 'error'>('idle')
const summary = computed(() => deliveryMapSummary({
  stopCount: props.stopCount,
  totalDistanceKm: props.totalDistanceKm,
  estimatedDurationMinutes: props.estimatedDurationMinutes
}))
const markers = computed(() => deliveryMapMarkers({ origin: props.origin, stops: props.stops }))

interface MapRuntime {
  destroy(): void
  fitBounds(bounds: unknown, options?: unknown): void
}
let map: MapRuntime | null = null
let overlays: Array<{ setMap(value: unknown): void }> = []

function containerElement(): HTMLElement | null {
  const value = container.value
  if (!value) return null
  return value instanceof HTMLElement ? value : value.$el || null
}

function clearOverlays() {
  overlays.forEach((item) => item.setMap(null))
  overlays = []
}

async function renderMap() {
  const element = containerElement()
  const key = String(import.meta.env.VITE_TENCENT_MAP_JS_KEY || '').trim()
  if (import.meta.env.VITE_E2E === '1' || !element || !key) {
    status.value = import.meta.env.VITE_E2E === '1' || !key ? 'error' : 'idle'
    return
  }
  try {
    const TMap = await loadTencentMapSdk({ key }) as {
      Map: new (node: HTMLElement, options: Record<string, unknown>) => MapRuntime
      LatLng: new (latitude: number, longitude: number) => unknown
      LatLngBounds: new () => { extend(point: unknown): void }
      LabelStyle: new (options: Record<string, unknown>) => unknown
      MultiLabel: new (options: Record<string, unknown>) => { setMap(value: unknown): void }
      MultiPolyline: new (options: Record<string, unknown>) => { setMap(value: unknown): void }
    }
    if (!map) map = new TMap.Map(element, { zoom: 11, showControl: false })
    clearOverlays()
    const labelPoints = markers.value.map((marker) => ({
      id: marker.id,
      styleId: marker.id === 'origin' ? 'origin' : 'stop',
      position: new TMap.LatLng(marker.latitude, marker.longitude),
      content: marker.label
    }))
    if (labelPoints.length) {
      overlays.push(new TMap.MultiLabel({
        map,
        geometries: labelPoints,
        styles: {
          origin: new TMap.LabelStyle({
            color: '#ffffff', size: 12, offset: { x: 0, y: 0 }, alignment: 'center', verticalAlignment: 'middle',
            backgroundColor: '#1f6b3a', padding: { top: 2, right: 6, bottom: 2, left: 6 }, borderRadius: 10
          }),
          stop: new TMap.LabelStyle({
            color: '#ffffff', size: 12, offset: { x: 0, y: 0 }, alignment: 'center', verticalAlignment: 'middle',
            backgroundColor: '#16351f', padding: { top: 2, right: 6, bottom: 2, left: 6 }, borderRadius: 10
          })
        }
      }))
    }
    const path = (props.polyline?.length ? props.polyline : [
      ...(props.origin ? [props.origin] : []),
      ...props.stops.filter((stop) => stop.longitude !== undefined && stop.latitude !== undefined).map((stop) => ({ longitude: stop.longitude!, latitude: stop.latitude! }))
    ]).map((point) => new TMap.LatLng(point.latitude, point.longitude))
    if (path.length > 1) {
      overlays.push(new TMap.MultiPolyline({ map, geometries: [{ paths: [path] }] }))
    }
    const bounds = new TMap.LatLngBounds()
    path.forEach((point) => bounds.extend(point))
    if (path.length) map.fitBounds(bounds, { padding: 32 })
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
}

onMounted(() => { void renderMap() })
watch(() => [props.origin, props.stops, props.polyline], () => { void renderMap() }, { deep: true })
onBeforeUnmount(() => {
  clearOverlays()
  map?.destroy()
  map = null
})
</script>

<style scoped>
.delivery-route-map {
  position: relative;
  width: 100%;
  min-height: 180px;
  overflow: hidden;
  border: 1px solid var(--mobile-border, #d7e0d8);
  border-radius: 8px;
  background: #eef3ef;
}
.delivery-route-map-canvas { width: 100%; height: 180px; }
.delivery-route-map-overlay {
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 8px;
  right: 8px;
  min-height: 28px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, .92);
  color: #16351f;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}
.delivery-route-map-stops {
  position: absolute;
  z-index: 2;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.delivery-route-map-pin {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 8px;
  background: #16351f;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
}
.delivery-route-map-pin.origin { background: #1f6b3a; }
.delivery-route-map-fallback {
  display: block;
  padding: 8px;
  color: #5b6d61;
  font-size: 12px;
}
</style>
