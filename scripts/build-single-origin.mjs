import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const apps = [
  { app: 'dashboard', prefix: '/dashboard/' },
  { app: 'admin', prefix: '/admin/' },
  { app: 'farmhouse', prefix: '/farmhouse/' },
  { app: 'alliance', prefix: '/alliance/' },
  { app: 'store', prefix: '/store/' },
  { app: 'promoter', prefix: '/promoter/' },
  { app: 'user', prefix: '/user/' },
  { app: 'supplier', prefix: '/supplier/' }
]

function build(app, base, extraEnv = {}) {
  execSync(`${pnpm} --filter @agritainment/${app} build:h5`, {
    cwd: root, stdio: 'inherit', shell: true,
    env: { ...process.env, VITE_PUBLIC_BASE: base, VITE_OUT_DIR: '', ...extraEnv }
  })
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function namespaceStaticReferences(directory, app) {
  for (const file of filesUnder(directory).filter((path) => /\.(html|css|js)$/.test(path))) {
    const source = readFileSync(file, 'utf8')
    const next = source.replace(/(^|[^\w/])\/static\//g, `$1/${app}/static/`)
    if (next !== source) writeFileSync(file, next)
  }
}

let singleOriginError = null
const restoreErrors = []

try {
  for (const { app, prefix } of apps) {
    console.log(`\n=== single-origin build: ${app} (${prefix}) ===`)
    build(app, prefix)
    const source = join(root, 'apps', app, 'dist', 'build', 'h5')
    const dest = join(root, 'apps', app, 'dist', 'single-origin', app)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    cpSync(source, dest, { recursive: true })
    namespaceStaticReferences(dest, app)
  }
} catch (error) {
  singleOriginError = error
} finally {
  console.log('\n=== restoring per-port builds (base /) ===')
  for (const { app } of apps) {
    const perPortStorefronts = app === 'alliance'
      ? { VITE_STOREFRONT_SHIBANXI_URL: 'http://127.0.0.1:8792/', VITE_STOREFRONT_YUNSHANG_URL: 'http://127.0.0.1:8794/' }
      : {}
    try {
      build(app, '/', perPortStorefronts)
    } catch (error) {
      restoreErrors.push(new Error(`恢复 ${app} 根路径产物失败`, { cause: error }))
    }
  }
}

if (singleOriginError || restoreErrors.length) {
  throw new AggregateError(
    [singleOriginError, ...restoreErrors].filter(Boolean),
    singleOriginError ? '同源构建失败；已尝试恢复全部单端产物' : '同源构建完成，但部分单端产物恢复失败'
  )
}

console.log('single-origin builds ready in apps/*/dist/single-origin/* with app-prefixed static assets')
