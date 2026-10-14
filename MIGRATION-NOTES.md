# 四端裁剪副本说明

本仓库由平台工程复制裁剪而来，只保留四个业务端：**运营后台（admin）、供应商端（supplier）、门店订货端（store）、用户端（user）**。

## 来源

- 来源仓库：`E:\项目\agritainmen`（origin: `https://github.com/Chenfan0211/agritainmen.git`）
- 来源提交：`c6d8611`（docs: 功能清单按端归组更新用户端分销商城与门店订货口径）
- 副本分支：`codex/four-ends`（保留完整 git 历史；裁剪结果以 1 个提交呈现）
- 实施计划：[`docs/superpowers/plans/2026-10-14-four-ends-extraction.md`](docs/superpowers/plans/2026-10-14-four-ends-extraction.md)

## 保留内容

| 类别 | 内容 |
|---|---|
| 应用 | `apps/admin`、`apps/store`、`apps/supplier`、`apps/user` |
| 包 | `packages/shared`、`packages/ui`、`packages/tencent-map-gateway` |
| 文档 | `docs/`（含 design tokens、integration、tencent-map、功能清单、superpowers 计划与规格）、`原型图/`、根级 `*.md`、`*.docx` |
| 资源 | `assets/`、`artifacts/`、`types/`、`.idea/` |
| 工具链 | `scripts/`（已裁剪端清单）、`tests/`（已裁剪端清单）、Playwright 配置、`pnpm-workspace.yaml` |

## 移除内容

- 应用：`apps/dashboard`（产业驾驶舱）、`apps/farmhouse`（农家乐门店端）、`apps/promoter`（推客端）
- 三端专属脚本：`scripts/build-farmhouse-tenants.mjs`、`scripts/copy-tenant.mjs`、`scripts/check-dashboard-build.mjs`
- 驾驶舱专属配置与用例：`playwright.dashboard.config.ts`、`tests/e2e/dashboard.spec.ts`
- 未复制的生成物与本地工具态：`node_modules`、`dist`、`apps/*/dist`、`.codex-logs`、`.gstack`、`.workbuddy`、`.superpowers`、`.runtime`、`test-results`、根级 QA 截图、`agritainment-deploy-*.zip`

## 为保持工程自洽而修改的文件

端清单类（把 7 端收敛为 4 端）：

- `package.json`：删除三端 dev/build 脚本，`build` 聚合为四端
- `scripts/build-single-origin.mjs`、`scripts/serve-single-origin.mjs`、`scripts/serve-dist.mjs`、`scripts/check-single-origin-assets.mjs`、`scripts/sync-product-category-images.mjs`、`scripts/svg-icons-to-png.mjs`、`scripts/audit-buttons.mjs`
- `playwright.config.ts`（忽略规则）、`tests/category-photo-assets.test.ts`、`tests/category-icons.test.ts`、`tests/tile-label-contract.test.ts`、`tests/mobile-build-contract.test.ts`、`tests/mobile-icon-contract.test.ts`、`tests/mobile-visual-contract.test.ts`、`packages/ui/src/mobile-theme.test.ts`、`packages/ui/src/app-media-integration.test.ts`、`apps/supplier/src/pages/index/portal-refresh.test.ts`
- `tests/e2e/integration.spec.ts`：端清单收敛为四端，删除农家乐门店端地址簿用例、驾驶舱联动用例和推客直播入口辅助函数；跨端库存用例保留「门店订货端 + 用户端」两段（价格与库存断点同步下调）
- `tests/e2e/operational-report.spec.ts`：删除农家乐门店端核销用例与随之无用的登录辅助函数
- `apps/store/src/stores/store.test.ts`：删除依赖 `apps/promoter` 源码的「promoter live package candidates」用例及其 import
- `README.md`：应用清单、开发/构建命令、预览端口、演示账号、单源部署说明同步为四端事实

## 验证结果（2026-10-14）

| 门禁 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `pnpm install` | ✅ 通过；`pnpm-lock.yaml` 只剩 4 个 app importer |
| 类型检查 | `pnpm typecheck` | ✅ 7/7 有 typecheck 脚本的工作区项目通过 |
| 单元与契约测试 | `pnpm test` | ✅ 77 个文件、1140 条用例全部通过 |
| 四端构建 | `pnpm build` | ✅ 产出 `admin/h5`、`store/h5+mp-weixin`、`supplier/h5+mp-weixin`、`user/h5+mp-weixin` |
| 同源构建 | `pnpm build:single-origin` | ✅ 四端带前缀产物生成 |
| 同源资源校验 | `pnpm check:single-origin` | ✅ `passed: 4 entries, 308 referenced assets and MIME responses verified`（含用户端↔供应商端 C 端履约契约检查） |
| 端到端（可选） | `pnpm test:e2e:user` | ⚠️ 12 条失败，**与本次裁剪无关**：同一用例在原仓库以完全相同的方式失败（商品首卡价格 `¥20.00` vs 期望 `45.00`），属仓库既有 e2e 老化 |

## 已知遗留

- `apps/user/src/config/storefronts.ts` 中门店 H5 入口仍指向 `farmhouse` 门户路径（`buildPortalUrl('farmhouse', ...)`）。门店端已不在本仓库，若该入口需要继续可用，请指向外部域名或在运营后台配置中改址。
- `docs/`、`原型图/`、`验收报告-1比1还原.md`、`docs/superpowers/` 下的历史文档仍包含三端的资料与计划（按「保留全部文档」的要求原样保留）。
- `artifacts/` 中保留了三端的 QA 截图，可按需删除。

## 新增或恢复一端的操作规程

1. 复制来源仓库的 `apps/<name>` 到 `apps/`，并确认它只依赖 `@agritainment/shared`、`@agritainment/ui`。
2. 在 `package.json` 增加 `dev:<name>`、`build:<name>`，并把 `<name>` 加回 `build` 聚合脚本。
3. 在端清单处登记：`scripts/build-single-origin.mjs`、`scripts/serve-single-origin.mjs`（含首页 meta）、`scripts/serve-dist.mjs`（分配预览端口）、`scripts/check-single-origin-assets.mjs`（含 `productCategoryImageApps`）、`scripts/sync-product-category-images.mjs`、`scripts/svg-icons-to-png.mjs`（若为移动端）。
4. 在测试与配置登记：`tests/e2e/integration.spec.ts` 的 `portals`、`playwright.config.ts` 的 `testIgnore`、相关契约测试的端清单；随后跑 `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm check:single-origin`。

## 推送安全边界

副本保留了完整 `.git` 历史。**不要**把 `codex/four-ends` 推送到原仓库 `Chenfan0211/agritainmen` 的同名分支——那会在该分支上删除其他三端。请推送到新仓库，或仅在本地使用。
