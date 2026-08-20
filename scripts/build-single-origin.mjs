import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const apps = [
  { app: 'admin', prefix: '/admin/' },
  { app: 'farmhouse', prefix: '/farmhouse/' },
  { app: 'alliance', prefix: '/alliance/' },
  { app: 'store', prefix: '/store/' },
  { app: 'promoter', prefix: '/promoter/' },
  { app: 'user', prefix: '/user/' }
]

function build(app, base) {
  execSync(`${pnpm} --filter @agritainment/${app} build:h5`, {
    cwd: root, stdio: 'inherit', shell: true,
    env: { ...process.env, VITE_PUBLIC_BASE: base, VITE_OUT_DIR: '' }
  })
}

for (const { app, prefix } of apps) {
  console.log(`\n=== single-origin build: ${app} (${prefix}) ===`)
  build(app, prefix)
  const source = join(root, 'apps', app, 'dist', 'build', 'h5')
  const dest = join(root, 'apps', app, 'dist', 'single-origin', app)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(source, dest, { recursive: true })
}

console.log('\n=== restoring per-port builds (base /) ===')
for (const { app } of apps) build(app, '/')
console.log('single-origin builds ready in apps/*/dist/single-origin/*')
