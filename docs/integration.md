# 八端同源联调说明

## 入口与构建

```bash
pnpm build:single-origin
pnpm check:single-origin
node scripts/serve-single-origin.mjs
```

完整 H5 联调服务默认运行在 `http://127.0.0.1:8780`：

- `/admin/`：中选科技供应链管理后台
- `/dashboard/`：产业数据监管与赋能驾驶舱
- `/farmhouse/`：中选科技农家乐门店端
- `/alliance/`：中选科技联盟推客平台
- `/store/`：中选科技门店订货商城
- `/promoter/`：中选科技推客端
- `/user/`：中选科技商城
- `/supplier/`：中选科技供应商配送工作台

8791-8798 只用于单端开发预览。不同端口即使使用同一台浏览器，`localStorage` 也不共享；涉及跨端共享数据的联调必须通过 `pnpm dev:single-origin` 启动的同源入口进行。生产部署设置 `VITE_PORTAL_ORIGIN`，不得使用 `127.0.0.1`、`localhost` 或 `demo.local`。

同源产物位于 `apps/*/dist/single-origin/*`。静态资源使用 `/{app}/static/*` 路径，服务器只需按应用前缀提供普通静态文件，不需要实现 `/static/*` 跨应用回退。

## 业务链路

1. 管理端在“商品库管理 / C 端商城商品”维护商品、SKU、基础价、两级分佣、库存和上下架状态。
2. 用户端读取独立 C 端目录，按普通、一级和二级身份展示价格；所有商品固定快递配送。
3. 用户支付后按供应商生成稳定的 `C-MALL-{subOrderId}` 履约订单。
4. `13787366688 / 13787366688` 处理 S002，`13574902233 / 13574902233` 处理 S004；两个手机号账号只能操作自己的订单。
5. 供应商接单、快递发货和物流写回 C 子订单；用户端查看物流、确认收货和发起售后。
6. 售后、库存释放和佣金冲正由用户端 C 端模型处理，供应商端只同步履约和售后状态。

## 共享数据键

- `agritainment-platform-c-inventory`：带 revision 的 C 端商品和库存
- `agritainment-platform-c-orders`：C 端主订单及供应商子订单
- `agritainment-platform-orders`：门店订单和 C 端供应商履约订单
- `agritainment-platform-supplier-accounts`：后台生成的供应商手机号账号与演示密码
- `agritainment-platform-c-addresses`：C 端地址集合
- `agritainment-platform-c-commissions`：C 端佣金流水
- `agritainment-platform-c-user-sessions`：按 userId 隔离的购物车和演示身份
- `agritainment-platform-bindings`：推广归因和正式绑定
- `agritainment-platform-entities`：门店、供应商等共享主数据，门店坐标由运营后台写入
- `agritainment-platform-store-accounts`：门店账号；驾驶舱“在岗店员”仅统计启用的 `staff`
- `agritainment-platform-vouchers`、`agritainment-platform-bookings`：券订单和预约交易
- `agritainment-platform-commission-ledger`、`agritainment-platform-supplier-settlements`：佣金与供应商结算

H5 页面通过同源平台变更总线和页面重新可见事件读取共享快照；驾驶舱在 300ms 防抖后重新聚合，且不会回写业务状态。localStorage revision 只提供演示级乐观冲突检测，不能替代生产后端的鉴权、事务和原子库存扣减。

驾驶舱只读取当前浏览器同域共享数据，权限过滤发生在指标聚合前。地图坐标来自门店主数据中的 GCJ-02 定位结果；非法坐标、定位失败和行政区不匹配门店只进入监管风险，不生成地图点位。省、市边界数据随 dashboard 静态产物发布，不在运行时请求外部 GeoJSON。门店预约在核销时由店员填写实际消费金额并写入共享预约；历史预约缺少金额时仍计订单量，但不估算交易额。

运营后台地理编码环境变量：

```bash
VITE_GEOCODER_ORDER=amap,tencent
VITE_AMAP_KEY=
VITE_TENCENT_MAP_KEY=
VITE_AMAP_PROXY=
VITE_TENCENT_MAP_PROXY=
```

Key 和代理地址不提交到仓库。生产环境应优先使用服务端代理，当前公开账号、localStorage 聚合和浏览器侧区域权限均只适用于演示环境。

## 跨平台限制

微信小程序之间不共享 localStorage。小程序跳转只传递 `promoter`、`promoterName`、`live`、`staff`、`farm`、`activity` 和 `store` 等归因参数；用户身份只由授权 openid 映射决定，URL `userId` 不生效。供应商账号在当前演示版中以明文保存在同源 localStorage，仅用于 H5 联调；生产环境的账号密码必须由服务端哈希保存并完成鉴权，商品、订单、库存、物流和佣金同步也必须接入后端或云开发数据库。

当前支付、库存、物流、售后和佣金均为前端 mock，不包含真实支付、物流回调和生产鉴权。

## 验收

```bash
pnpm test
pnpm typecheck
pnpm check:supplier-assets
pnpm check:single-origin
pnpm test:e2e
pnpm test:e2e:supplier
pnpm test:e2e:user
pnpm test:e2e:dashboard
pnpm test:e2e:integration
```

`test:e2e:dashboard` 覆盖 1920x1080、1440x900、1366x768 的登录权限、角色模块、区域下钻、监管明细和布局。`test:e2e:integration` 覆盖 375x812、768x900、1280x900、1440x900，验证管理端改价、供应商手机号建号/换号/改密、双供应商独立履约、用户物流/收货/售后，以及运营后台新增门店后驾驶舱的同源自动刷新。
