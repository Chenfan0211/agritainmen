// Runtime must be configured before App.vue and its page components are evaluated.
// #ifdef H5
import { configureMediaRuntime, createH5MediaRuntime } from '@agritainment/ui/h5'
const h5MediaRuntime = createH5MediaRuntime()
configureMediaRuntime(h5MediaRuntime)
// #endif
// #ifdef MP-WEIXIN
import { configureMediaRuntime as configureMiniProgramMediaRuntime } from '@agritainment/ui'
import { createMiniProgramMediaRuntime } from '@agritainment/ui/mp'
const miniProgramMediaRuntime = createMiniProgramMediaRuntime()
configureMiniProgramMediaRuntime(miniProgramMediaRuntime)
// #endif
