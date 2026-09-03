import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const apps = ['dashboard', 'admin', 'farmhouse', 'store', 'promoter', 'user', 'supplier']
const productCategoryImageApps = ['admin', 'farmhouse', 'store', 'user', 'supplier']
const productCategoryImageFiles = [
  'agricultural-products.webp', 'prepared-foods.webp', 'ingredients-seasonings.webp',
  'featured-ingredients.webp', 'local-specialties.webp', 'souvenirs.webp',
  'cultural-tourism-gifts.webp', 'homestay-supplies.webp', 'packaging-consumables.webp',
  'package-vouchers.webp', 'fresh-produce.webp', 'seasonal-fruit.webp',
  'organic-vegetables.webp', 'grains-oils-noodles.webp', 'beverages.webp',
  'all.webp', 'fallback.webp'
]
const mimeByExtension = new Map([
  ['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
  ['.json', 'application/json'], ['.map', 'application/json'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
  ['.wasm', 'application/wasm'], ['.webmanifest', 'application/manifest+json']
])

function fail(message) {
  throw new Error(`[single-origin] ${message}`)
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function webpDimensions(file) {
  const bytes = readFileSync(file)
  if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
    fail(`商品品类图片不是有效 WebP: ${relative(root, file)}`)
  }
  const format = bytes.subarray(12, 16).toString()
  if (format === 'VP8X') {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    }
  }
  if (format === 'VP8L') {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    }
  }
  if (format !== 'VP8 ') fail(`商品品类图片使用未知 WebP 编码: ${relative(root, file)}`)
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
}

function isWithin(directory, file) {
  const path = relative(directory, file)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.includes(':'))
}

function isExternalReference(reference) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)
}

function cleanReference(reference) {
  const raw = reference.trim()
  if (!raw || isExternalReference(raw)) return ''
  const withoutSuffix = raw.split('#')[0].split('?')[0]
  try {
    return decodeURI(withoutSuffix).replaceAll('\\', '/')
  } catch {
    fail(`无法解码资源引用: ${reference}`)
  }
}

function isAssetReference(reference) {
  const clean = cleanReference(reference)
  return !!clean && (mimeByExtension.has(extname(clean).toLowerCase()) || clean.includes('/static/') || clean.includes('/assets/'))
}

