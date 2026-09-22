// 把各移动端实际使用的 lucide SVG 图标渲染为小程序可用的 PNG。
// 用法: node scripts/svg-icons-to-png.mjs
// 说明: 微信小程序 <image> 不支持本地 SVG，H5 支持；本脚本用 Chromium 把 SVG
//       渲染成 64x64 透明底 PNG（墨色 #1f2a22 描边），覆盖小程序端图标空白问题。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = new URL('..', import.meta.url)
const rootPath = fileURLToPath(root)
const mobileApps = ['farmhouse', 'promoter', 'store', 'supplier', 'user']
const size = 64
const color = '#1f2a22'

function usedIconNames(app) {
  const dir = join(rootPath, 'apps', app, 'src')
  const iconsDir = join(rootPath, 'apps', app, 'src', 'static', 'icons')
  const validIcons = new Set(readdirSync(iconsDir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')))
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((entry) => {
    const path = join(d, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
  const source = walk(dir).filter((p) => /\.(vue|ts)$/.test(p)).map((p) => readFileSync(p, 'utf8')).join('\n')
  const names = new Set()
  for (const match of source.matchAll(/UiIcon\s+name="([a-z-]+)"/g)) names.add(match[1])
  for (const match of source.matchAll(/UiIcon\s+:name="([^"]+)"/g)) {
    for (const literal of match[1].matchAll(/'([a-z-]+)'/g)) if (validIcons.has(literal[1])) names.add(literal[1])
  }
  for (const match of source.matchAll(/icon:\s*'([a-z-]+)'/g)) if (match[1] !== 'none' && validIcons.has(match[1])) names.add(match[1])
  return [...names].sort()
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const executablePath = resolveChromiumExecutable()
const browser = executablePath
  ? await chromium.launch({ executablePath })
  : await chromium.launch()
const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 1 })

for (const app of mobileApps) {
  const iconsDir = join(rootPath, 'apps', app, 'src', 'static', 'icons')
  const names = usedIconNames(app)
  for (const name of names) {
    const svgPath = join(iconsDir, `${name}.svg`)
    const raw = readFileSync(svgPath, 'utf8')
    const svg = raw.replace(/<!--[\s\S]*?-->/g, '')
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div style="color:${color}">${svg}</div></body></html>`)
    await page.$eval('svg', (el, s) => {
      el.setAttribute('width', String(s))
      el.setAttribute('height', String(s))
    }, size)
    const locator = page.locator('svg')
    await locator.screenshot({ path: join(iconsDir, `${name}.png`), omitBackground: true })
  }
  console.log(`${app}: ${names.length} icons -> PNG`)
}

await browser.close()
console.log('done')