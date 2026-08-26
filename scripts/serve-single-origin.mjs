import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, relative, resolve } from 'node:path'

const portArgumentIndex = process.argv.findIndex((argument) => argument === '--port')
const inlinePort = process.argv.find((argument) => argument.startsWith('--port='))?.slice('--port='.length)
const port = Number(inlinePort || (portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : '') || process.env.PORT || 8780)
const apps = {
  '/dashboard/': 'apps/dashboard/dist/single-origin/dashboard',
  '/admin/': 'apps/admin/dist/single-origin/admin',
  '/farmhouse/': 'apps/farmhouse/dist/single-origin/farmhouse',
  '/alliance/': 'apps/alliance/dist/single-origin/alliance',
  '/store/': 'apps/store/dist/single-origin/store',
  '/promoter/': 'apps/promoter/dist/single-origin/promoter',
  '/user/': 'apps/user/dist/single-origin/user',
  '/supplier/': 'apps/supplier/dist/single-origin/supplier'
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.wasm': 'application/wasm', '.map': 'application/json', '.webmanifest': 'application/manifest+json'
}

function isWithin(root, candidate) {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !path.includes(':'))
}

function notFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not Found')
}

function streamFile(filePath, response) {
  response.setHeader('Content-Type', mime[extname(filePath).toLowerCase()] || 'application/octet-stream')
  createReadStream(filePath)
    .on('error', () => { if (!response.headersSent) notFound(response); else response.destroy() })
    .pipe(response)
}

const server = createServer((request, response) => {
  let url
  try {
    url = decodeURIComponent((request.url || '/').split('?')[0])
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Bad Request')
    return
  }
  if (url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    const links = Object.keys(apps).map((p) => `<a style="display:block;margin:8px 0;font-size:18px" href="${p}">${p}</a>`).join('')
    response.end(`<h2>农旅数字供应链演示（同源 8780 · 数据互通）</h2>${links}`)
    return
  }
  if (url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  if (url.startsWith('/static/')) {
    const staticRoot = resolve(process.cwd(), 'dist/single-origin/static')
    const staticPath = resolve(staticRoot, url.slice('/static/'.length))
    if (!isWithin(staticRoot, staticPath) || !existsSync(staticPath) || statSync(staticPath).isDirectory()) { notFound(response); return }
    streamFile(staticPath, response)
    return
  }
  const prefix = Object.keys(apps).sort((a, b) => b.length - a.length).find((p) => url.startsWith(p))
  if (!prefix) { notFound(response); return }
  const root = resolve(process.cwd(), apps[prefix])
  const rel = url.slice(prefix.length)
  let filePath = resolve(root, rel || 'index.html')
  if (!isWithin(root, filePath)) { notFound(response); return }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    if (extname(rel)) { notFound(response); return }
    filePath = resolve(root, 'index.html')
  }
  streamFile(filePath, response)
})

server.on('error', (error) => {
  console.error(`[single-origin] server failed: ${error.message}`)
  process.exitCode = 1
})

server.listen(port, process.env.HOST || '127.0.0.1', () => {
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  console.log(`Single-origin demo ready on http://127.0.0.1:${actualPort}`)
})
