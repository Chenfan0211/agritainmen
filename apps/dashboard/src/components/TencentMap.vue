<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DashboardCityMapPoint, DashboardMapPoint } from '@agritainment/shared'
import { buildTencentMapPoints, fitTencentMapViewport, layoutTencentMapPoints, loadTencentMapSdk, type TencentMapPointModel, type TencentMapRegionLevel } from '../tencent-map'

const props = defineProps<{
  apiKey: string
  styleId?: string
  regionLevel: TencentMapRegionLevel
  cityPoints: DashboardCityMapPoint[]
  farmPoints: DashboardMapPoint[]
  label: string
}>()

const emit = defineEmits<{
  (event: 'city-select', cityCode: string): void
  (event: 'farm-select', farmId: string): void
  (event: 'error', message: string): void
  (event: 'ready'): void
}>()

interface TMapRuntime {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => MapRuntime
  LatLng: new (latitude: number, longitude: number) => unknown
  LatLngBounds: new () => { extend(point: unknown): unknown }
  DOMOverlay: new (options: Record<string, unknown>) => OverlayRuntime
}

interface MapRuntime {
  destroy(): void
  fitBounds(bounds: unknown, options?: unknown): void
  setCenter(center: unknown): void
  setZoom(zoom: number): void
  on?(event: string, handler: () => void): void
  off?(event: string, handler: () => void): void
  projectToContainer(position: unknown): { getX?(): number; getY?(): number; x?: number; y?: number }
}

interface OverlayRuntime { setMap(map: MapRuntime | null): void }

const container = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const points = computed(() => buildTencentMapPoints(props.regionLevel, props.cityPoints, props.farmPoints))
let TMap: TMapRuntime | null = null
let map: MapRuntime | null = null
let overlays: OverlayRuntime[] = []
let layoutTimer: ReturnType<typeof setTimeout> | null = null

function containerElement(): HTMLElement | null {
  const value = container.value
  if (!value) return null
  return value instanceof HTMLElement ? value : value.$el || null
}

function money(value: number) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function pointStatus(point: TencentMapPointModel) {
  if (point.kind === 'city') return point.riskCount ? `风险 ${point.riskCount} 项` : '暂无风险'
  return point.tone === 'active' ? '经营中' : point.tone === 'pending' ? '筹备中' : '已停用'
}

