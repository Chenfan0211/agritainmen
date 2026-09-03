import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, relative, resolve } from 'node:path'
import { createTencentMapGatewayHandler } from '../packages/tencent-map-gateway/src/index.mjs'

const portArgumentIndex = process.argv.findIndex((argument) => argument === '--port')
const inlinePort = process.argv.find((argument) => argument.startsWith('--port='))?.slice('--port='.length)
const port = Number(inlinePort || (portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : '') || process.env.PORT || 8780)
const apps = {
  '/dashboard/': 'apps/dashboard/dist/single-origin/dashboard',
  '/admin/': 'apps/admin/dist/single-origin/admin',
  '/farmhouse/': 'apps/farmhouse/dist/single-origin/farmhouse',
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
const tencentMapGateway = createTencentMapGatewayHandler()

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
  if ((request.url || '').startsWith('/api/tencent-map/')) {
    void tencentMapGateway(request, response)
    return
  }
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
    const meta = {
      '/dashboard/': ['产业驾驶舱', '监管监测 · 产业赋能', '#25332d'],
      '/admin/': ['管理后台', '供应链运营管理', '#17633f'],
      '/farmhouse/': ['农家乐门店端', '门店 · 预订 · 商城 · 会员', '#1f6b47'],
      '/store/': ['门店订货商城', '供货价直采 · 中台直配', '#20714a'],
      '/promoter/': ['推客分销端', '直播 · 分享 · 分成', '#1e6952'],
      '/user/': ['用户商城', '购物 · 售后 · 分销', '#1d6b4e'],
      '/supplier/': ['供应商配送', '订单 · 线路 · 交接 · 结算', '#17633f']
    }
    const cards = Object.keys(apps).map((p) => {
      const [name, desc, accent] = meta[p] || [p, '演示入口', '#17633f']
      return `<a href="${p}" style="display:block;text-decoration:none;color:#18231d;background:#fff;border:1px solid #dde5df;border-radius:8px;padding:16px 18px;box-shadow:0 1px 2px rgba(19,43,29,.04)"><span style="display:block;font-size:16px;font-weight:800;color:${accent}">${name}</span><span style="display:block;margin-top:4px;font-size:12px;color:#66736b">${desc}</span><span style="display:block;margin-top:10px;font-size:12px;color:#17633f;font-weight:700">${p}</span></a>`
    }).join('')
    response.end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>农旅数字供应链演示</title></head><body style="margin:0;background:#f4f7f5;color:#18231d;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:960px;margin:0 auto;padding:48px 24px 64px"><p style="margin:0;font-size:13px;color:#17633f;font-weight:800;letter-spacing:.08em">AGRITAINMENT · DEMO HUB</p><h1 style="margin:10px 0 6px;font-size:26px;font-weight:800;color:#0f4a31">农旅数字供应链演示</h1><p style="margin:0 0 28px;font-size:14px;color:#66736b">同源 8780 · 数据互通 · 选择入口</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">' + cards + '</div><p style="margin-top:32px;font-size:12px;color:#98a49c">湖南省电子商务协会 · 中选科技供应链中台</p></div></body></html>')
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
