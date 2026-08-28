# 用户佣金提现审核闭环设计

## 目标

让 C 端用户佣金提现形成可审核的端到端闭环：用户提交 pending 请求，后台审核通过或驳回，用户刷新后分别看到已提现或额度释放；整个过程不扩展 `CCommissionStatus`。

## 现状与约束

- 共享层已有 `WithdrawalRequest`、`readPlatformWithdrawals`、`writePlatformWithdrawal`、`transitionPlatformWithdrawal`。
- `WithdrawalRequestStatus` 固定为 `pending | approved | rejected`。
- C 端佣金记录 `CCommissionStatus` 固定为 `pending | available | withdrawn | reversed`，不增加 `withdrawing`。
- 联盟端已经通过提现请求的 pending 金额扣减可用余额，用户端需要采用同一口径。
- 本地演示使用 localStorage 作为跨端共享存储，审核动作必须幂等且不能重复扣款。

## 方案

### 用户端

`useUserStore.withdrawCommission(method = '微信提现')` 读取当前用户的可用佣金，并创建一条 `requesterType: 'user'` 的提现请求。请求 ID/requestKey 使用稳定唯一值；已有该用户相同 requestKey 或 pending 请求时返回重复结果。提交后佣金明细保持 `available`，可用余额计算为可用佣金总额减去该用户所有 pending 请求金额，即“在途扣除”。

用户初始化和刷新时同步自己的提现请求：

- `approved`：按请求金额选择当前用户可用佣金记录，置为 `withdrawn`；同步订单快照和持久化佣金记录。已处理请求再次同步不得产生重复变更。
- `rejected`：不改变佣金记录，pending 扣除自然消失；提现历史保留驳回状态和审核备注。
- `pending`：佣金记录仍为 `available`，历史显示处理中。

由于请求金额可能跨多笔佣金，采用按创建时间从旧到新的记录分摊，最后一笔允许按剩余金额精确处理；金额统一使用 `round2`，当可用记录总额不足以覆盖已批准请求时不执行部分扣款并记录错误，避免账实不一致。

### 后台审核

在现有 `commissions` 模块新增“提现审核”Tab。页面读取共享提现请求并展示申请人、申请类型、金额、方式、申请时间、状态、审核备注。默认按申请时间倒序，提供状态和关键字筛选。pending 行提供“通过”和“驳回”操作：两者都调用 `transitionPlatformWithdrawal`，驳回允许填写备注；成功后刷新列表并显示 toast，已审核请求不再提供操作按钮。

后台无需直接修改 C 端佣金记录，审核结果由用户端同步逻辑消费，避免两个端同时写佣金造成竞态。

## 数据流

```text
C 端 withdrawCommission
  -> writePlatformWithdrawal(pending)
  -> availableCommission = available records - pending withdrawals
后台审核
  -> transitionPlatformWithdrawal(approved|rejected)
用户端 initialize/refresh
  -> approved: available -> withdrawn
  -> rejected: 保持 available
```

## 错误与边界

- 金额小于等于 0、非有限数、无当前用户或余额不足时拒绝提交。
- 同一用户存在 pending 请求时，不能再次提交超过剩余额度的请求；requestKey 重复时返回 duplicate。
- 审核只允许 pending 到 approved/rejected，依赖共享层现有状态校验。
- localStorage 写入失败时不改变内存状态并返回失败。

## 测试验收

- shared：提现请求持久化、非法载荷、单次状态转换。
- user store：pending 扣减、重复提交、approved 扣款幂等、rejected 释放额度。
- admin：提现审核列表渲染、通过/驳回调用及备注持久化。
- Playwright：用户提交提现后，后台审核通过或驳回，用户刷新后状态与余额正确。
