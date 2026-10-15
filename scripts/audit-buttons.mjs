import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 参与审计的页面：四端交互最密集的入口页。 */
export const AUDIT_FILES = [
  'apps/admin/src/pages/index/index.vue',
  'apps/store/src/pages/index/index.vue'
]

/**
 * 声明式点击绑定：除 `@click="fn()"`，还必须识别 `@click.stop`、`@click.prevent` 等修饰符写法，
 * 否则带修饰符的真实处理器会被误判成「未绑定点击事件」。
 */
const CLICK_BINDING = /@click(?:\.[\w-]+)*\s*=\s*(["'])(.*?)\1/s

/** 归类为「界面/业务函数」的处理函数名前缀。 */
const SURFACE_PREFIXES = [
  'open', 'close', 'clear', 'choose', 'select', 'enter', 'recharge', 'checkout', 'submit', 'share',
  'withdraw', 'export', 'batch', 'copy', 'repeat', 'progress', 'audit', 'toggle', 'join', 'watch',
  'list', 'retry', 'save', 'set', 'detail', 'confirm', 'add', 'book', 'makePhoneCall', 'markAllRead',
  'go', 'advance', 'switch', 'back', 'login', 'logout', 'send', 'wechat', 'require', 'request',
  'remove', 'resume', 'edit', 'verify', 'design', 'cancel', 'commit', 'restore', 'refund', 'complete',
  'change'
]

const SURFACE_CALL = new RegExp(`^(${SURFACE_PREFIXES.join('|')})[A-Z\\w]*(\\s*\\(|$)`)
const LOCAL_STATE = /\b[a-zA-Z_$][\w$]*\s*=|\+\+|--/
const STORE_CALL = /\bstore\./
const TOAST_ONLY = /^(toast|showToast)\s*\(/

/** 审计单个页面源码：返回失败明细与行为矩阵。 */
export function auditButtonsSource(source, file) {
  const failures = []
  const matrix = { store: 0, surface: 0, localState: 0 }

  for (const match of source.matchAll(/<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    const line = source.slice(0, match.index).split('\n').length
    const binding = match[0].match(CLICK_BINDING)?.[2]?.trim()
    if (!binding) {
      failures.push(`${file}:${line} ${match[0].replace(/\s+/g, ' ')}`)
      continue
    }
    if (TOAST_ONLY.test(binding)) {
      failures.push(`${file}:${line} 仅显示提示，未产生数据或界面变化`)
      continue
    }
    if (STORE_CALL.test(binding)) matrix.store += 1
    else if (SURFACE_CALL.test(binding)) matrix.surface += 1
    else if (LOCAL_STATE.test(binding)) matrix.localState += 1
    else failures.push(`${file}:${line} 点击行为无法归类: ${binding}`)
  }

  return { failures, matrix }
}

/** 审计全部登记页面。 */
export function auditButtons(root = ROOT) {
  const failures = []
  const matrix = { store: 0, surface: 0, localState: 0 }

  for (const file of AUDIT_FILES) {
    const result = auditButtonsSource(readFileSync(resolve(root, file), 'utf8'), file)
    failures.push(...result.failures)
    matrix.store += result.matrix.store
    matrix.surface += result.matrix.surface
    matrix.localState += result.matrix.localState
  }

  return { failures, matrix, fileCount: AUDIT_FILES.length }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const { failures, matrix, fileCount } = auditButtons()
  if (failures.length) {
    console.error(`发现 ${failures.length} 个未绑定点击事件的按钮:\n${failures.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`按钮行为审计通过: ${fileCount} 个页面，Store ${matrix.store}，界面/业务函数 ${matrix.surface}，本地状态 ${matrix.localState}`)
  }
}