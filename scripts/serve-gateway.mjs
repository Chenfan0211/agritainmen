import { createServer } from 'node:http'
import { createTencentMapGatewayHandler } from '../packages/tencent-map-gateway/src/index.mjs'

// 腾讯地图 WebService 同源网关（独立进程）。
// 运营后台 H5 开发态由 vite 插件提供同一路由（apps/admin/vite.config.ts），
// 此脚本用于微信小程序等无法走 vite devServer 的场景：
//   node scripts/serve-gateway.mjs            # 默认 http://127.0.0.1:8790/api/tencent-map/*
//   VITE_TENCENT_MAP_GATEWAY=http://127.0.0.1:8790/api/tencent-map/geocode
const portArgumentIndex = process.argv.findIndex((argument) => argument === '--port')
const inlinePort = process.argv.find((argument) => argument.startsWith('--port='))?.slice('--port='.length)
const port = Number(inlinePort || (portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : '') || process.env.PORT || 8790)
const tencentMapGateway = createTencentMapGatewayHandler()

const server = createServer((request, response) => {
  if ((request.url || '').startsWith('/api/tencent-map/')) {
    void tencentMapGateway(request, response)
    return
  }
  if ((request.url || '/') === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ ok: true, gateway: '/api/tencent-map/*' }))
    return
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not Found')
})

server.on('error', (error) => {
  console.error(`[gateway] server failed: ${error.message}`)
  process.exitCode = 1
})

server.listen(port, process.env.HOST || '127.0.0.1', () => {
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  console.log(`Tencent map gateway ready on http://127.0.0.1:${actualPort}/api/tencent-map/*`)
})
