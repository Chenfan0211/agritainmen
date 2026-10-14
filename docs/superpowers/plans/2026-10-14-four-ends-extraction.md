# 四端工程抽取（agritainmen → agritainmen2）实施计划

> **参与执行者：** 本计划按 Task 顺序执行，每步可独立验证。复选框用于跟踪进度。

**目标：** 把 `E:\项目\agritainmen` 复制一份到 `E:\项目\agritainmen2`，只保留运营后台、供应商端、门店订货端、用户端四端代码与全部文档，并保证副本可以独立 `pnpm install / typecheck / test / build`。

**架构：** pnpm workspace 单体仓库（`apps/*` + `packages/*`）。四端只依赖 `packages/shared` 与 `packages/ui`，无跨端代码引用；跨端耦合只存在于根级脚本、Playwright 配置、契约测试与同源构建工具链中，因此裁剪工作集中在"端清单"这类数组与文件列表上。

**技术栈：** Uni-app 3 + Vue 3.4 + TypeScript 5.4 + Pinia；pnpm 11；Vitest 2（单元/契约测试）；Playwright（e2e）；Node 原生脚本（同源构建与静态服务）。

**来源文档：** `README.md`（应用清单）、`docs/功能清单实现状态-按端归组.md`（按端功能分组）

## 全局约束

- 保留端：`admin`（运营后台）、`supplier`（供应商端）、`store`（门店订货端）、`user`（用户端）。
- 移除端：`dashboard`（产业驾驶舱）、`farmhouse`（农家乐门店端）、`promoter`（推客端）。
- 保留包：`packages/shared`、`packages/ui`、`packages/tencent-map-gateway`（`scripts/serve-single-origin.mjs` 依赖）。
- 复制而非移动：原仓库 `E:\项目\agritainmen` 不做任何删除。
- 不复制生成物与本地工具态：`node_modules`、`dist`、`apps/*/dist`、`.codex-logs`、`.gstack`、`.workbuddy`、`.superpowers`、`.runtime`、`test-results`、根目录 `qa-*.png / before-*.png / target-*.png`、`agritainment-deploy-*.zip`（均已在 `.gitignore` 中）。
- 保留全部文档：`docs/`、`原型图/`、根目录 `*.docx`、`验收报告-1比1还原.md`、`AGENTS.md`、`README.md`（README 按裁剪后事实更新）。
- 术语约束：`promoter`/`farmhouse` 在 `apps/user` 与 `packages/shared` 中同时是业务概念（推客/分销商、农家乐）。裁剪只允许改"端清单/文件路径/构建入口"，禁止改动业务标识符与业务数据。
- 副本内不改动任何业务页面代码；仅裁剪工具链、测试清单与文档入口。

---

### Task 1: 创建副本骨架并复制保留内容

**文件：**
- 创建目录：`E:\项目\agritainmen2`（整树复制）

- [ ] **Step 1: 确认目标目录为空**

运行：`Get-ChildItem E:\项目\agritainmen2 -Force | Measure-Object`
预期：计数为 0（若已有内容需先与用户确认）

- [ ] **Step 2: 整树复制，排除生成物与本地工具态**

```powershell
robocopy "E:\项目\agritainmen" "E:\项目\agritainmen2" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH `
  /XD node_modules dist test-results .codex-logs .gstack .workbuddy .superpowers .runtime `
  /XF "agritainment-deploy-*.zip" "qa-*.png" "before-*.png" "target-*.png"
```

预期：退出码 0~7（robocopy 正常区间），副本含 `.git`、`apps/`、`packages/`、`docs/`、`scripts/`、`tests/`、`assets/`、`原型图/`、`types/`、根级配置。

- [ ] **Step 3: 校验副本完整性**

```powershell
Set-Location E:\项目\agritainmen2
git status --short --branch
(Get-ChildItem -Recurse -File -Force | Measure-Object).Count
```

预期：`git status` 干净，与源仓库同分支同提交（裁剪前是"全量 7 端"状态）；文件数与源仓库（排除生成物后）一致。

---

### Task 2: 删除不保留的三端