function layoutOverlays() {
  const element = containerElement()
  if (!element) return
  const models = Array.from(element.querySelectorAll<HTMLElement>('.tencent-map-point')).flatMap((point) => {
    const x = Number(point.dataset.mapX)
    const y = Number(point.dataset.mapY)
    return Number.isFinite(x) && Number.isFinite(y) ? [{ id: point.dataset.mapPointId || '', x, y, element: point }] : []
  })
  const minimumDistance = props.regionLevel === 'province' ? 36 : 30
  layoutTencentMapPoints(models, element.clientWidth, element.clientHeight, minimumDistance).forEach((point) => {
    point.element.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0) translate(-50%, -50%)`
  })
}

function scheduleOverlayLayout() {
  if (layoutTimer) clearTimeout(layoutTimer)
  layoutTimer = setTimeout(layoutOverlays, 30)
}

function createOverlayClass(runtime: TMapRuntime) {
  return class DashboardPointOverlay extends runtime.DOMOverlay {
    map!: MapRuntime | null
    position!: unknown
    point!: TencentMapPointModel
    dom!: HTMLElement
    select!: () => void

    onInit(options: { position: unknown; point: TencentMapPointModel; select: () => void }) {
      this.position = options.position
      this.point = options.point
      this.select = options.select
    }

    createDOM() {
      const root = document.createElement('button')
      root.type = 'button'
      root.className = `tencent-map-point point-${this.point.kind} tone-${this.point.tone}`
      root.dataset.mapPointId = this.point.id
      root.setAttribute('aria-label', this.point.kind === 'city' ? `${this.point.title}，${this.point.count || 0}家门店` : `${this.point.title}，${pointStatus(this.point)}`)
      const glyph = document.createElement('span')
      glyph.className = 'point-glyph'
      glyph.textContent = this.point.kind === 'city' ? String(this.point.count || 0) : ''
      root.appendChild(glyph)
      const tooltip = document.createElement('span')
      tooltip.className = 'point-tooltip'
      const title = document.createElement('strong')
      title.textContent = this.point.title
      const detail = document.createElement('small')
      detail.textContent = this.point.subtitle
      const metrics = document.createElement('small')
      metrics.textContent = `交易额 ¥${money(this.point.transactionAmount)} · ${pointStatus(this.point)}`
      tooltip.append(title, detail, metrics)
      root.appendChild(tooltip)
      root.addEventListener('click', this.select)
      this.dom = root
      return root
    }

    updateDOM() {
      if (!this.map || !this.dom) return
      const pixel = this.map.projectToContainer(this.position)
      const x = pixel.getX ? pixel.getX() : Number(pixel.x || 0)
      const y = pixel.getY ? pixel.getY() : Number(pixel.y || 0)
      this.dom.dataset.mapX = String(x)
      this.dom.dataset.mapY = String(y)
      this.dom.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
      scheduleOverlayLayout()
    }

    onDestroy() {
      this.dom?.removeEventListener('click', this.select)
    }
  }
}

function clearOverlays() {
  overlays.forEach((overlay) => overlay.setMap(null))
  overlays = []
}

function renderPoints() {
  if (!TMap || !map) return
  clearOverlays()
  const Overlay = createOverlayClass(TMap)
  overlays = points.value.map((point) => new Overlay({
    map,
    point,
    position: new TMap!.LatLng(point.latitude, point.longitude),
    select: () => point.kind === 'city' && point.cityCode ? emit('city-select', point.cityCode) : point.farmId ? emit('farm-select', point.farmId) : undefined
  }))
  reset()
  scheduleOverlayLayout()
}

async function initialize() {
  status.value = 'loading'
  errorMessage.value = ''
  try {
    TMap = await loadTencentMapSdk({ key: props.apiKey }) as TMapRuntime
    await nextTick()
    const element = containerElement()
    if (!element) throw new Error('腾讯地图容器初始化失败')
    if (!map) {
      map = new TMap.Map(element, {
        center: new TMap.LatLng(27.8, 111.7),
        zoom: 7,
        pitch: 0,
        rotation: 0,
        viewMode: '2D',
        ...(props.styleId?.trim() ? { mapStyleId: props.styleId.trim() } : {})
      })
      map.on?.('idle', scheduleOverlayLayout)
    }
    renderPoints()
    status.value = 'ready'
    emit('ready')
  } catch (error) {
    const message = error instanceof Error ? error.message : '腾讯地图加载失败'
    errorMessage.value = message
    status.value = 'error'
    emit('error', message)
  }
}

function retry() {
  initialize()
}

function reset() {
  if (!map || !TMap) return
  fitTencentMapViewport(map, TMap, points.value)
}

watch(points, () => {
  if (map) renderPoints()
}, { deep: true })

onMounted(initialize)
onBeforeUnmount(() => {
  clearOverlays()
  if (layoutTimer) clearTimeout(layoutTimer)
  map?.off?.('idle', scheduleOverlayLayout)
  map?.destroy()
  map = null
})

defineExpose({ reset })
</script>

<template>
  <view class="tencent-map-shell" :aria-label="label" :data-visual-state="status">
    <view ref="container" class="tencent-map-canvas" />
    <view v-if="status === 'loading'" class="map-state" role="status">腾讯地图加载中...</view>
    <view v-else-if="status === 'error'" class="map-state map-state-error" role="alert">
      <strong>{{ errorMessage }}</strong>
      <button type="button" @click="retry">重试</button>
    </view>
    <view v-else-if="!points.length" class="map-state">当前区域暂无已定位门店</view>
  </view>
</template>

<style scoped>
.tencent-map-shell,.tencent-map-canvas { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.tencent-map-canvas { position: absolute; inset: 0; background: #081722; }
.map-state { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #9fb6c0; background: rgba(7, 20, 29, .9); font-size: 13px; }
.map-state strong { color: #ff9b9b; font-weight: 500; }.map-state button { height: 30px; padding: 0 14px; border: 1px solid #2f7f7a; border-radius: 3px; color: #8ce6dd; background: #0b292b; cursor: pointer; }
:deep(.tencent-map-point) { position: absolute; top: 0; left: 0; z-index: 3; width: 30px; height: 30px; margin: 0; padding: 0; overflow: visible; border: 0; border-radius: 50%; color: #07151d; background: transparent; cursor: pointer; }
:deep(.point-glyph) { width: 100%; height: 100%; display: grid; place-items: center; border: 2px solid rgba(236, 252, 252, .9); border-radius: 50%; background: #26d1c1; box-shadow: 0 0 0 5px rgba(38, 209, 193, .16), 0 4px 14px rgba(0, 0, 0, .48); font: 700 13px/1 "Microsoft YaHei", sans-serif; }
:deep(.point-city) { width: 34px; height: 34px; }.point-city :deep(.point-glyph) { background: #22cfbb; }.point-city.tone-risk :deep(.point-glyph) { border-color: #ffd17a; background: #f2b84b; box-shadow: 0 0 0 5px rgba(242, 184, 75, .2), 0 4px 14px rgba(0, 0, 0, .48); }
.tone-active :deep(.point-glyph) { background: #4dd28a; }.tone-pending :deep(.point-glyph) { background: #efbd4e; }.tone-paused :deep(.point-glyph) { background: #82939c; }
:deep(.point-farm .point-glyph::after) { width: 7px; height: 7px; border-radius: 50%; background: #f4ffff; content: ""; }
:deep(.point-tooltip) { position: absolute; left: 50%; bottom: calc(100% + 10px); width: 218px; padding: 10px 12px; display: none; flex-direction: column; gap: 4px; transform: translateX(-50%); border: 1px solid #315b68; border-radius: 4px; color: #dcebed; background: rgba(7, 25, 34, .96); box-shadow: 0 10px 28px rgba(0, 0, 0, .42); text-align: left; pointer-events: none; }
:deep(.point-tooltip::after) { position: absolute; top: 100%; left: 50%; width: 8px; height: 8px; transform: translate(-50%, -50%) rotate(45deg); border-right: 1px solid #315b68; border-bottom: 1px solid #315b68; background: #071922; content: ""; }
:deep(.point-tooltip strong) { overflow: hidden; color: #f0f8f9; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.tencent-map-shell :deep(.point-tooltip small) { color: #91aab4; font-size: 13px; line-height: 1.45; }
:deep(.tencent-map-point:hover),:deep(.tencent-map-point:focus-visible) { z-index: 6; outline: none; }.tencent-map-shell :deep(.tencent-map-point:hover .point-tooltip),.tencent-map-shell :deep(.tencent-map-point:focus-visible .point-tooltip) { display: flex; }
</style>
