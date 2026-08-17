import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const outputRoot = join(root, 'apps', 'farmhouse', 'dist', 'build')
const tenantRoot = join(root, 'apps', 'farmhouse', 'dist', 'tenants')

const targets = [
  { tenant: 'yunshang', script: 'build:h5:yunshang', platform: 'h5' },
  { tenant: 'yunshang', script: 'build:mp:yunshang', platform: 'mp-weixin' },
  { tenant: 'shibanxi', script: 'build:h5', platform: 'h5' },
  { tenant: 'shibanxi', script: 'build:mp-weixin', platform: 'mp-weixin' }
]

for (const target of targets) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm --filter @agritainment/farmhouse ${target.script}`], { cwd: root, stdio: 'inherit' })
  } else {
    execFileSync('pnpm', ['--filter', '@agritainment/farmhouse', target.script], { cwd: root, stdio: 'inherit' })
  }
  const source = join(outputRoot, target.platform)
  if (!existsSync(source)) throw new Error(`Missing build output: ${source}`)
  const destination = join(tenantRoot, target.tenant, target.platform)
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
  console.log(`Preserved ${target.tenant}/${target.platform}`)
}
