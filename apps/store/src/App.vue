<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
configureMediaRuntime(createH5MediaRuntime())

onLaunch(() => undefined)
</script>

<style src="./styles/global.scss" lang="scss"></style>
