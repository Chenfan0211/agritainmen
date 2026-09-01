# 用户佣金提现审核闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 C 端用户提现申请、后台审核、用户端审核结果同步的可测试闭环。

**Architecture:** 复用共享层的 `WithdrawalRequest` 存储和状态转换；提现中的金额通过查询 pending 请求扣减，不扩展 C 端佣金状态。用户端负责消费审核结果并幂等更新佣金记录，后台只负责审核提现请求。

**Tech Stack:** TypeScript、Vue 3、Pinia、uni-app H5、Vitest、Playwright、localStorage。

**Spec:** `docs/superpowers/specs/2026-08-28-user-withdrawal-review-design.md`

## Global Constraints

- `WithdrawalRequestStatus` 固定为 `pending | approved | rejected`。
- C 端佣金记录 `CCommissionStatus` 固定为 `pending | available | withdrawn | reversed`，不增加 `withdrawing`。
- 提现请求写入 `agritainment-platform-withdrawals`，用户端可用额为可用佣金减去本用户 pending 请求金额。
- 审核只允许 pending 到 approved/rejected；重复审核必须返回空结果且不改数据。
- approved 同步按佣金创建时间从旧到新扣款，必须幂等；rejected 不改佣金记录。

---

### Task 1: 用户端提现请求与审核同步

**Files:**
- Modify: `apps/user/src/stores/user.ts`
- Modify: `apps/user/src/pages/index/index.vue`
- Test: `apps/user/src/stores/user.test.ts`

**Interfaces:**
- Consumes: `readPlatformWithdrawals`, `writePlatformWithdrawal`, `WithdrawalRequest`, `createId`, `round2` from `@agritainment/shared`.
- Produces: `withdrawCommission(method?: string)` returning `'pending' | 'duplicate' | 'invalid' | 'insufficient' | false | true`, plus internal `syncWithdrawals()` invoked by initialize/refresh.

- [ ] **Step 1: Write failing store tests**

在 `apps/user/src/stores/user.test.ts` 增加测试：设置 `localStorage` 中一笔当前用户 available 佣金，调用 `withdrawCommission('微信提现')` 后提现请求为 pending、佣金仍 available、`availableCommission` 为 0；重复调用返回 duplicate；将请求改为 approved 后调用 `syncWithdrawals()`，佣金变 withdrawn 且再次同步不重复；改为 rejected 后同步，佣金仍 available 且余额恢复。

- [ ] **Step 2: Run focused tests and verify failure**

运行 `pnpm vitest run apps/user/src/stores/user.test.ts -t "withdraw"`，预期因当前实现没有提现请求写入和同步而失败。

- [ ] **Step 3: Implement request creation and pending deduction**

在 user store 引入共享提现读写函数和 `WithdrawalRequest` 类型；将 getter `availableCommission` 改为可用佣金合计减去当前用户 pending 提现金额。`withdrawCommission` 校验用户、金额和重复请求，生成 `WD-USER-*` 请求并写入共享存储，成功后保持佣金记录 available。

- [ ] **Step 4: Implement approved/rejected synchronization**

增加按佣金 `createdAt` 正序消费 approved 请求的函数：仅处理 `requesterType === 'user'` 且 `requesterId === this.userId` 的请求；用可用记录累计覆盖请求金额后一次性持久化，记录请求已处理的幂等标记（沿用稳定 `requestKey`，不重复生成提现流水）。rejected 请求只刷新派生余额。initialize、`refreshSharedState` 和页面可见性刷新前调用同步。

- [ ] **Step 5: Update user UI status and action**

提现按钮传入默认方式并显示“已提交审核”；佣金明细状态增加 pending 提现历史，展示 `pending/approved/rejected` 和审核备注。保持已有 available/pending/withdrawn/reversed 文案兼容。

- [ ] **Step 6: Run focused tests and typecheck**

运行 `pnpm vitest run apps/user/src/stores/user.test.ts -t "withdraw"` 与 `pnpm --filter @agritainment/user typecheck`，确认通过后提交：`git add apps/user/src/stores/user.ts apps/user/src/pages/index/index.vue apps/user/src/stores/user.test.ts && git commit -m "feat: make user commission withdrawal pending"`。

