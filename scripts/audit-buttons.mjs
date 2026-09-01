import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const files = [
  'apps/admin/src/pages/index/index.vue',
  'apps/farmhouse/src/pages/index/index.vue',
  'apps/alliance/src/pages/index/index.vue',
  'apps/store/src/pages/index/index.vue'
]

const failures = []
const matrix = { store: 0, surface: 0, localState: 0 }
for (const file of files) {
  const source = readFileSync(resolve(file), 'utf8')
  for (const match of source.matchAll(/<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    const binding = match[0].match(/@click\s*=\s*(["'])(.*?)\1/s)?.[2]?.trim()
    if (binding) {
      if (/^(toast|showToast)\s*\(/.test(binding)) {
        const line = source.slice(0, match.index).split('\n').length
        failures.push(`${file}:${line} 仅显示提示，未产生数据或界面变化`)
        continue
      }
      if (/\bstore\./.test(binding)) matrix.store += 1
      else if (/^(open|close|clear|choose|select|enter|recharge|checkout|submit|share|withdraw|export|batch|copy|repeat|progress|audit|toggle|join|watch|list|retry|save|set|detail|confirm|add|book|makePhoneCall|markAllRead|go|advance|switch|back|login|logout|send|wechat|require|request|remove|resume|edit|verify|design|cancel|commit|restore|refund|complete)[A-Z\w]*(\s*\(|$)/.test(binding)) matrix.surface += 1
      else if (/\b[a-zA-Z_$][\w$]*\s*=|\+\+|--/.test(binding)) matrix.localState += 1
      else {
        const line = source.slice(0, match.index).split('\n').length
        failures.push(`${file}:${line} 点击行为无法归类: ${binding}`)
      }
      continue
    }
    const line = source.slice(0, match.index).split('\n').length
    failures.push(`${file}:${line} ${match[0].replace(/\s+/g, ' ')}`)
  }
}

if (failures.length) {
  console.error(`发现 ${failures.length} 个未绑定点击事件的按钮:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`按钮行为审计通过: ${files.length} 个页面，Store ${matrix.store}，界面/业务函数 ${matrix.surface}，本地状态 ${matrix.localState}`)
