# 用户端小程序化布局、直播画面与演示订单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 375px 用户端预览、可购买的全屏直播间和隔离的演示订单播种。

**Architecture:** 保持现有单页和 Pinia Store 结构，直播媒体配置独立放在 `config/live.ts`，有效直播与套餐通过现有统一目录投影得到。演示订单构造与播种从 Store 行为中抽离为可测试模块，写入共享 C 订单与券订单存储，但不调用供应商履约或库存事务。

**Tech Stack:** Vue 3、uni-app、Pinia、TypeScript、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-08-25-user-miniapp-live-demo-orders-design.md`

## Global Constraints

- H5 画框固定 375px，微信小程序保持 `100vw / 100vh`。
- 演示数据只影响当前用户，且只写 C 端订单与券订单存储。
- 现有真实下单、库存、供应商履约、佣金与售后链路不得回归。
- 保留工作区中已有未提交改动，不修改无关应用。

---

### Task 1: 演示数据播种边界

**Files:**
- Create: `apps/user/src/data/demo-orders.ts`
- Modify: `apps/user/src/stores/user.ts`
- Test: `apps/user/src/stores/user.test.ts`

**Interfaces:**
- Consumes: 共享类型 `COrder`、`VoucherOrder` 及平台存储读写函数。
- Produces: `seedDemoUserOrders(userId: string): boolean` 和演示标记常量。

- [ ] **Step 1: 写失败测试**

  增加独立用例，断言禁用键阻止播种、空用户首次生成恰好 4 条 C 订单与 2 条券订单、订单状态/子订单/地址/物流完整、退款券保留核销时间、第二次初始化不重复、供应商履约存储仍为空。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `pnpm vitest run apps/user/src/stores/user.test.ts`

  Expected: 新增的精确数量、状态或履约隔离断言至少一项失败。

- [ ] **Step 3: 实现最小播种模块**

  以纯构造函数生成当前用户数据；先合并写入 C 订单，再写券订单，全部成功后写用户标记。Store 只在已登录、正常场景、当前用户订单为空时调用，并刷新当前用户订单。

- [ ] **Step 4: 运行测试确认 GREEN**

  Run: `pnpm vitest run apps/user/src/stores/user.test.ts`

  Expected: 所有用户 Store 测试通过。

### Task 2: 有效直播和购买流程

**Files:**
- Modify: `apps/user/src/services/repository.ts`
- Modify: `apps/user/src/stores/user.ts`
- Modify: `apps/user/src/pages/index/index.vue`
- Test: `apps/user/src/stores/user.test.ts`
- Test: `tests/e2e/user.spec.ts`

**Interfaces:**
- Consumes: `readLivePackageProjection()`、`readLiveRoomProjection()`、`buyLivePackage(productId, skuId, quantity)`。
- Produces: 仅包含状态有效且有可售 SKU 套餐的 `liveFarms`，以及统一的 `openLive()` 直播间入口。

- [ ] **Step 1: 写失败测试**

  Store 测试断言下架、退役或零库存套餐不会出现在 `liveFarms`；E2E 断言直播卡片可见、直播间可打开、点击购买后券订单和待结算佣金写入。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `pnpm vitest run apps/user/src/stores/user.test.ts`

  Expected: 无库存套餐仍被投影时测试失败。

- [ ] **Step 3: 实现最小直播过滤与页面行为**

  `liveFarms` 过滤无可售 SKU 的套餐；首页只选择 `status === 'live'` 且 `liveFarms` 非空的直播。卡片和“我的”入口调用同一个 `openLive()`；购买选择首个库存大于 0 的 SKU 并展示结果。

- [ ] **Step 4: 运行 Store 与用户 E2E**

  Run: `pnpm vitest run apps/user/src/stores/user.test.ts`

  Run: `pnpm test:e2e:user`

  Expected: 直播过滤、购买与现有用户流程均通过。

### Task 3: 375px H5 与小程序布局

**Files:**
- Modify: `apps/user/src/styles/global.scss`
- Modify: `apps/user/src/pages/index/index.vue`
- Test: `tests/e2e/user.spec.ts`

**Interfaces:**
- Consumes: uni-app 的 H5/MP-WEIXIN 条件编译和 `--status-bar-height`。
- Produces: H5 375px 固定画框及同宽固定层；小程序全屏布局。

- [ ] **Step 1: 写失败 E2E 断言**

  在 1280px 视口断言 `.app-shell` 宽 375px 且居中，`.bottom-tabs`、`.cart-bar`、`.sheet-mask` 不越界；在 375px 视口断言页面宽度正常且无横向溢出。

- [ ] **Step 2: 运行测试确认 RED**

  Run: `pnpm test:e2e:user`

  Expected: 旧 720px 媒体规则导致桌面边界断言失败。

- [ ] **Step 3: 实现条件样式**

  删除 720px 媒体放大规则，将 H5 固定层统一为 375px 居中；对窄于 375px 的 H5 使用 `width: min(375px, 100vw)`；MP-WEIXIN 覆盖为全屏并添加底部安全区。

- [ ] **Step 4: 运行 E2E 确认 GREEN**

  Run: `pnpm test:e2e:user`

  Expected: 桌面和手机布局断言全部通过且无横向滚动。

### Task 4: 全量回归与预览

**Files:**
- Verify only

**Interfaces:**
- Consumes: 项目根脚本。
- Produces: 可复现的验证证据和本地预览地址。

- [ ] **Step 1: 执行静态与单元验证**

  Run: `pnpm test`

  Run: `pnpm typecheck`

- [ ] **Step 2: 执行单源构建验证**

  Run: `pnpm build:single-origin`

  Run: `pnpm check:single-origin`

- [ ] **Step 3: 执行浏览器回归**

  Run: `pnpm test:e2e`

  Run: `pnpm test:e2e:user`

- [ ] **Step 4: 启动用户端服务**

  Run: `pnpm dev:user`

  Expected: 输出可访问的本地 URL，保留服务运行供验收。
