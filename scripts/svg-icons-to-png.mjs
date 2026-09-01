// 一次性脚本：把供应商端实际使用的 lucide SVG 图标渲染为小程序可用的 PNG。
// 用法: node scripts/svg-icons-to-png.mjs
// 说明: 微信小程序 <image> 不支持本地 SVG，H5 支持；本脚本用 Chromium 把 SVG
//       渲染成 64x64 透明底 PNG（墨色 #1f2a22 描边），覆盖小程序端图标空白问题。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const iconsDir = join(root, 'apps', 'supplier', 'src', 'static', 'icons')
const names = ['calendar-check', 'check', 'chevron-left', 'chevron-right', 'layout-dashboard', 'list-tree', 'map-pin', 'navigation', 'package', 'package-check', 'search', 'user-round', 'users', 'x']
const size = 64
const color = '#1f2a22'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 1 })

for (const name of names) {
  const svgPath = join(iconsDir, `${name}.svg`)
  const raw = readFileSync(svgPath, 'utf8')
  // 去掉 XML 注释，避免干扰
  const svg = raw.replace(/<!--[\s\S]*?-->/g, '')
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div style="color:${color}">${svg}</div></body></html>`)
  await page.$eval('svg', (el, s) => {
    el.setAttribute('width', String(s))
    el.setAttribute('height', String(s))
  }, size)
  const locator = page.locator('svg')
  await locator.screenshot({ path: join(iconsDir, `${name}.png`), omitBackground: true })
  const bbox = await locator.boundingBox()
  console.log(`${name}.png -> ${Math.round(bbox.width)}x${Math.round(bbox.height)}`)
}

await browser.close()
console.log('done')
