<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MediaReference } from '@agritainment/shared'
import BusinessImage from './BusinessImage.vue'
import { mergeUploadedMedia, moveUploadedMedia, normalizeUploaderValue, uploaderCanChoose } from './media-helpers'
import type { MediaCompressionKind } from './media-helpers'
import { getMediaRuntime, savePreparedMediaFile } from './runtime'

type ModelValue = MediaReference | string | null | Array<MediaReference | string>

const props = withDefaults(defineProps<{
  modelValue?: ModelValue
  multiple?: boolean
  maxCount?: number
  purpose: string
  profile?: MediaCompressionKind
  disabled?: boolean
}>(), { modelValue: null, multiple: false, maxCount: 1, profile: 'normal', disabled: false })

const emit = defineEmits<{
  'update:modelValue': [value: MediaReference | MediaReference[] | null]
  error: [message: string]
}>()

const uploading = ref(false)
const dragIndex = ref<number | null>(null)
const values = computed(() => normalizeUploaderValue(props.modelValue))
const limit = computed(() => props.multiple ? Math.max(1, props.maxCount) : 1)
const canChoose = computed(() => uploaderCanChoose(values.value.length, props.multiple, limit.value))
const canReorder = computed(() => props.multiple && !props.disabled)

function emitValues(next: MediaReference[]) {
  emit('update:modelValue', props.multiple ? next : next[0] ?? null)
}

async function choose() {
  if (props.disabled || uploading.value || !canChoose.value) return
  uploading.value = true
  try {
    const runtime = getMediaRuntime()
    const files = await runtime.chooseImages({ count: props.multiple ? limit.value - values.value.length : 1, profile: props.profile })
    const references = await Promise.all(files.map((file) => savePreparedMediaFile(runtime, file, props.purpose)))
    emitValues(mergeUploadedMedia(values.value, references, props.multiple, limit.value))
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '图片上传失败')
  } finally {
    uploading.value = false
  }
}

function remove(index: number) {
  emitValues(values.value.filter((_item, itemIndex) => itemIndex !== index))
}

function dragEvent(event: Event): DragEvent | undefined {
  const candidate = event as DragEvent & { originalEvent?: DragEvent }
  return candidate.dataTransfer ? candidate : candidate.originalEvent
}

function onDragStart(index: number, event: Event) {
  if (!canReorder.value) return
  dragIndex.value = index
  const native = dragEvent(event)
  native?.dataTransfer?.setData('text/plain', String(index))
  if (native?.dataTransfer) native.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: Event) {
  if (!canReorder.value || dragIndex.value == null) return
  const native = dragEvent(event)
  if (native?.dataTransfer) native.dataTransfer.dropEffect = 'move'
}

function onDrop(index: number) {
  if (!canReorder.value || dragIndex.value == null) return
  emitValues(moveUploadedMedia(values.value, dragIndex.value, index))
  dragIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
}

function preview(url: string) {
  if (url) uni.previewImage({ current: url, urls: [url] })
}
</script>

<template>
  <view class="business-uploader">
    <view
      v-for="(item, index) in values"
      :key="JSON.stringify(item)"
      class="business-uploader__item"
      :class="{ 'is-dragging': dragIndex === index }"
      :draggable="canReorder"
      :aria-label="canReorder ? '拖拽排序' : undefined"
      @dragstart="onDragStart(index, $event)"
      @dragover.prevent="onDragOver($event)"
      @drop.prevent="onDrop(index)"
      @dragend="onDragEnd"
    >
      <BusinessImage class="business-uploader__preview" :src="item" mode="aspectFit" @click="preview" />
      <button type="button" class="business-uploader__remove" :disabled="disabled" aria-label="删除图片" @click="remove(index)">×</button>
    </view>
    <button v-if="canChoose" class="business-uploader__choose" type="button" :disabled="disabled || uploading" @click="choose">
      {{ uploading ? '处理中...' : '上传图片' }}
    </button>
  </view>
</template>

<style scoped>
.business-uploader { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
.business-uploader__item { position: relative; width: 88px; height: 88px; }
.business-uploader__item[draggable="true"] { cursor: grab; }
.business-uploader__item.is-dragging { opacity: 0.55; }
.business-uploader__preview { display: block; width: 88px; height: 88px; border: 1px solid var(--color-line); border-radius: var(--radius-icon); background: var(--color-hover-bg); overflow: hidden; }
.business-uploader__remove { position: absolute; top: 4px; right: 4px; z-index: 1; width: 20px; height: 20px; margin: 0; padding: 0; border: none; border-radius: 50%; background: var(--color-danger); color: var(--color-on-brand); font-size: 14px; line-height: 20px; display: inline-flex; align-items: center; justify-content: center; }
.business-uploader__remove::after { border: none; }
.business-uploader__remove:disabled { opacity: 0.5; }
.business-uploader__choose { box-sizing: border-box; width: 88px; height: 88px; margin: 0; padding: 0 6px; border: 1px dashed var(--color-line); border-radius: var(--radius-icon); background: var(--color-card); color: var(--color-brand-primary); font-size: 12px; line-height: 1.3; white-space: normal; display: inline-flex; align-items: center; justify-content: center; text-align: center; }
.business-uploader__choose::after { border: none; }
.business-uploader__choose:disabled { opacity: 0.6; }
</style>
