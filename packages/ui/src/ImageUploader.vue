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
const values = computed(() => normalizeUploaderValue(props.modelValue))
const limit = computed(() => props.multiple ? Math.max(1, props.maxCount) : 1)
const canChoose = computed(() => uploaderCanChoose(values.value.length, props.multiple, limit.value))

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

function move(index: number, offset: number) {
  emitValues(moveUploadedMedia(values.value, index, index + offset))
}

function preview(url: string) {
  if (url) uni.previewImage({ current: url, urls: [url] })
}
</script>

<template>
  <view class="business-uploader">
    <view v-for="(item, index) in values" :key="JSON.stringify(item)" class="business-uploader__item">
      <BusinessImage class="business-uploader__preview" :src="item" mode="aspectFit" @click="preview" />
      <view class="business-uploader__actions">
        <button v-if="multiple" type="button" :disabled="index === 0 || disabled" aria-label="前移" @click="move(index, -1)">↑</button>
        <button v-if="multiple" type="button" :disabled="index === values.length - 1 || disabled" aria-label="后移" @click="move(index, 1)">↓</button>
        <button type="button" :disabled="disabled" aria-label="删除图片" @click="remove(index)">×</button>
      </view>
    </view>
    <button v-if="canChoose" class="business-uploader__choose" type="button" :disabled="disabled || uploading" @click="choose">
      {{ uploading ? '处理中...' : values.length && !multiple ? '替换图片' : '上传图片' }}
    </button>
  </view>
</template>

<style scoped>
.business-uploader { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.business-uploader__item { position: relative; width: 88px; }
.business-uploader__preview { display: block; width: 88px; height: 88px; border: 1px solid #d9ddd6; border-radius: 6px; background: #fafbf8; overflow: hidden; }
.business-uploader__actions { display: flex; gap: 4px; margin-top: 5px; }
.business-uploader__actions button { width: 26px; height: 26px; margin: 0; padding: 0; border: 1px solid #d9ddd6; border-radius: 4px; background: #fff; color: #33433a; line-height: 24px; }
.business-uploader__choose { min-height: 34px; margin: 0; padding: 0 12px; border: 1px solid #cbd8cf; border-radius: 5px; background: #fff; color: #1d6b44; font-size: 12px; }
</style>
