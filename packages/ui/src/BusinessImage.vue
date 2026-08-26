<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { normalizeMediaReference } from '@agritainment/shared'
import type { MediaReference } from '@agritainment/shared'
import { createResolvedMediaController } from './media-helpers'
import { getMediaRuntime } from './runtime'

const props = withDefaults(defineProps<{
  src?: MediaReference | string | null
  fallback?: MediaReference | string | null
  mode?: string
}>(), { src: null, fallback: null, mode: 'aspectFill' })

const emit = defineEmits<{ click: [resolvedUrl: string] }>()
const resolvedUrl = ref('')
const failed = ref(false)
const runtime = getMediaRuntime()
const fallbackReference = normalizeMediaReference(props.fallback)
const fallbackUrl = fallbackReference?.source === 'builtin'
  ? fallbackReference.path
  : runtime.fallback.source === 'builtin' ? runtime.fallback.path : ''
const controller = createResolvedMediaController({
  fallbackUrl,
  resolve: (reference) => runtime.storage.resolve(reference),
  release: (url) => runtime.storage.release(url),
  onChange: (url) => { resolvedUrl.value = url },
  onError: (value) => { failed.value = value }
})

watch(() => props.src, (value) => { void controller.set(value) }, { immediate: true, deep: true })
onBeforeUnmount(() => controller.dispose())
</script>

<template>
  <view class="business-image">
    <image :src="resolvedUrl" :mode="mode" @error="controller.fail(resolvedUrl)" @click="emit('click', resolvedUrl)" />
    <text v-if="failed" class="business-image__error">数据异常</text>
  </view>
</template>

<style scoped>
.business-image {
  position: relative;
  display: block;
  overflow: hidden;
}

.business-image > image {
  display: block;
  width: 100%;
  height: 100%;
}

.business-image__error {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 2px 4px;
  color: #fff;
  font-size: 10px;
  line-height: 1.2;
  background: rgb(31 41 55 / 72%);
  border-radius: 2px;
}
</style>
