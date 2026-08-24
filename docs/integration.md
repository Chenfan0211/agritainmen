# 七端同源联调说明

## 入口与构建

```bash
pnpm build:single-origin
pnpm check:single-origin
node scripts/serve-single-origin.mjs
```

完整 H5 联调服务默认运行在 `http://127.0.0.1:8780`：

- `/admin/`：供应链管理后台
- `/farmhouse/`：农家乐门店
- `/alliance/`：联盟推客平台
- `/store/`：门店订货端
- `/promoter/`：推客端
- `/user/`：C 端商城
- `/supplier/`：供应商履约端

8791-8798 只用于单端开发预览。生产部署设置 `VITE_PORTAL_ORIGIN`，不得使用 `127.0.0.1`、`localhost` 或 `demo.local`。

同源产物位于 `apps/*/dist/single-origin/*`。静态资源使用 `/{app}/static/*` 路径，服务器只需按应用前缀提供普通静态文件，不需要实现 `/static/*` 跨应用回退。

## 业务链路

1. 管理端在“商品库管理 / C 端商城商品”维护商品、SKU、基础价、两级分佣、库存和上下架状态。
2. 用户端读取独立 C 端目录，按普通、一级和二级身份展示价格；所有商品固定快递配送。
3. 用户支付后按供应商生成稳定的 `C-MALL-{subOrderId}` 履约订单。
4. `supplier / 123456` 处理 S002，`supplier04 / 123456` 处理 S004；两个账号只能操作自己的订单。
5. 供应商接单、快递发货和物流写回 C 子订单；用户端查看物流、确认收货和发起售后。
6. 售后、库存释放和佣金冲正由用户端 C 端模型处理，供应商端只同步履约和售后状态。

## 共享数据键

- `agritainment-platform-c-inventory`：带 revision 的 C 端商品和库存
- `agritainment-platform-c-orders`：C 端主订单及供应商子订单
- `agritainment-platform-orders`：门店订单和 C 端供应商履约订单
- `agritainment-platform-c-addresses`：C 端地址集合
- `agritainment-platform-c-commissions`：C 端佣金流水
- `agritainment-platform-c-user-sessions`：按 userId 隔离的购物车和演示身份
- `agritainment-platform-bindings`：推广归因和正式绑定

H5 页面监听相关 `storage` 事件并重新读取共享快照。localStorage revision 只提供演示级乐观冲突检测，不能替代生产后端的鉴权、事务和原子库存扣减。

## 跨平台限制

微信小程序之间不共享 localStorage。小程序跳转只传递 `promoter`、`promoterName`、`live`、`staff`、`farm`、`activity` 和 `store` 等归因参数；用户身份只由授权 openid 映射决定，URL `userId` 不生效。生产环境的商品、订单、库存、物流和佣金同步必须接入后端或云开发数据库。

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
pnpm test:e2e:integration
```

`test:e2e:integration` 覆盖 375x812、768x900、1280x900、1440x900，验证管理端改价、双供应商独立履约、用户物流/收货/售后及页面级横向溢出。
