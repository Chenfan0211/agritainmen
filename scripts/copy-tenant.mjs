import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [tenant, platform] = process.argv.slice(2)
if (!tenant || !platform) {
  console.error('usage: node scripts/copy-tenant.mjs <tenant> <platform>')
  process.exit(1)
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'apps', 'farmhouse', 'dist', 'build', platform)
const destination = join(root, 'apps', 'farmhouse', 'dist', 'tenants', tenant, platform)
if (!existsSync(source)) throw new Error(`Missing build output: ${source}`)
rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true })
console.log(`Preserved ${tenant}/${platform}`)