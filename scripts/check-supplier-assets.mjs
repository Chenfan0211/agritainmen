import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const supplierRoot = join(root, 'apps', 'supplier')
const sourceIcons = join(supplierRoot, 'src', 'static', 'icons')
const generatedIconsScript = join(root, 'scripts', 'svg-icons-to-png.mjs')
const mpDist = join(supplierRoot, 'dist', 'build', 'mp-weixin')
const h5Dist = join(supplierRoot, 'dist', 'build', 'h5')

const expectedIcons = ['calendar-check', 'check', 'chevron-left', 'chevron-right', 'layout-dashboard', 'list-tree', 'map-pin', 'navigation', 'package', 'package-check', 'search', 'user-round', 'users', 'x']
const removedSvgs = ['arrow-left', 'arrow-right', 'badge-dollar-sign', 'badge-percent', 'bell-ring', 'bell', 'calendar-days', 'chart-no-axes-combined', 'chevron-down', 'credit-card', 'crown', 'door-open', 'download', 'factory', 'headset', 'house', 'link', 'megaphone', 'package-plus', 'phone', 'play', 'plus', 'radio', 'shield-check', 'shopping-bag', 'shopping-cart', 'sprout', 'store', 'tags', 'trophy', 'truck', 'user-round-check', 'utensils']

function fail(message) {
  throw new Error(`[supplier-assets] ${message}`)
}

function filesUnder(directory) {
  if (!existsSync(directory)) fail(`目录不存在: ${relative(root, directory)}`)
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function filesContaining(directory, extension, text) {
  return filesUnder(directory).filter((path) => path.endsWith(extension) && readFileSync(path, 'utf8').includes(text))
}

if (!existsSync(sourceIcons)) fail(`图标源目录不存在: ${relative(root, sourceIcons)}`)
const sourceFiles = filesUnder(sourceIcons).filter((path) => statSync(path).isFile()).map((path) => relative(sourceIcons, path))
const pngs = sourceFiles.filter((name) => name.endsWith('.png'))
const svgs = sourceFiles.filter((name) => name.endsWith('.svg'))
if (pngs.length !== expectedIcons.length || svgs.length !== expectedIcons.length) {
  fail(`源图标应为 ${expectedIcons.length} PNG + ${expectedIcons.length} SVG，实际为 ${pngs.length} PNG + ${svgs.length} SVG`)
}
for (const name of expectedIcons) {
  if (!pngs.includes(`${name}.png`) || !svgs.includes(`${name}.svg`)) fail(`缺少图标源: ${name}`)
}

const generatorSource = readFileSync(generatedIconsScript, 'utf8')
const generatedList = generatorSource.match(/const names = \[([^\]]+)\]/s)?.[1] || ''
const generatedNames = generatedList.match(/'([^']+)'/g)?.map((name) => name.slice(1, -1)) || []
if (JSON.stringify(generatedNames) !== JSON.stringify(expectedIcons)) fail('PNG 生成脚本的图标源列表与保留图标列表不一致')
for (const name of expectedIcons) {
  if (!existsSync(join(sourceIcons, `${name}.svg`))) fail(`PNG 生成源不存在: ${name}.svg`)
}

const supplierSource = filesUnder(join(supplierRoot, 'src')).filter((path) => /\.(vue|ts)$/.test(path)).map((path) => readFileSync(path, 'utf8')).join('\n')
const staticIcons = [...supplierSource.matchAll(/UiIcon\s+name="([^"]+)"/g)].map((match) => match[1])
const dynamicIcons = [...supplierSource.matchAll(/icon:\s*'([^']+)'/g)].map((match) => match[1]).filter((name) => name !== 'none')
const usedIcons = [...staticIcons, ...dynamicIcons]
for (const name of [...new Set(usedIcons)]) {
  if (!existsSync(join(sourceIcons, `${name}.png`))) fail(`UiIcon 使用了不存在的 PNG: ${name}`)
}

const mpFiles = filesUnder(mpDist)
const mpWxss = filesContaining(mpDist, '.wxss', '--status-bar-height')
if (!mpWxss.length) fail('MP WXSS 未找到 --status-bar-height')
if (filesContaining(mpDist, '.wxss', 'safe-area-inset-top').length) fail('MP WXSS 不应包含 safe-area-inset-top')
for (const name of removedSvgs) {
  if (mpFiles.some((path) => path.endsWith(`/${name}.svg`) || path.endsWith(`\\${name}.svg`))) fail(`MP 产物仍包含已删除 SVG: ${name}.svg`)
}
const mpIconFiles = mpFiles.filter((path) => /[/\\]static[/\\]icons[/\\][^/\\]+\.(png|svg)$/.test(path))
const expectedIconFiles = expectedIcons.flatMap((name) => [`${name}.png`, `${name}.svg`]).sort()
const actualIconFiles = mpIconFiles.map((path) => basename(path)).sort()
if (JSON.stringify(actualIconFiles) !== JSON.stringify(expectedIconFiles)) {
  fail(`MP 产物 static/icons 应为 ${expectedIconFiles.length} 个 PNG/SVG`)
}

const h5Css = filesContaining(h5Dist, '.css', 'safe-area-inset-top')
if (!h5Css.length) fail('H5 CSS 未找到 safe-area-inset-top')
if (filesContaining(h5Dist, '.css', '--status-bar-height').length) fail('H5 CSS 不应包含 --status-bar-height')

console.log(`[supplier-assets] passed: source ${pngs.length} PNG + ${svgs.length} SVG, MP ${mpIconFiles.length} icons, H5/MP safe-area branches verified`)
