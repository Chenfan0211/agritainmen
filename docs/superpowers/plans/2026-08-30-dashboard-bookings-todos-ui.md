# Dashboard, Bookings, Todos and Core UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让后台看板按真实时段和订单明细统计，提供受 RBAC、事务和审计保护的预约管理，并从共享数据生成可跳转的异常待办，同时闭合核心响应式布局。

**Architecture:** 共享包提供唯一的有效订单明细分摊与看板聚合口径；Admin Store 读取共享预约和异常集合，负责预约状态事务与统一待办查询；现有 Vue 单页仅负责筛选、路由状态和呈现。所有行为先在现有三份测试文件中建立失败断言，再补最小实现。

**Tech Stack:** TypeScript, Vue 3, Pinia, Vitest, ECharts, Playwright, SCSS

**Spec:** `.superpowers/task-5-dashboard-bookings-todos-ui-brief.md`

## Global Constraints

- 仅修改 Task5 简报列出的 Shared、Admin Store、Admin 页面、Admin 样式及必要 E2E。
- 保留工作区所有既有改动；不建立隔离工作树、不提交、不格式化无关文件。
- 有效订单固定为 `pending`、`shipping`、`delivered`，日期边界按本地日历包含。
- 预约状态固定为 `submitted -> confirmed -> completed/cancelled`，全部动作经过 Store 权限、事务和审计。
- 每个生产行为先运行对应失败测试，再写最小实现并复跑。

---

### Task 1: Shared dashboard aggregation

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: `Order`, `OrderItem`, `Product`, `OperationalReportFilter`
- Produces: `DashboardMetricsFilter`, extended `derivePlatformMetrics(input)` and one shared line-allocation helper used by operational reports and dashboard metrics

- [ ] **Step 1: Write failing dashboard tests**

  Add literal fixtures covering Monday/today and month-start/today inclusive boundaries, exclusion of cancelled/after-sale orders, order-line units, proportional GMV, missing product as `未分类`, and no fabricated hot product for legacy orders without items.

- [ ] **Step 2: Verify RED**

  Run `pnpm vitest run packages/shared/src/index.test.ts -t "derivePlatformMetrics"`; expect failures showing the current all-time/static-product behavior.

- [ ] **Step 3: Implement the shared allocation and filter**

  Filter de-duplicated orders by valid status and local date, allocate each order's actual amount across valid lines using line subtotal proportions, and make operational category/supplier rows and dashboard product/category aggregates consume that allocation.

- [ ] **Step 4: Verify GREEN**

  Run the focused test and `pnpm vitest run packages/shared/src/index.test.ts packages/shared/src/operational-report.test.ts`.

