<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', 'zh-CN')
})
</script>

<style src="./styles/global.scss" lang="scss"></style>