### Task 2: 后台提现审核 Tab

**Files:**
- Modify: `apps/admin/src/pages/index/index.vue`
- Modify: `apps/admin/src/stores/admin.ts`（仅在需要为刷新提供 action 时）
- Test: `tests/e2e/dashboard.spec.ts` 或新增 `tests/e2e/withdrawal-review.spec.ts`

**Interfaces:**
- Consumes: `readPlatformWithdrawals`, `transitionPlatformWithdrawal`, `WithdrawalRequest` from `@agritainment/shared`.
- Produces: commissions module 的“提现审核”Tab、状态筛选、关键词筛选、通过/驳回操作和备注持久化。

- [ ] **Step 1: Add shared-state helpers and failing UI test**

在后台页面引入提现读写函数，增加响应式 `withdrawalTab`、`withdrawalStatusFilter`、`withdrawalKeyword`、`withdrawalNote` 和过滤 computed；Playwright 预置一笔 pending user 请求，进入“佣金结算 > 提现审核”，断言申请人、金额和“通过/驳回”按钮存在。

- [ ] **Step 2: Run the focused Playwright test to verify failure**

运行 `pnpm playwright test tests/e2e/withdrawal-review.spec.ts --config playwright.dashboard.config.ts`，预期当前没有 Tab/列表而失败。

- [ ] **Step 3: Render the withdrawal review table**

在现有 `commissionTab` 列表加入“提现审核”，显示申请人类型、申请人 ID、金额、方式、申请时间、状态、备注和操作列；列表按 `createdAt` 倒序，支持 pending/approved/rejected/全部筛选与关键词。

- [ ] **Step 4: Wire approve/reject actions**

pending 行的“通过”直接调用 `transitionPlatformWithdrawal(id, 'approved', 'admin')`；“驳回”打开备注输入并调用 `transitionPlatformWithdrawal(id, 'rejected', 'admin', note)`。成功后刷新 computed 数据、清空备注并显示 toast；非 pending 或转换失败显示错误 toast。

- [ ] **Step 5: Run UI test and admin typecheck**

运行 `pnpm playwright test tests/e2e/withdrawal-review.spec.ts --config playwright.dashboard.config.ts` 与 `pnpm --filter @agritainment/admin typecheck`，确认审核状态和备注落入 localStorage 后提交：`git add apps/admin/src/pages/index/index.vue apps/admin/src/stores/admin.ts tests/e2e/withdrawal-review.spec.ts && git commit -m "feat: add withdrawal review tab"`。

### Task 3: 端到端闭环回归

**Files:**
- Modify: `tests/e2e/integration.spec.ts`

**Interfaces:**
- Consumes: 用户端 `withdrawCommission` UI、后台提现审核 Tab、共享 localStorage key。
- Produces: 一条跨入口验证用户提交、后台审批、用户刷新后佣金状态的测试。

- [ ] **Step 1: Add pending-to-approved and rejection scenarios**

在 integration 测试中清理相关 localStorage，使用已有用户登录入口准备一笔 available 佣金，点击提现并断言 `agritainment-platform-withdrawals` 为 pending；切换后台入口审核通过，回到用户入口刷新并断言记录 withdrawn、余额不再可提现。重复一组请求走驳回，断言记录 available、pending 扣除释放、备注可见。

- [ ] **Step 2: Run the integration test**

运行 `$env:INTEGRATION_E2E_SKIP_BUILD='0'; pnpm test:e2e:integration`，确认 mobile/tablet/desktop/wide 四个项目无失败。

- [ ] **Step 3: Run full verification**

运行 `pnpm test`、`pnpm typecheck`、`pnpm build:single-origin`，检查 `git diff --check`，再提交测试：`git add tests/e2e/integration.spec.ts && git commit -m "test: cover withdrawal approval loop"`。

## Self-review checklist

- 所有状态转换都通过 `transitionPlatformWithdrawal`，没有后台直接修改佣金。
- approved 同步对同一 requestKey 幂等，不会重复置换或重复扣款。
- rejected/pending 的余额派生逻辑与联盟端一致。
- 单元、页面级和跨入口 E2E 均覆盖。