**文件：**
- 删除：`apps/dashboard/`、`apps/farmhouse/`、`apps/promoter/`

- [ ] **Step 1: 删除目录**

```powershell
Set-Location E:\项目\agritainmen2
Remove-Item -Recurse -Force -LiteralPath "apps\dashboard", "apps\farmhouse", "apps\promoter"
Get-ChildItem apps -Directory | Select-Object -ExpandProperty Name
```

预期：只剩 `admin`、`store`、`supplier`、`user`。

- [ ] **Step 2: 确认没有代码级跨端引用**

```powershell
rg -n "@agritainment/(dashboard|farmhouse|promoter)" apps packages --glob "!**/node_modules/**"
```

预期：无输出（四端只依赖 `@agritainment/shared` 与 `@agritainment/ui`）。

---

### Task 3: 裁剪根 package.json 脚本

**文件：**
- 修改：`package.json`

- [ ] **Step 1: 删除 7 个被移除端的脚本，重写聚合脚本**

删除以下字段：`dev:farmhouse`、`dev:dashboard`、`dev:promoter`、`build:farmhouse:h5`、`build:farmhouse:mp`、`build:farmhouse:h5:yunshang`、`build:farmhouse:mp:yunshang`、`build:farmhouse:tenants`、`build:dashboard`、`build:promoter`、`test:e2e:dashboard`。

将 `build` 改为：

```json
"build": "pnpm build:admin && pnpm build:store && pnpm build:supplier && pnpm build:user",
```

保留：`dev:admin`、`dev:store`、`dev:supplier`、`dev:user`、`build:admin`、`build:store`、`build:supplier`、`build:user`、`typecheck`、`test`、`test:e2e`、`test:e2e:supplier`、`test:e2e:user`、`test:e2e:integration`、`test:e2e:operational-report`、`audit:typography`、`audit:buttons`、`check:supplier-assets`、`prepare:category-images`、`sync:category-images`、`build:single-origin`、`serve:single-origin`、`dev:single-origin`、`check:single-origin`。

- [ ] **Step 2: 校验 JSON 可解析**

运行：`node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('ok')"`
预期：输出 `ok`。

---

### Task 4: 裁剪 scripts/ 工具链

**文件：**
- 删除：`scripts/build-farmhouse-tenants.mjs`、`scripts/copy-tenant.mjs`、`scripts/check-dashboard-build.mjs`
- 修改：`scripts/build-single-origin.mjs`、`scripts/serve-single-origin.mjs`、`scripts/serve-dist.mjs`、`scripts/check-single-origin-assets.mjs`、`scripts/sync-product-category-images.mjs`、`scripts/svg-icons-to-png.mjs`、`scripts/audit-buttons.mjs`

- [ ] **Step 1: 删除三端专属脚本**

```powershell
Remove-Item -Force -LiteralPath "scripts\build-farmhouse-tenants.mjs", "scripts\copy-tenant.mjs", "scripts\check-dashboard-build.mjs"
```

- [ ] **Step 2: 裁剪同源构建的端清单**

`scripts/build-single-origin.mjs` 与 `scripts/serve-single-origin.mjs` 中的端清单统一改为：

```js
const apps = [
  { app: 'admin', prefix: '/admin/' },
  { app: 'store', prefix: '/store/' },
  { app: 'user', prefix: '/user/' },
  { app: 'supplier', prefix: '/supplier/' }
]
```

`serve-single-origin.mjs` 的 `apps` 为对象映射，保留同 4 个键值，并删除 `meta` 中 `/dashboard/`、`/farmhouse/`、`/promoter/` 三项。

`scripts/serve-dist.mjs` 的 `roots` 保留 `8791`（admin）、`8795`（store）、`8797`（user）、`8798`（supplier），删除 `8792`/`8794`（farmhouse）、`8796`（promoter），并把末尾提示文案改为实际端口范围。

- [ ] **Step 3: 裁剪资源与图标脚本的端清单**

`scripts/check-single-origin-assets.mjs`：

