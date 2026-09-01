<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
configureMediaRuntime(createH5MediaRuntime())

onLaunch(() => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', 'zh-CN')
})
</script>

<style src="./styles/global.scss" lang="scss"></style>
