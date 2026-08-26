import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, 'apps', 'dashboard', 'dist', 'build', 'h5')
const maxJavaScriptBytes = 650 * 1024

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

if (!existsSync(output)) throw new Error('[dashboard-build] 缺少 dashboard H5 构建产物')

for (const file of filesUnder(output).filter((path) => path.endsWith('.js'))) {
  const size = statSync(file).size
  if (size > maxJavaScriptBytes) {
    throw new Error(`[dashboard-build] ${relative(output, file)} 为 ${Math.ceil(size / 1024)}KB，超过 650KB 上限`)
  }
}

if (existsSync(join(output, 'static', 'images'))) {
  throw new Error('[dashboard-build] 禁止输出 dashboard 未引用的 static/images')
}

console.log('[dashboard-build] passed: JavaScript <= 650KB, no unused static/images')
