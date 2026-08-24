import { buildPortalUrl } from '@agritainment/shared'

/** 用户端入口地址：推客端生成的直播间链接/二维码指向用户端 */
export const userPortalBase = import.meta.env.VITE_USER_PORTAL_URL || buildPortalUrl('user', 'pages/index/index', {}, import.meta.env.VITE_PORTAL_ORIGIN || '').replace(/#\/pages\/index\/index$/, '')
