<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeMediaReference } from '@agritainment/shared'
import type { MediaReference } from '@agritainment/shared'
import { createResolvedMediaController } from './media-helpers'
import { getMediaRuntime, isMediaRuntimeConfigured } from './runtime'

const props = withDefaults(defineProps<{
  src?: MediaReference | string | null
  fallback?: MediaReference | string | null
  errorFallback?: MediaReference | string | null
  mode?: string
  showError?: boolean
}>(), { src: null, fallback: null, errorFallback: null, mode: 'aspectFill', showError: true })

const emitImageClick = defineEmits<{ click: [resolvedUrl: string] }>()
const directUrl = (value: MediaReference | string | null | undefined) => {
  const reference = normalizeMediaReference(value)
  return reference?.source === 'builtin' ? reference.path : reference?.source === 'legacy' ? reference.url : ''
}
const resolvedUrl = ref(directUrl(props.src))
const failed = ref(false)
let controller: ReturnType<typeof createResolvedMediaController> | null = null
let runtimeRetryTimer: ReturnType<typeof setTimeout> | undefined

function initializeController() {
  if (controller) return
  const runtime = getMediaRuntime()
  const fallbackReference = normalizeMediaReference(props.fallback)
  const runtimeFallbackUrl = directUrl(runtime.fallback)
  const fallbackUrl = directUrl(fallbackReference) || runtimeFallbackUrl
  const errorFallbackUrl = directUrl(props.errorFallback) || runtimeFallbackUrl
  controller = createResolvedMediaController({
    fallbackUrl,
    errorFallbackUrl,
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
watch(() => props.src, (value) => {
  if (controller) void controller.set(value)
  else resolvedUrl.value = directUrl(value)
}, { deep: true })
function restartController(value: MediaReference | string | null | undefined) {
  if (runtimeRetryTimer) clearTimeout(runtimeRetryTimer)
  runtimeRetryTimer = undefined
  controller?.dispose()
  controller = null
  failed.value = false
  resolvedUrl.value = directUrl(props.src) || directUrl(props.fallback) || directUrl(props.errorFallback) || directUrl(value)
  ensureController()
}
watch(() => props.fallback, restartController, { deep: true })
watch(() => props.errorFallback, restartController, { deep: true })
onBeforeUnmount(() => {
  if (runtimeRetryTimer) clearTimeout(runtimeRetryTimer)
  controller?.dispose()
})
</script>

<template>
  <view class="business-image">
    <image :src="resolvedUrl" :mode="mode" @error="controller?.fail(resolvedUrl)" @click="emitImageClick('click', resolvedUrl)" />
    <text v-if="failed && showError" class="business-image__error">数据异常</text>
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
