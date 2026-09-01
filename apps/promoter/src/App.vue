<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
// #ifdef H5
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
configureMediaRuntime(createH5MediaRuntime())
// #endif
// #ifdef MP-WEIXIN
import { configureMediaRuntime as configureMiniProgramMediaRuntime } from '@agritainment/ui'
import { createMiniProgramMediaRuntime } from '@agritainment/ui/mp'
configureMiniProgramMediaRuntime(createMiniProgramMediaRuntime())
// #endif

onLaunch(() => undefined)
</script>

<style src="./styles/global.scss" lang="scss"></style>