function extractAssetReferences(content) {
  const references = new Set()
  const add = (reference) => { if (reference && isAssetReference(reference)) references.add(reference.trim()) }

  for (const match of content.matchAll(/(?:src|href|poster|image|icon)\s*(?:=|:)\s*["']([^"']+)["']/gi)) add(match[1])
  for (const match of content.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const candidate of match[1].split(',')) add(candidate.trim().split(/\s+/)[0])
  }
  for (const match of content.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)) add(match[1])
  for (const match of content.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) add(match[1])
  for (const match of content.matchAll(/sourceMappingURL=([^\s*]+)/gi)) add(match[1])
  for (const match of content.matchAll(/["'`]((?:\/|\.\.?\/)[^"'`\s<>]+)["'`]/g)) {
    const reference = match[1]
    if (reference.startsWith('.')) add(reference)
  }

  return [...references]
}

function resolveAssetReference(app, output, sourceFile, reference) {
  const clean = cleanReference(reference)
  if (!clean) return null

  // Dashboard aggregates shared demo records but never exposes their image
  // metadata. Its dedicated build check also forbids emitting static/images.
  if (app === 'dashboard' && /\.(?:js|mjs)$/.test(sourceFile) && clean.startsWith('/dashboard/static/images/')) return null

  let file
  let publicPath
  if (clean.startsWith('/')) {
    if (clean.startsWith('/static/')) fail(`${app} 产物仍包含未命名空间化静态资源: ${reference}`)
    const referencedApp = apps.find((candidate) => clean.startsWith(`/${candidate}/`))
    if (referencedApp && referencedApp !== app) fail(`${app} 资源错误引用 ${referencedApp} 前缀: ${reference}`)
    if (!referencedApp) fail(`${app} 本地资源脱离应用前缀: ${reference}`)
    if (clean.includes('${')) return null
    file = resolve(output, clean.slice(app.length + 2))
    publicPath = clean
  } else {
    if (clean.includes('${')) return null
    file = resolve(dirname(sourceFile), clean)
    publicPath = `/${app}/${relative(output, file).split(sep).join('/')}`
  }

  if (!isWithin(output, file)) fail(`${app} 资源越界: ${reference}`)
  if (!existsSync(file)) fail(`${app} 资源不存在: ${reference}（来自 ${relative(root, sourceFile)}）`)
  if (statSync(file).isDirectory()) {
    if (clean === `/${app}/static/`) return null
    fail(`${app} 资源引用指向目录: ${reference}（来自 ${relative(root, sourceFile)}）`)
  }
  const expectedMime = mimeByExtension.get(extname(file).toLowerCase())
  if (!expectedMime) fail(`${app} 无法校验资源 MIME: ${reference}`)
  return { publicPath, expectedMime }
}

const httpAssets = new Map()
for (const app of apps) {
  const output = join(root, 'apps', app, 'dist', 'single-origin', app)
  const index = join(output, 'index.html')
  if (!existsSync(index)) fail(`缺少 ${relative(root, index)}`)

  const sourceFiles = filesUnder(output).filter((file) => /\.(html|css|js|mjs)$/.test(file))
  for (const sourceFile of sourceFiles) {
    const content = readFileSync(sourceFile, 'utf8')
    for (const reference of extractAssetReferences(content)) {
      const resolved = resolveAssetReference(app, output, sourceFile, reference)
      if (resolved) httpAssets.set(resolved.publicPath, resolved.expectedMime)
    }
  }
  for (const file of filesUnder(output)) {
    const expectedMime = mimeByExtension.get(extname(file).toLowerCase())
    if (expectedMime) httpAssets.set(`/${app}/${relative(output, file).split(sep).join('/')}`, expectedMime)
  }
}

for (const file of productCategoryImageFiles) {
  const masterFile = join(root, 'assets', 'product-categories', 'master', file)
  if (!existsSync(masterFile)) fail(`缺少商品品类图片母版: ${file}`)
  const dimensions = webpDimensions(masterFile)
  if (dimensions.width !== 512 || dimensions.height !== 512) fail(`商品品类图片尺寸必须为 512x512: ${file}`)
  if (statSync(masterFile).size > 150 * 1024) fail(`商品品类图片超过 150KB: ${file}`)
  const masterHash = sha256(masterFile)
  const sourceHashes = new Set()
  for (const app of productCategoryImageApps) {
    const sourceFile = join(root, 'apps', app, 'src', 'static', 'images', 'categories', file)
    const outputFile = join(root, 'apps', app, 'dist', 'single-origin', app, 'static', 'images', 'categories', file)
    if (!existsSync(sourceFile)) fail(`${app} 缺少商品品类图片: static/images/categories/${file}`)
    if (!existsSync(outputFile)) fail(`${app} 单源产物缺少商品品类图片: static/images/categories/${file}`)
    sourceHashes.add(sha256(sourceFile))
  }
  if (sourceHashes.size !== 1) fail(`商品品类图片哈希不一致: ${file}`)
  if (!sourceHashes.has(masterHash)) fail(`商品品类图片与母版哈希不一致: ${file}`)
}

const sourceFiles = apps.flatMap((app) => filesUnder(join(root, 'apps', app, 'src')).filter((file) => /\.(vue|ts|scss)$/.test(file)))
const source = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
if (source.includes('demo.local')) fail('源码仍包含 demo.local')
if (/127\.0\.0\.1:879[1-8]|localhost:879[1-8]/.test(source)) fail('应用源码仍散落硬编码 H5 预览端口')

const distFiles = apps.flatMap((app) => filesUnder(join(root, 'apps', app, 'dist', 'single-origin', app)).filter((file) => /\.(html|css|js|mjs)$/.test(file)))
const distSource = distFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
if (/127\.0\.0\.1|localhost|demo\.local/.test(distSource)) fail('同源构建产物仍包含本机或旧假域名')
if (/(?:images\.)?(?:unsplash\.com|pexels\.com)/i.test(distSource)) fail('同源构建产物仍包含远程图片图库地址')

const userSource = readFileSync(join(root, 'apps', 'user', 'src', 'stores', 'user.ts'), 'utf8')
const supplierSource = readFileSync(join(root, 'apps', 'supplier', 'src', 'stores', 'supplier.ts'), 'utf8')
if (!userSource.includes('publishCSubOrderToSupplier') || !supplierSource.includes('readPlatformOrders')) fail('用户端和供应商端未发现 C 端履约共享契约')

function startValidationServer() {
  return new Promise((resolveServer, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', 'serve-single-origin.mjs'), '--port', '0'], {
      cwd: root,
      env: { ...process.env, HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`[single-origin] 启动 MIME 校验服务超时${stderr ? `: ${stderr.trim()}` : ''}`))
    }, 10_000)
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (!match || settled) return
      settled = true
      clearTimeout(timer)
      resolveServer({ child, origin: `http://127.0.0.1:${match[1]}` })
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`[single-origin] MIME 校验服务提前退出 (${code})${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

async function verifyHttpResource(origin, path, expectedMime) {
  const response = await fetch(`${origin}${encodeURI(path)}`)
  if (response.status !== 200) fail(`HTTP ${response.status}: ${path}`)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith(expectedMime)) fail(`MIME 错误: ${path}，期望 ${expectedMime}，实际 ${contentType || '空'}`)
}

const validationServer = await startValidationServer()
try {
  for (const app of apps) await verifyHttpResource(validationServer.origin, `/${app}/`, 'text/html')
  for (const [path, expectedMime] of httpAssets) await verifyHttpResource(validationServer.origin, path, expectedMime)
  const missingAsset = await fetch(`${validationServer.origin}/user/assets/__single-origin-missing__.js`)
  if (missingAsset.status !== 404) fail(`缺失静态资源必须返回 404，实际 ${missingAsset.status}`)
} finally {
  validationServer.child.kill()
}

console.log(`[single-origin] passed: ${apps.length} entries, ${httpAssets.size} referenced assets and MIME responses verified`)
