<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeMediaReference } from '@agritainment/shared'
import type { MediaReference } from '@agritainment/shared'
import { createResolvedMediaController } from './media-helpers'
import { getMediaRuntime, isMediaRuntimeConfigured } from './runtime'

const props = withDefaults(defineProps<{
  src?: MediaReference | string | null
  fallback?: MediaReference | string | null
  mode?: string
}>(), { src: null, fallback: null, mode: 'aspectFill' })

const emitImageClick = defineEmits<{ click: [resolvedUrl: string] }>()
const resolvedUrl = ref('')
const failed = ref(false)
let controller: ReturnType<typeof createResolvedMediaController> | null = null
let runtimeRetryTimer: ReturnType<typeof setTimeout> | undefined

function initializeController() {
  if (controller) return
  const runtime = getMediaRuntime()
  const fallbackReference = normalizeMediaReference(props.fallback)
  const fallbackUrl = fallbackReference?.source === 'builtin'
    ? fallbackReference.path
    : runtime.fallback.source === 'builtin' ? runtime.fallback.path : ''
  controller = createResolvedMediaController({
    fallbackUrl,
    resolve: (reference) => runtime.storage.resolve(reference),
    release: (url) => runtime.storage.release(url),
    onChange: (url) => { resolvedUrl.value = url },
    onError: (value) => { failed.value = value }
  })
  void controller.set(props.src)
}

function ensureController() {
  if (controller) return
  if (!isMediaRuntimeConfigured()) {
    runtimeRetryTimer = setTimeout(ensureController, 0)
    return
  }
  initializeController()
}

onMounted(ensureController)
watch(() => props.src, (value) => { if (controller) void controller.set(value) }, { deep: true })
onBeforeUnmount(() => {
  if (runtimeRetryTimer) clearTimeout(runtimeRetryTimer)
  controller?.dispose()
})
</script>

<template>
  <view class="business-image">
    <image :src="resolvedUrl" :mode="mode" @error="controller?.fail(resolvedUrl)" @click="emitImageClick('click', resolvedUrl)" />
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
  font-size: 12px;
  line-height: 1.35;
  background: rgb(31 41 55 / 72%);
  border-radius: 2px;
}
</style>
