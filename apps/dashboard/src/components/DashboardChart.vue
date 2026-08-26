<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { init, type EChartsOption, type EChartsType } from '../echarts'

const props = defineProps<{
  id: string
  option: EChartsOption
  ariaLabel?: string
}>()
const emit = defineEmits<{
  select: [params: { componentType?: string; seriesType?: string; name?: string; data?: Record<string, unknown> }]
  error: [message: string]
}>()

let chart: EChartsType | null = null
let observer: ResizeObserver | null = null

function render() {
  if (!chart) return
  try {
    chart.setOption(props.option, true)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '图表渲染失败')
  }
}

function reset() {
  render()
}

defineExpose({ reset })

onMounted(async () => {
  await nextTick()
  const element = document.getElementById(props.id)
  if (!element) return
  try {
    chart = init(element, undefined, { renderer: 'canvas' })
    chart.on('click', (params) => emit('select', {
      componentType: params.componentType,
      seriesType: params.seriesType,
      name: params.name,
      data: params.data && typeof params.data === 'object' ? params.data as Record<string, unknown> : undefined
    }))
    render()
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(element)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '图表初始化失败')
  }
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <view :id="id" class="dashboard-chart" role="img" :aria-label="ariaLabel || '数据图表'" />
</template>

<style scoped>
.dashboard-chart { width: 100%; height: 100%; min-height: 0; }
</style>
