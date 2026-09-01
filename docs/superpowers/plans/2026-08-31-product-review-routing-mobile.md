# 商品审核、智能配送线路与供应商移动端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Do not commit, clean, revert, or overwrite unrelated dirty-worktree changes.

**Goal:** 为共享商品目录增加 SKU 起订量和审核草稿，为供应商与司机增加门店范围和每日智能线路，并把供应商移动端收敛为四项主导航。

**Architecture:** 共享包负责模型、校验、持久化、Provider 与纯业务函数；各门户 Store 通过现有 revision/CAS 和锁定事务提交；页面只调用 Store。商品审核使用独立 submission 集合保持线上版本，线路优化只排序已指派任务。

**Tech Stack:** TypeScript、Vue 3、Pinia、UniApp、Vitest、Playwright、localStorage 演示事务。

## Global Constraints

- 起订数量按 SKU、全渠道生效，历史值默认为 1。
- 所有商品首次创建必审；供应商修改已审核资料需要复审，线上版本在审批前不变。
- AI 只优化已分配任务顺序，不自动分配司机。
- 供应商底栏固定为首页、订单、商品、我的四项。
- 保留现有未提交和未跟踪文件，不提交、不回滚、不清理。

### Task 1: 共享商品模型、起订校验与路线 Provider

- [ ] 先补共享包失败测试：MOQ 归一化/投影/校验、商品 submission 状态转换、路线优化稳定排序、缺坐标和 Provider 失败。
- [ ] 增加 CatalogSku MOQ、商品 submission/司机门店范围/每日线路模型与带 revision 的读写能力。
- [ ] 扩展 PlatformProviders.routeOptimization，提供确定性的最近邻加局部优化 mock。
- [ ] 运行共享包定向测试与 typecheck。

### Task 2: 全渠道起订数量和商品审核闭环

- [ ] 先补 User、Store、Farmhouse、Admin、Supplier Store 失败测试。
- [ ] 所有购物车和最终提交事务重新读取目录并校验 MOQ，订单明细保存 MOQ 快照。
- [ ] 供应商创建/编辑自己的商品 submission；后台审核/驳回；批准后首次写入 offline，更新时保持线上状态。
- [ ] 分离 product.audit 与 product.status，未批准商品不能上架，所有写操作审计并订阅刷新。
- [ ] 运行相关 Store 单测和各门户 typecheck。

### Task 3: 司机门店范围、每日智能线路与供应商移动端

- [ ] 先补 Supplier Store 和页面失败测试。
- [ ] 配置司机 storeIds，指派/改派时校验范围；旧司机迁移为当前供应商全部门店。
- [ ] 生成、手调和发布每日线路；变化后标 stale；司机始终看到已发布停靠点和未排任务。
- [ ] 供应商底栏改为四项，司机端改为今日线路/历史任务/我的，二级管理使用全宽工作页。
- [ ] 运行 Supplier 单测、typecheck、资源门禁和移动端截图检查。

### Task 4: 跨端 E2E 与全量验收

- [ ] 增加供应商创建商品、后台审核、上架、用户 MOQ 下单的同源 E2E。
- [ ] 增加供应商改稿审批、司机范围、智能排序、发布和司机查看 E2E。
- [ ] 验证 375/768/1280/1440 布局、pageerror、404 和横向溢出。
- [ ] 串行运行全量单测、typecheck、按钮审计、各 E2E、同源构建、资源校验和 git diff --check。