### Task 2: Booking RBAC and transactional store

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/admin/src/stores/admin.ts`
- Test: `packages/shared/src/index.test.ts`
- Test: `apps/admin/src/stores/admin.test.ts`

**Interfaces:**
- Consumes: `SharedBooking`, `readPlatformBookings()`, `writePlatformBooking()`, `executeAdminTransaction()`
- Produces: `bookings` menu permission, `booking.confirm`, `booking.complete`, `booking.cancel`, `AdminState.bookings`, `confirmBooking()`, `completeBooking()`, `cancelBooking()`

- [ ] **Step 1: Write failing role-migration and booking transaction tests**

  Cover default role grants, persisted-role migration, refresh from shared storage, legal confirm/complete/cancel transitions, cross-store restriction, repeated/illegal action rejection, expired completion rejection, required actual amount, actor/timestamps, permission denial, audit failure rollback and successful audit.

- [ ] **Step 2: Verify RED**

  Run the named booking tests in Shared and Admin Store; expect missing menu/state/actions or incorrect transitions.

- [ ] **Step 3: Implement minimal migration and transactions**

  Migrate known system roles without overwriting custom roles, load bookings on initialize/refresh, validate the current storage snapshot immediately before mutation, persist with revision-aware transaction rollback, then patch Store state only after success.

- [ ] **Step 4: Verify GREEN**

  Run `pnpm vitest run packages/shared/src/index.test.ts apps/admin/src/stores/admin.test.ts`.

### Task 3: Unified operational todos

**Files:**
- Modify: `packages/shared/src/index.ts` only if a persisted type requires a compatible optional status field
- Modify: `apps/admin/src/stores/admin.ts`
- Test: `apps/admin/src/stores/admin.test.ts`

**Interfaces:**
- Produces: exported `AdminTodo` and Store getter/action `queryAdminTodos(): AdminTodo[]`; `pendingTodos` is the sum of returned counts

- [ ] **Step 1: Write failing todo tests**

  Seed one fixture for each required rule: supplier/product review, pending shipment, active after-sale, withdrawal, recovery, failed supplier/commission settlement, incomplete shipping metadata, missing/disabled driver, expired submitted booking, completed booking without amount and refund-failed after-sale. Assert literal first-object title, route, filters and objectIds, then mutate shared state and assert the count drops.

- [ ] **Step 2: Verify RED**

  Run `pnpm vitest run apps/admin/src/stores/admin.test.ts -t "统一待办"`; expect `queryAdminTodos` to be absent.

- [ ] **Step 3: Implement deterministic todo queries**

  Build one row per rule only when matches exist, use the first real object's display field in title, stable source timestamps, precise filters/objectIds and priority; read volatile shared collections at query time.

- [ ] **Step 4: Verify GREEN**

  Re-run the focused and full Admin Store tests.

### Task 4: Admin page integration

**Files:**
- Modify: `apps/admin/src/pages/index/index.vue`
- Test: `apps/admin/src/pages/index/index.test.ts`

**Interfaces:**
- Consumes: filtered `derivePlatformMetrics`, `store.bookings`, `store.queryAdminTodos()` and existing `selectModule()` filters
- Produces: bookings navigation/table/filter/actions, todo navigation with filters/objectIds, real week/month dashboard selection, valid-status trends and dynamic category copy

- [ ] **Step 1: Write failing page behavior tests**

  Assert `bookings` is permission filtered, date/store/status/user filters are present, action buttons call permission-guarded Store actions, todos render from model and apply navigation filters, period derives local week/month ranges, trend excludes invalid states, and category count/copy are dynamic.

- [ ] **Step 2: Verify RED**

  Run `pnpm vitest run apps/admin/src/pages/index/index.test.ts`; expect missing page wiring.

- [ ] **Step 3: Implement minimal Vue wiring**

  Add computed filters and handlers using existing controls/components, preserve current visual system, subscribe to bookings and driver collections, and route todo filters into existing module filter refs.

- [ ] **Step 4: Verify GREEN**

  Run the page test plus Admin typecheck.

### Task 5: Responsive styles and end-to-end verification

**Files:**
- Modify: `apps/admin/src/styles/global.scss`
- Modify: `apps/admin/src/pages/index/index.vue`
- Modify/Create: only the necessary Admin Playwright specs/configuration
- Create: `.superpowers/task-5-dashboard-bookings-todos-ui-report.md`

**Interfaces:**
- Produces: safe sidebar account area, safe-area toast/work actions, local table scrolling, viewport-bounded drawer and non-overlapping category chart layouts

- [ ] **Step 1: Add failing static/E2E assertions for the specified viewport contracts**

  Cover the logout `aria-label`/title, `<700px` sidebar compaction, 375px toast safe area, table-local overflow, work-page bottom inset and drawer max width.

- [ ] **Step 2: Verify RED and implement scoped styles**

  Run the page test, then add only the required selectors/media queries and chart options; no global visual redesign.

- [ ] **Step 3: Run complete acceptance**

  Run the three requested Vitest files, Admin typecheck, button audit, dashboard E2E, operational-report E2E and `git diff --check` exactly as specified in the brief.

- [ ] **Step 4: Write the report**

  Record RED/GREEN evidence, changed behavior, exact verification outputs and any residual risk in `.superpowers/task-5-dashboard-bookings-todos-ui-report.md`.
