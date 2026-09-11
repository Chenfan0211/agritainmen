<template>
  <view class="delivery-route-map" :aria-label="summary">
    <view class="delivery-route-map-overlay">{{ summary }}</view>
    <view class="delivery-route-map-stops">
      <button v-for="marker in markers" :key="marker.id" class="delivery-route-map-pin" :class="{ origin: marker.id === 'origin', stop: marker.id !== 'origin', 'is-selected': marker.id === selectedStopId }" @click.stop="selectMarker(marker.id)">{{ marker.label }}</button>
    </view>
    <!-- #ifdef MP-WEIXIN -->
    <map class="delivery-route-map-native" :latitude="mapCenter.latitude" :longitude="mapCenter.longitude" :scale="12" :markers="nativeMarkers" :polyline="nativePolyline" show-scale @markertap="handleNativeMarkerTap" />
    <!-- #endif -->
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
  selectedStopId?: string
}>()
const emit = defineEmits<{ 'select-stop': [storeId: string] }>()

const container = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const status = ref<'idle' | 'ready' | 'error'>('idle')
const selectedStopId = computed(() => props.selectedStopId || '')
const summary = computed(() => deliveryMapSummary({
  stopCount: props.stopCount,
  totalDistanceKm: props.totalDistanceKm,
  estimatedDurationMinutes: props.estimatedDurationMinutes
}))
const markers = computed(() => deliveryMapMarkers({ origin: props.origin, stops: props.stops }))
const mapPoints = computed(() => [
  ...(props.origin ? [props.origin] : []),
  ...props.stops.filter((stop) => stop.longitude !== undefined && stop.latitude !== undefined).map((stop) => ({ longitude: stop.longitude!, latitude: stop.latitude! }))
])
const mapCenter = computed(() => mapPoints.value[0] || { longitude: 111.7, latitude: 27.8 })
const nativeMarkers = computed(() => markers.value.map((marker, index) => ({
  id: index,
  latitude: marker.latitude,
  longitude: marker.longitude,
  width: 24,
  height: 24,
  callout: { content: marker.label, display: 'ALWAYS', color: '#ffffff', bgColor: marker.id === 'origin' ? '#1f6b3a' : marker.id === selectedStopId.value ? '#2f5bb3' : '#16351f', borderRadius: 12, padding: 4 }
})))
const nativePolyline = computed(() => {
  const points = props.polyline?.length ? props.polyline : mapPoints.value
  return points.length > 1 ? [{ points: points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })), color: '#1f6b3a', width: 5, arrowLine: true }] : []
})

function selectMarker(id: string) {
  if (id !== 'origin') emit('select-stop', id)
}

function handleNativeMarkerTap(event: { detail?: { markerId?: number } }) {
  const marker = markers.value[event.detail?.markerId ?? -1]
  if (marker) selectMarker(marker.id)
}

interface MapRuntime {
  destroy(): void
  fitBounds(bounds: unknown, options?: unknown): void
}
let map: MapRuntime | null = null
interface MapOverlay {
  setMap(value: unknown): void
  on?: (event: string, handler: (payload: { geometry?: { id?: string }; detail?: { id?: string; geometryId?: string } }) => void) => void
}
let overlays: MapOverlay[] = []

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
      MultiLabel: new (options: Record<string, unknown>) => MapOverlay
      MultiPolyline: new (options: Record<string, unknown>) => { setMap(value: unknown): void }
    }
    if (!map) map = new TMap.Map(element, { zoom: 11, showControl: false })
    clearOverlays()
    const labelPoints = markers.value.map((marker) => ({
      id: marker.id,
      styleId: marker.id === 'origin' ? 'origin' : marker.id === selectedStopId.value ? 'selected' : 'stop',
      position: new TMap.LatLng(marker.latitude, marker.longitude),
      content: marker.label
    }))
    if (labelPoints.length) {
      const labels = new TMap.MultiLabel({
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
          }),
          selected: new TMap.LabelStyle({
            color: '#ffffff', size: 12, offset: { x: 0, y: 0 }, alignment: 'center', verticalAlignment: 'middle',
            backgroundColor: '#2f5bb3', padding: { top: 3, right: 7, bottom: 3, left: 7 }, borderRadius: 10
          })
        }
      })
      labels.on?.('click', (event) => {
        const id = event.geometry?.id || event.detail?.id || event.detail?.geometryId
        if (id) selectMarker(id)
      })
      overlays.push(labels)
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
watch(() => [props.origin, props.stops, props.polyline, props.selectedStopId], () => { void renderMap() }, { deep: true })
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
.delivery-route-map-native { width: 100%; height: 220px; }
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  border: 0;
}
.delivery-route-map-pin.origin { background: #1f6b3a; }
.delivery-route-map-pin.is-selected { background: #2f5bb3; box-shadow: 0 0 0 2px rgba(255, 255, 255, .9), 0 0 0 4px rgba(47, 91, 179, .28); }
.delivery-route-map-fallback {
  display: block;
  padding: 8px;
  color: #5b6d61;
  font-size: 12px;
}
</style>
