import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const roots = [
  [8791, 'apps/admin/dist/build/h5'],
  [8792, 'apps/farmhouse/dist/build/h5'],
  [8793, 'apps/alliance/dist/build/h5'],
  [8794, 'apps/farmhouse/dist/tenants/yunshang/h5'],
  [8795, 'apps/store/dist/build/h5'],
  [8796, 'apps/promoter/dist/build/h5'],
  [8797, 'apps/user/dist/build/h5']
]

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

for (const [port, relativeRoot] of roots) {
  const root = join(process.cwd(), relativeRoot)
  createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0])
    const relativePath = normalize(requestPath).replace(/^([/\\])+/, '')
    let filePath = join(root, relativePath || 'index.html')
    if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root, 'index.html')
    response.setHeader('Content-Type', mimeTypes[extname(filePath)] || 'application/octet-stream')
    createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) {
          response.writeHead(404)
          response.end('Not Found')
        } else {
          response.destroy()
        }
      })
      .pipe(response)
  }).listen(port, '127.0.0.1')
}

console.log('H5 previews ready on ports 8791-8797')