```js
const apps = ['admin', 'store', 'user', 'supplier']
const productCategoryImageApps = ['admin', 'store', 'user', 'supplier']
```

`scripts/sync-product-category-images.mjs`：`const apps = ['admin', 'store', 'user', 'supplier']`

`scripts/svg-icons-to-png.mjs`：`const mobileApps = ['store', 'supplier', 'user']`

`scripts/audit-buttons.mjs`：从审计文件列表中删除 `apps/farmhouse/...`、`apps/promoter/...`、`apps/dashboard/...` 条目，保留四端条目。

- [ ] **Step 4: 校验脚本无残留引用**

```powershell
rg -n "farmhouse|promoter|dashboard" scripts
```

预期：仅剩与业务概念无关的合法命中（例如 `layout-dashboard` 图标名）；若出现 `apps/farmhouse`、`apps/promoter`、`apps/dashboard` 路径必须修掉。

---

### Task 5: 裁剪 Playwright 配置与 e2e 用例

**文件：**
- 删除：`playwright.dashboard.config.ts`、`tests/e2e/dashboard.spec.ts`
- 修改：`playwright.config.ts`、`tests/e2e/integration.spec.ts`、`tests/e2e/operational-report.spec.ts`

- [ ] **Step 1: 删除驾驶舱专属配置与用例**

```powershell
Remove-Item -Force -LiteralPath "playwright.dashboard.config.ts", "tests\e2e\dashboard.spec.ts"
```

- [ ] **Step 2: 更新根 e2e 配置的忽略规则**

`playwright.config.ts`：

```ts
  testIgnore: /(?:supplier|user|integration)\.spec\.ts/,
```

- [ ] **Step 3: 裁剪 integration.spec.ts 的端清单与三端专属用例**

`tests/e2e/integration.spec.ts`：

```ts
const portals = ['admin', 'store', 'user', 'supplier']
```

删除仅面向被移除端的用例：`farmhouse address book selects a non-default courier address and supplier reads its snapshot`（改用 user/store 地址簿覆盖同一契约：C 端地址写入 → supplier 读取 `supplierOrderLink.deliveryAddress`），以及 `page.goto('/promoter/')`、`page.goto('/dashboard/')` 相关断言；保留 admin/store/user/supplier 之间的全部履约链用例。

- [ ] **Step 4: 裁剪 operational-report.spec.ts**

删除 `farmhouse manager verifies a confirmed shared booking from the page` 用例；保留以 `/admin/` 为入口的运营报表用例。`playwright.operational-report.config.ts` 保留，但其 `build:single-origin` 依赖 Task 4 已裁剪后的四端产物。

- [ ] **Step 5: 校验 e2e 目录无被移除端引用**

```powershell
rg -n "dashboard|farmhouse|promoter" tests playwright*.ts
```

预期：无 `apps/`、`/farmhouse/`、`/promoter/`、`/dashboard/` 路径残留。

---

### Task 6: 裁剪契约测试（Vitest）中的端清单

**文件：**
- 修改：`tests/category-photo-assets.test.ts`、`tests/category-icons.test.ts`、`tests/tile-label-contract.test.ts`、`tests/mobile-build-contract.test.ts`、`tests/mobile-icon-contract.test.ts`、`tests/mobile-visual-contract.test.ts`、`packages/ui/src/app-media-integration.test.ts`

- [ ] **Step 1: 统一替换端清单**

- `tests/category-photo-assets.test.ts`：`const apps = ['admin', 'store', 'user', 'supplier']`
- `tests/mobile-build-contract.test.ts`：两处 `['farmhouse', 'user', 'store', 'supplier', 'promoter']` → `['user', 'store', 'supplier']`
- `tests/mobile-visual-contract.test.ts`：端清单与其中的 `farmhouse`/`promoter` 断言块删除，保留 `store`/`supplier`/`user`；背景色断言表只保留三端
- `tests/mobile-icon-contract.test.ts`：`const mobileApps = ['store', 'supplier', 'user'] as const`
- `tests/category-icons.test.ts`：删除 `farmhouse` 页面断言，仅保留 `user`、`store`
- `tests/tile-label-contract.test.ts`：删除 `apps/farmhouse/...`、`apps/promoter/...` 条目
- `packages/ui/src/app-media-integration.test.ts`：`const appNames = ['user', 'store', 'supplier', 'admin'] as const`，`miniProgramApps = new Set(['user', 'store', 'supplier'])`，并删除 `appName === 'dashboard'` 分支

