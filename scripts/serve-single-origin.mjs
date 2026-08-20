import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'

const port = Number(process.env.PORT || 8780)
const apps = {
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
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
}

createServer((request, response) => {
  const url = decodeURIComponent((request.url || '/').split('?')[0])
  if (url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    const links = Object.keys(apps).map((p) => `<a style="display:block;margin:8px 0;font-size:18px" href="${p}">${p}</a>`).join('')
    response.end(`<h2>农旅数字供应链演示（同源 8780 · 数据互通）</h2>${links}`)
    return
  }
  if (url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  if (url.startsWith('/static/')) {
    const staticRoot = join(process.cwd(), 'dist/single-origin/static')
    let staticPath = join(staticRoot, url.slice('/static/'.length))
    if (!staticPath.startsWith(staticRoot) || !existsSync(staticPath) || statSync(staticPath).isDirectory()) { response.writeHead(404); response.end('Not Found'); return }
    response.setHeader('Content-Type', mime[extname(staticPath)] || 'application/octet-stream')
    createReadStream(staticPath).on('error', () => { if (!response.headersSent) { response.writeHead(404); response.end('Not Found') } else response.destroy() }).pipe(response)
    return
  }
  const prefix = Object.keys(apps).sort((a, b) => b.length - a.length).find((p) => url.startsWith(p))
  if (!prefix) { response.writeHead(404); response.end('Not Found'); return }
  const root = join(process.cwd(), apps[prefix])
  const rel = url.slice(prefix.length)
  let filePath = join(root, rel || 'index.html')
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root, 'index.html')
  response.setHeader('Content-Type', mime[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath)
    .on('error', () => { if (!response.headersSent) { response.writeHead(404); response.end('Not Found') } else response.destroy() })
    .pipe(response)
}).listen(port, process.env.HOST || '127.0.0.1')
console.log(`Single-origin demo ready on http://127.0.0.1:${port}`)
