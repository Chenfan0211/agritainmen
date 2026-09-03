# 腾讯地图接入

驾驶舱在线底图、后台地址解析、外部坐标转换和 H5 导航统一使用腾讯地图。业务数据继续存储 GCJ-02 坐标，历史 `provider: 'amap'` 记录只读兼容，不做批量重算。

## 环境变量

前端构建只允许使用以下公开配置：

```bash
VITE_TENCENT_MAP_JS_KEY=
VITE_TENCENT_MAP_STYLE_ID=
VITE_TENCENT_MAP_GATEWAY=/api/tencent-map/geocode
```

Node 网关使用以下私有配置：

```bash
TENCENT_MAP_KEY=
TENCENT_MAP_SECRET_KEY=
TENCENT_MAP_ALLOWED_ORIGINS=https://ops.example.com
TENCENT_MAP_TIMEOUT_MS=5000
```

`TENCENT_MAP_SECRET_KEY` 只能存在于服务器环境中。腾讯控制台需要为 JS Key 配置 H5 域名白名单，为 WebService Key 开启签名校验和服务器限制。已经在聊天、日志或终端历史中出现过的 Secret 应在正式上线前重新生成。

## 网关接口

- `POST /api/tencent-map/geocode`：请求 `{ "address": "...", "city": "..." }`，返回 `FarmLocation`。
- `POST /api/tencent-map/translate`：请求 `{ "source": "WGS84", "locations": [...] }`，固定返回 `coordinateSystem: "GCJ-02"`。

坐标来源支持 `GCJ-02`、`WGS84`、`SOGOU`、`BAIDU`、`MAPBAR` 和 `SOGOU_MERCATOR`。GCJ-02 只校验后原样返回，不调用腾讯配额。

## 本地与生产

`pnpm --filter @agritainment/admin dev:h5` 会在 Vite 开发服务中挂载网关。`pnpm serve:single-origin` 也会在同源入口挂载网关。

生产环境可让 Nginx 将接口转发至运行网关的 Node 服务：

```nginx
location /api/tencent-map/ {
    proxy_pass http://127.0.0.1:8780;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_connect_timeout 3s;
    proxy_read_timeout 8s;
}
```

深色地图样式在腾讯地图控制台创建后，将样式 ID 配置到 `VITE_TENCENT_MAP_STYLE_ID`。没有样式 ID 时自动使用腾讯默认底图，不影响地图和点位功能。