- [ ] **Step 2: 运行单元与契约测试**

运行：`pnpm test`
预期：全部通过，无 "文件不存在" 类失败。

---

### Task 7: 更新 README 与迁移说明

**文件：**
- 修改：`README.md`
- 创建：`MIGRATION-NOTES.md`

- [ ] **Step 1: README 收敛为四端事实**

应用清单只保留 `apps/admin`、`apps/store`、`apps/supplier`、`apps/user` 与 `packages/shared`、`packages/ui`、`packages/tencent-map-gateway`；开发命令只保留 `pnpm dev:admin|store|supplier|user`；验证章节保留 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm check:single-origin`，并说明 `pnpm build` 覆盖四端 H5/微信小程序。

- [ ] **Step 2: 记录裁剪范围与回滚入口**

`MIGRATION-NOTES.md` 写明：来源仓库与提交、保留/移除清单、裁剪过的文件、本副本的验证结果，以及"新增/恢复一端的 4 步操作规程"（复制 `apps/<name>` → 在 `package.json`、`scripts/`、`tests/` 端清单、`playwright.config.ts` 忽略规则中登记）。

---

### Task 8: 依赖安装与完整验证（门禁）

**文件：** 无代码改动，产出验证证据。

- [ ] **Step 1: 重新生成 lockfile 并安装**

```powershell
Set-Location E:\项目\agritainmen2
pnpm install
```

预期：成功；`pnpm-lock.yaml` 中不再包含被移除三端的 importer 条目。

- [ ] **Step 2: 类型检查**

运行：`pnpm typecheck`
预期：四端 + 两个包全部通过。

- [ ] **Step 3: 单元与契约测试**

运行：`pnpm test`
预期：全部通过。

- [ ] **Step 4: 四端构建**

运行：`pnpm build`
预期：`apps/{admin,store,supplier,user}/dist/build/{h5,mp-weixin}` 均产出，无"找不到 workspace 包"报错。

- [ ] **Step 5: 同源构建与资源校验（跨端契约门禁）**

运行：`pnpm build:single-origin`，随后 `pnpm check:single-origin`
预期：输出包含四端入口的校验通过信息（`4 entries`），用户端 ↔ 供应商端 C 端履约共享契约检查通过。

- [ ] **Step 6（可选，时间允许时）: 端到端冒烟**

运行：`pnpm test:e2e:user`、`pnpm test:e2e:supplier`
预期：通过；失败时记录为遗留问题而不是改代码掩盖。

---

### Task 9: 在副本内提交裁剪结果

**文件：** 副本仓库的 git 状态

- [ ] **Step 1: 建立裁剪分支并提交**

```powershell
Set-Location E:\项目\agritainmen2
git checkout -b codex/four-ends
git add -A
git commit -m "chore: 裁剪为四端工程（运营后台/供应商端/门店订货端/用户端）"
git log --oneline -2
```

预期：新分支 `codex/four-ends` 上出现 1 个裁剪提交，`git status` 干净。

- [ ] **Step 2: 明确推送安全边界（写进报告，不执行推送）**

该副本保留了完整 `.git` 历史。若把 `codex/four-ends` 推到原仓库 `Chenfan0211/agritainmen`，会在该分支上删除其他三端；正确做法是推到**新仓库**，或仅在副本内本地使用。

---

### Task 10: 交付报告

- [ ] **Step 1: 汇总**

报告内容：副本路径与体量、保留/移除清单、改动过的文件清单、验证命令与结果（含失败项）、推送安全边界、以及"需要用户决定"的遗留项（`原型图/` 与 `docs/` 中仍有被移除端的资料文档；`apps/user` 的门店 H5 入口仍指向 farmhouse 域名配置）。
