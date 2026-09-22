import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const mobileApps = ['farmhouse', 'promoter', 'store', 'supplier', 'user'] as const

function iconNames(app: string): string[] {
  return readdirSync(resolve(root, `apps/${app}/src/static/icons`))
}

function usedIconNames(app: string): string[] {
  const dir = resolve(root, `apps/${app}/src`)
  const iconsDir = resolve(root, `apps/${app}/src/static/icons`)
  const validIcons = new Set(readdirSync(iconsDir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')))
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
    const path = join(d, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
  const source = walk(dir).filter((p) => /\.(vue|ts)$/.test(p)).map((p) => readFileSync(p, 'utf8')).join('\n')
  const names = new Set<string>()
  for (const match of source.matchAll(/UiIcon\s+name="([a-z-]+)"/g)) names.add(match[1])
  for (const match of source.matchAll(/UiIcon\s+:name="([^"]+)"/g)) {
    for (const literal of match[1].matchAll(/'([a-z-]+)'/g)) if (validIcons.has(literal[1])) names.add(literal[1])
  }
  for (const match of source.matchAll(/icon:\s*'([a-z-]+)'/g)) if (match[1] !== 'none' && validIcons.has(match[1])) names.add(match[1])
  return [...names].sort()
}

describe('mobile icon contract (Lucide SVG source + MP PNG fallback)', () => {
  it('every mobile UiIcon has both SVG and MP PNG branches', () => {
    for (const app of mobileApps) {
      const source = readFileSync(resolve(root, `apps/${app}/src/components/UiIcon.vue`), 'utf8')
      expect(source, `${app} PNG branch`).toMatch(/\.png/)
      expect(source, `${app} SVG branch`).toMatch(/\.svg/)
      expect(source, `${app} MP conditional`).toContain('#ifdef MP-WEIXIN')
    }
  })

  it('every icon used by a mobile app has both SVG and PNG assets', () => {
    for (const app of mobileApps) {
      const files = iconNames(app)
      const svg = new Set(files.filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')))
      const png = new Set(files.filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')))
      for (const name of usedIconNames(app)) {
        expect(svg.has(name), `${app} missing ${name}.svg`).toBe(true)
        expect(png.has(name), `${app} missing ${name}.png`).toBe(true)
      }
    }
  })

  it('every mobile icon SVG comes from lucide-static', () => {
    for (const app of mobileApps) {
      const dir = resolve(root, `apps/${app}/src/static/icons`)
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
        const source = readFileSync(join(dir, file), 'utf8')
        expect(source, `${app}/${file} license`).toContain('lucide-static')
        expect(source, `${app}/${file} class`).toContain('lucide lucide-')
      }
    }
  })

  it('keeps only icons actually referenced by each mobile app', () => {
    for (const app of mobileApps) {
      const dir = resolve(root, `apps/${app}/src/static/icons`)
      const used = new Set(usedIconNames(app))
      const svgOnDisk = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, ''))
      for (const name of svgOnDisk) {
        expect(used.has(name), `${app} unused svg ${name}`).toBe(true)
      }
    }
  })

  it('store manifest declares a mp-weixin block', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'apps/store/src/manifest.json'), 'utf8')) as Record<string, unknown>
    expect(manifest['mp-weixin']).toBeTruthy()
  })
})