<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BusinessImage } from '@agritainment/ui'
import { createSearchableSelectId, filterSelectOptions, findNextEnabledOption } from './searchable-select'
import type { SearchableSelectOption, SearchableSelectValue } from './searchable-select'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: SearchableSelectValue
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  ariaLabel?: string
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
}>(), {
  placeholder: '请选择',
  searchPlaceholder: '搜索选项',
  disabled: false,
  size: 'large'
})

const emit = defineEmits<{
  'update:modelValue': [value: SearchableSelectValue]
  change: [value: SearchableSelectValue]
}>()

const listboxId = createSearchableSelectId()
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(-1)
const panelStyle = ref<Record<string, string>>({})
const shiftKeyActive = ref(false)

const selectedOption = computed(() => props.options.find((option) => Object.is(option.value, props.modelValue)))
const filteredOptions = computed(() => filterSelectOptions(props.options, query.value))
const resolvedAriaLabel = computed(() => props.ariaLabel?.trim() || props.searchPlaceholder.replace(/^搜索/, '') || props.placeholder)
const activeOptionId = computed(() => activeIndex.value >= 0 ? `${listboxId}-option-${activeIndex.value}` : undefined)

function positionPanel() {
  const trigger = rootEl.value?.getBoundingClientRect()
  if (!trigger) return
  const viewportGap = 8
  const panelGap = 4
  const width = Math.max(trigger.width, 180)
  const panelHeight = panelEl.value?.offsetHeight || 280
  const spaceBelow = Math.max(0, window.innerHeight - trigger.bottom - panelGap - viewportGap)
  const spaceAbove = Math.max(0, trigger.top - panelGap - viewportGap)
  const placeBelow = spaceBelow >= Math.min(panelHeight, 160) || spaceBelow >= spaceAbove
  const availableHeight = placeBelow ? spaceBelow : spaceAbove
  const constrainedHeight = Math.min(panelHeight, availableHeight)
  const top = placeBelow
    ? trigger.bottom + panelGap
    : Math.max(viewportGap, trigger.top - constrainedHeight - panelGap)
  const left = Math.min(Math.max(viewportGap, trigger.left), Math.max(viewportGap, window.innerWidth - width - viewportGap))
  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${availableHeight}px`,
    '--searchable-select-panel-max-height': `${availableHeight}px`
  }
}

function setInitialActiveOption() {
  const selectedIndex = filteredOptions.value.findIndex((option) => Object.is(option.value, props.modelValue) && !option.disabled)
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : filteredOptions.value.findIndex((option) => !option.disabled)
}

async function openDropdown() {
  if (props.disabled || open.value) return
  query.value = ''
  open.value = true
  setInitialActiveOption()
  await nextTick()
  positionPanel()
  await nextTick()
  positionPanel()
  window.setTimeout(() => {
    if (open.value) panelEl.value?.querySelector<HTMLInputElement>('.searchable-select__search input')?.focus()
  }, 0)
}

function toggleDropdown() {
  if (open.value) closeDropdown()
  else openDropdown()
}

function closeDropdown(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  query.value = ''
  activeIndex.value = -1
  shiftKeyActive.value = false
  if (restoreFocus) nextTick(() => rootEl.value?.querySelector<HTMLElement>('.searchable-select__trigger')?.focus())
}

function chooseOption(option: SearchableSelectOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeDropdown(true)
}

function moveActive(direction: 1 | -1) {
  activeIndex.value = findNextEnabledOption(filteredOptions.value, activeIndex.value, direction)
  nextTick(() => panelEl.value?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function focusAdjacentControl(backward: boolean) {
  const trigger = rootEl.value?.querySelector<HTMLElement>('.searchable-select__trigger')
  if (!trigger) return
  const controls = Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getAttribute('aria-disabled') !== 'true' && element.getClientRects().length > 0)
  const triggerIndex = controls.indexOf(trigger)
  controls[triggerIndex + (backward ? -1 : 1)]?.focus()
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Shift') {
    shiftKeyActive.value = true
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const option = filteredOptions.value[activeIndex.value]
    if (option) chooseOption(option)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown(true)
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    const backward = event.shiftKey || shiftKeyActive.value
    closeDropdown()
    nextTick(() => focusAdjacentControl(backward))
  }
}

function handleSearchKeyup(event: KeyboardEvent) {
  if (event.key === 'Shift') shiftKeyActive.value = false
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    openDropdown()
  }
}

function handleDocumentPointer(event: Event) {
  const target = event.target as Node | null
  if (target && !rootEl.value?.contains(target) && !panelEl.value?.contains(target)) closeDropdown()
}

function handleViewportChange() {
  if (open.value) positionPanel()
}

watch(filteredOptions, setInitialActiveOption)
watch(() => props.disabled, (disabled) => { if (disabled) closeDropdown() })

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
  <div ref="rootEl" class="searchable-select" :class="[`searchable-select--${size}`, { 'is-disabled': disabled }]">
    <div
      class="searchable-select__trigger"
      role="combobox"
      :tabindex="disabled ? -1 : 0"
      :aria-controls="listboxId"
      :aria-expanded="open"
      :aria-disabled="disabled"
      :aria-label="resolvedAriaLabel"
      aria-haspopup="listbox"
      @click="toggleDropdown"
      @keydown="handleTriggerKeydown"
    >
      <span class="searchable-select__value" :class="{ 'is-placeholder': !selectedOption }"><BusinessImage v-if="selectedOption?.image" class="searchable-select__image" :src="selectedOption.image" :fallback="selectedOption.imageFallback" :error-fallback="selectedOption.imageErrorFallback" :show-error="false" mode="aspectFill" /><UiIcon v-else-if="selectedOption?.icon" :name="selectedOption.icon" :size="15" /><span>{{ selectedOption?.label || placeholder }}</span></span>
      <UiIcon class="searchable-select__chevron" name="chevron-down" :size="15" />
    </div>
    <Teleport to="body">
      <div v-if="open" ref="panelEl" class="searchable-select__panel" :style="panelStyle">
        <label class="searchable-select__search-wrap">
          <UiIcon name="search" :size="15" />
          <input
            v-model="query"
            class="searchable-select__search"
            :placeholder="searchPlaceholder"
            :focus="open"
            autocomplete="off"
            role="searchbox"
            :aria-label="`${resolvedAriaLabel}搜索`"
            :aria-controls="listboxId"
            aria-autocomplete="list"
            :aria-activedescendant="activeOptionId"
            @keydown="handleSearchKeydown"
            @keyup="handleSearchKeyup"
          />
        </label>
        <div :id="listboxId" class="searchable-select__options" role="listbox">
          <div
            v-for="(option, index) in filteredOptions"
            :key="`${typeof option.value}:${String(option.value)}`"
            :id="`${listboxId}-option-${index}`"
            class="searchable-select__option"
            :class="{ 'is-active': index === activeIndex, 'is-selected': Object.is(option.value, modelValue), 'is-disabled': option.disabled }"
            role="option"
            :aria-selected="Object.is(option.value, modelValue)"
            :aria-disabled="option.disabled || false"
            :data-option-index="index"
            @mouseenter="activeIndex = option.disabled ? activeIndex : index"
            @mousedown.prevent
            @click="chooseOption(option)"
          >
            <span class="searchable-select__option-label"><BusinessImage v-if="option.image" class="searchable-select__image" :src="option.image" :fallback="option.imageFallback" :error-fallback="option.imageErrorFallback" :show-error="false" mode="aspectFill" /><UiIcon v-else-if="option.icon" :name="option.icon" :size="15" /><span>{{ option.label }}</span></span>
            <UiIcon v-if="Object.is(option.value, modelValue)" name="check" :size="14" />
          </div>
          <div v-if="!filteredOptions.length" class="searchable-select__empty">没有匹配选项</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.searchable-select { position: relative; min-width: 120px; color: var(--admin-ink, #203127); }
.searchable-select--small { min-width: 112px; }
.searchable-select__trigger { width: 100%; height: 40px; padding: 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--admin-line, #dfe5df); border-radius: 5px; background: #fff; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.searchable-select--small .searchable-select__trigger { height: 30px; padding: 0 8px; }
.searchable-select--medium .searchable-select__trigger { height: 36px; padding: 0 8px; }
.searchable-select__trigger:focus-visible { border-color: var(--admin-green-2, #287a4d); box-shadow: 0 0 0 2px rgba(40, 122, 77, .14); outline: 0; }
.searchable-select__value { min-width: 0; display:flex; align-items:center; gap:6px; overflow: hidden; white-space: nowrap; }
.searchable-select__value span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.searchable-select__value.is-placeholder { color: var(--admin-muted, #748177); }
.searchable-select__image { width: 24px; height: 24px; flex: none; border: 1px solid var(--admin-line, #dfe5df); border-radius: 4px; background: #f4f6f3; }
.searchable-select--small .searchable-select__image { width: 20px; height: 20px; }
.searchable-select__trigger .ui-icon { flex: none; }
.searchable-select__chevron { transition: transform .16s ease; }
.searchable-select__trigger[aria-expanded="true"] .searchable-select__chevron { transform: rotate(180deg); }
.searchable-select.is-disabled .searchable-select__trigger { background: #f4f6f3; color: #9aa39c; cursor: not-allowed; }
.searchable-select__panel { position: fixed; z-index: 120; max-height: min(320px, calc(100vh - 16px)); overflow: hidden; border: 1px solid var(--admin-line, #dfe5df); border-radius: 6px; background: #fff; box-shadow: 0 14px 36px rgba(20, 36, 26, .16); }
.searchable-select__search-wrap { height: 40px; margin: 8px; padding: 0 9px; display: flex; align-items: center; gap: 7px; border: 1px solid var(--admin-line, #dfe5df); border-radius: 5px; background: #fff; }
.searchable-select__search-wrap:focus-within { border-color: var(--admin-green-2, #287a4d); box-shadow: 0 0 0 2px rgba(40, 122, 77, .12); }
.searchable-select__search { min-width: 0; width: 100%; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font-size: 13px; }
.searchable-select__options { max-height: max(0px, calc(var(--searchable-select-panel-max-height, 320px) - 56px)); overflow-y: auto; padding: 0 6px 6px; }
.searchable-select__option { width: 100%; min-height: 36px; padding: 7px 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.searchable-select__option-label { min-width:0; display:flex; align-items:center; gap:7px; }
.searchable-select__option-label span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.searchable-select__option:hover, .searchable-select__option.is-active { background: var(--admin-green-soft, #edf6ef); }
.searchable-select__option.is-selected { color: var(--admin-green-2, #287a4d); font-weight: 700; }
.searchable-select__option.is-disabled { background: transparent; color: #a8afa9; cursor: not-allowed; }
.searchable-select__empty { min-height: 68px; display: grid; place-items: center; color: var(--admin-muted, #748177); font-size: 13px; }
</style>
