# 农家乐数字供应链平台前端

基于 Uni-app、Vue 3、TypeScript 和 Pinia 的多端前端演示工程。项目不包含后端服务，业务数据和状态流转均在本地完成。

## 应用

- `apps/admin`：供应链管理后台，仅构建 H5。
- `apps/farmhouse`：农家乐独立门店，构建 H5 和微信小程序。
- `apps/alliance`：联盟推客平台，构建 H5 和微信小程序。
- `apps/store`：门店订货商城，门店以供货价向甄选好物供应链中台直采下单并查看订单，仅构建 H5。
- `apps/promoter`：推客端（H5 + 微信小程序），推客创建直播、选择多个门店及套餐券商品推广，管理直播、查看消费分成与绑定用户。
- `apps/user`：用户端（H5 + 微信小程序），仅能通过推客二维码/链接进入，查看该推客直播间及其门店套餐，跳转门店端预订。
- `apps/supplier`：供应商配送工作台（**仅微信小程序**，H5 仅用于开发预览），供应商与司机双角色登录；供应商处理门店进货单的接单/派单/快递直发/出库交接并管理司机账号，司机查看当日配送任务并完成到店交接，缺货自动统计。
- `packages/shared`：公共业务类型、演示数据和纯函数。

## 开发

```bash
pnpm install
pnpm dev:admin
pnpm dev:farmhouse
pnpm dev:alliance
pnpm dev:store
pnpm dev:promoter
pnpm dev:user
pnpm dev:supplier
```

默认开发地址由 Uni-app 输出。各应用请分别启动，避免端口冲突。

## 验证

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm build
```

`pnpm build` 会依次构建后台 H5、门店 H5/微信小程序、联盟 H5/微信小程序、门店订货商城 H5、供应商端 H5。

预览端口：admin 8791、farmhouse 8792、alliance 8793、云上人家 8794、store 8795、promoter 8796、user 8797（见 `scripts/serve-dist.mjs`）。跨应用联动（直播发布、用户绑定、消费分成、门店账号）依赖 H5 同域名部署；开发时不同端口不共享，可用构建产物挂同源路径验证。
首次执行端到端测试前运行 `pnpm exec playwright install chromium` 安装测试浏览器。

## 门店多租户构建

门店配置位于 `apps/farmhouse/src/config/tenant.ts`。默认使用石板溪配置，也提供云上人家示例：

```bash
pnpm --filter @agritainment/farmhouse build:h5:yunshang
pnpm --filter @agritainment/farmhouse build:mp:yunshang
```

新增门店时增加配置与对应 `.env.<tenant>` 文件，不复制业务页面。

## 演示账号

- admin 供应链管理后台：账号 `admin` / 密码 `123456`
- store 门店订货商城、alliance 联盟推客：手机号 `13800000000` / 密码 `123456`，验证码 `123456`（页面自动填充，可直接一键登录）
- farmhouse 农家乐门店：微信一键登录（本地模拟 openid，无真实后端）；登录前先选择演示身份（顾客 / 店员 / 店长）
- supplier 供应商端：登录时选择角色；供应商账号 `supplier` / `123456`（湘西腊味合作社），预置司机 `driver01`~`driver03` / `123456`（张伟 / 李强 / 王芳）。

## 推客端与用户端

- 推客端（apps/promoter）：推客登录后可创建直播，选择要推广的多个门店，并为每个门店选择多个「套餐券」商品；直播发布后生成链接/二维码。
- 用户端（apps/user）：用户扫码（链接带 `promoter` / `live` 参数）进入，仅展示该推客的直播间及其绑定门店套餐，点「进店预订」跳转门店端（farmhouse）。
- 用户绑定与消费分成：首次扫码为临时绑定，用户在门店端下单后转为正式绑定并永久锁定；一个用户只能绑定一个推客或一个店员。中控台（admin）可设置全局推客/店员分成比例并查看分成记录。
- 店员推广权限：店长在门店端「店员管理」或中控台「门店账号」给店员开启推广权限；开启后店员可生成自己的推广码。
