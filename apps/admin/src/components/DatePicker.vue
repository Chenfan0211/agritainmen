<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiIcon from './UiIcon.vue'
import { buildMonthGrid, monthLabel, parseDate, shiftMonth, todayDate } from './date-picker'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  ariaLabel?: string
}>(), {
  placeholder: '请选择日期'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const open = ref(false)
const panelStyle = ref<Record<string, string>>({})
const view = ref(parseDate(props.modelValue) || parseDate(todayDate()) || { year: 2026, month: 1, day: 1 })

const cells = computed(() => buildMonthGrid(view.value.year, view.value.month))
const title = computed(() => monthLabel(view.value.year, view.value.month))
const displayValue = computed(() => props.modelValue || props.placeholder)
const resolvedAriaLabel = computed(() => props.ariaLabel?.trim() || props.placeholder)

function positionPanel() {
  const trigger = rootEl.value?.getBoundingClientRect()
  if (!trigger) return
  const viewportGap = 8
  const panelGap = 4
  const width = Math.max(trigger.width, 280)
  const panelHeight = panelEl.value?.offsetHeight || 320
  const spaceBelow = Math.max(0, window.innerHeight - trigger.bottom - panelGap - viewportGap)
  const spaceAbove = Math.max(0, trigger.top - panelGap - viewportGap)
  const placeBelow = spaceBelow >= Math.min(panelHeight, 200) || spaceBelow >= spaceAbove
  const availableHeight = placeBelow ? spaceBelow : spaceAbove
  const constrainedHeight = Math.min(panelHeight, availableHeight)
  const top = placeBelow
    ? trigger.bottom + panelGap
    : Math.max(viewportGap, trigger.top - constrainedHeight - panelGap)
  const left = Math.min(Math.max(viewportGap, trigger.left), Math.max(viewportGap, window.innerWidth - width - viewportGap))
  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`
  }
}

function syncView() {
  const selected = parseDate(props.modelValue)
  view.value = selected || parseDate(todayDate()) || view.value
}

async function openPanel() {
  if (open.value) return
  syncView()
  open.value = true
  await nextTick()
  positionPanel()
  await nextTick()
  positionPanel()
}

function closePanel(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) nextTick(() => rootEl.value?.querySelector<HTMLElement>('.date-picker__trigger')?.focus())
}

function togglePanel() {
  if (open.value) closePanel()
  else openPanel()
}

function commit(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
  closePanel(true)
}

function chooseCell(date: string) {
  commit(date)
}

function chooseToday() {
  commit(todayDate())
}

function clearValue() {
  commit('')
}

function moveMonth(delta: number) {
  view.value = { ...shiftMonth(view.value, delta), day: 1 }
  nextTick(positionPanel)
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    openPanel()
  }
}

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePanel(true)
  }
}

function handleDocumentPointer(event: Event) {
  const target = event.target as Node | null
  if (target && !rootEl.value?.contains(target) && !panelEl.value?.contains(target)) closePanel()
}

function handleViewportChange() {
  if (open.value) positionPanel()
}

watch(() => props.modelValue, () => {
  if (!open.value) syncView()
})

document.addEventListener('mousedown', handleDocumentPointer)
document.addEventListener('touchstart', handleDocumentPointer)
window.addEventListener('resize', handleViewportChange)
window.addEventListener('scroll', handleViewportChange, true)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointer)
  document.removeEventListener('touchstart', handleDocumentPointer)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <div ref="rootEl" class="date-picker">
    <div
      class="date-picker__trigger filter-control picker-field"
      role="combobox"
      tabindex="0"
      :aria-expanded="open"
      :aria-label="resolvedAriaLabel"
      aria-haspopup="dialog"
      @click="togglePanel"
      @keydown="handleTriggerKeydown"
    >
      <UiIcon name="calendar-days" :size="16" />
      <text :class="{ placeholder: !modelValue }">{{ displayValue }}</text>
    </div>
    <Teleport to="body">
      <div v-if="open" ref="panelEl" class="date-picker__panel" role="dialog" :aria-label="resolvedAriaLabel" :style="panelStyle" @keydown="handlePanelKeydown">
        <div class="date-picker__head">
          <button type="button" class="date-picker__nav" aria-label="上一月" @click="moveMonth(-1)"><UiIcon name="arrow-left" :size="16" /></button>
          <strong>{{ title }}</strong>
          <button type="button" class="date-picker__nav" aria-label="下一月" @click="moveMonth(1)"><UiIcon name="arrow-right" :size="16" /></button>
        </div>
        <div class="date-picker__weekdays">
          <text v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</text>
        </div>
        <div class="date-picker__grid">
          <button
            v-for="cell in cells"
            :key="cell.date"
            type="button"
            class="date-picker__day"
            :class="{ 'is-muted': !cell.currentMonth, 'is-today': cell.today && cell.date !== modelValue, 'is-selected': cell.date === modelValue }"
            @click="chooseCell(cell.date)"
          >{{ cell.day }}</button>
        </div>
        <div class="date-picker__foot">
          <button type="button" class="date-picker__action" @click="clearValue">清除</button>
          <button type="button" class="date-picker__action is-today-action" @click="chooseToday">今天</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.date-picker { min-width: 0; width: 100%; color: var(--admin-ink); }
.date-picker__trigger { width: 100%; height: var(--admin-control-height); padding: 0 11px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--admin-line); border-radius: var(--admin-radius-control); background: var(--color-card); box-sizing: border-box; font-size: 13px; cursor: pointer; }
.date-picker__trigger:focus-visible { border-color: var(--admin-green-2); box-shadow: 0 0 0 2px var(--color-focus-ring); outline: 0; }
.date-picker__trigger text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date-picker__trigger text.placeholder { color: var(--admin-muted); }
.date-picker__panel { position: fixed; z-index: 120; padding: 12px; border: 1px solid var(--admin-line); border-radius: var(--admin-radius-panel); background: var(--color-card); box-shadow: var(--shadow-card); color: var(--admin-ink); }
.date-picker__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.date-picker__head strong { font-size: 14px; font-weight: 700; }
.date-picker__nav { width: 32px; height: 32px; margin: 0; padding: 0; border: 0; border-radius: var(--radius-nav); background: transparent; color: inherit; display: grid; place-items: center; cursor: pointer; }
.date-picker__nav:hover { background: var(--color-brand-primary-soft); }
.date-picker__weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 4px; color: var(--admin-muted); font-size: 12px; text-align: center; }
.date-picker__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.date-picker__day { width: 100%; min-height: 32px; margin: 0; padding: 0; border: 0; border-radius: var(--radius-nav); background: transparent; color: inherit; font-size: 13px; cursor: pointer; }
.date-picker__day.is-muted { color: var(--admin-muted); }
.date-picker__day.is-today { background: var(--color-brand-primary-soft); color: var(--color-brand-primary); font-weight: 700; }
.date-picker__day.is-selected { background: var(--color-brand-primary); color: var(--color-on-brand); font-weight: 700; }
.date-picker__day:hover { background: var(--color-brand-primary-soft); }
.date-picker__day.is-selected:hover { background: var(--color-brand-primary); color: var(--color-on-brand); }
.date-picker__foot { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
.date-picker__action { height: 32px; margin: 0; padding: 0 8px; border: 0; border-radius: var(--admin-radius-control); background: transparent; color: var(--color-brand-primary); font-size: 13px; cursor: pointer; }
.date-picker__action.is-today-action { font-weight: 700; }
</style>
