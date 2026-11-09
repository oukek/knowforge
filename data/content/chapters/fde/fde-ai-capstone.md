---
{"id":"fde-ai-capstone","moduleId":"fde","title":"全链路案例：可审计的工单退款助手","prerequisites":["ai-application-anatomy","fde-discovery"],"sources":["fde-official","agents-guard","sql-transaction"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识全链路案例

工单退款助手适合展示 AI 与确定性业务如何配合。模型负责理解诉求、整理证据和提出操作，订单系统负责金额、权限、状态和最终提交。助手不能因为回答“已退款”就算完成，必须拿到可靠业务回执。

这个案例把读取、判断、审批、提交、恢复和审计放到同一条链中，重点是每个阶段允许改变什么。

## 提议、审批与提交的三个对象

提议记录订单、金额、依据和预期版本，审批绑定提议摘要、主体和有效期，提交使用稳定 operation_id。三者关联但不混为一个可修改对象，防止批准后更换金额或订单。

提交前再次检查订单归属、已退金额和版本。幂等记录不仅检查操作 ID，还检查请求指纹；相同 ID 不同参数应报告冲突，不能返回另一笔操作的成功回执。金额使用整数最小单位并验证安全范围。

外部支付超时可能已完成，需要按操作身份查询状态，不能直接重发一笔新退款。恢复流程保留原任务和操作 ID，账本、订单与用户展示最终一致。教学内存 Map 无法证明分布式原子性，真实方案需要数据库与支付接口的共同契约。

## 先定义业务完成，而不是对话完成

目标是帮助客服核对订单并创建正确退款，不是生成一段听起来专业的回答。输入需要认证主体、订单 ID、退款理由和用户授权范围；成功判据是指定订单发生一次且仅一次符合规则的退款，并能查询凭据。证据不足、超额或权限不足必须停止或转人工。

把模型放在适合的位置：理解意图、生成查询候选、解释证据和草稿。订单归属、实付金额、可退额度和提交由确定性业务服务决定。即使不使用任何 Agent 框架，这些边界也必须成立。

## 完整流程与数据契约

工作流可拆为 authenticate → load_order → retrieve_policy → calculate → draft → confirm → commit → reconcile。每步输出可版本化对象：订单事实版本、政策证据 ID、计算明细、待确认动作和稳定 operation_id。确认绑定具体订单、金额、币种与版本，不能只保存 approved=true。

| 阶段 | 输出 | 禁止越过的边界 |
|---|---|---|
| 检索 | 有版本和权限的证据 | 文档文字不能升级执行权限 |
| 计算 | 最小货币单位及规则 | 不让模型心算后直接提交 |
| 确认 | 明确动作及资源版本 | 改金额后复用旧确认 |
| 提交 | 幂等凭据及业务状态 | 超时后重新生成操作身份 |

审计连接 task_id、证据、确认和业务凭据，但不要把完整敏感订单复制到每条日志。

## 提交前仍需重新验证

草稿生成后订单可能被另一位客服修改或部分退款，所以提交需要比较 expectedVersion，并检查剩余可退额度。审批有效不等于事实没有变化。版本不符时重新查询、重新计算，必要时重新确认；不能让模型自行把 expectedVersion 改成最新值绕过冲突。

幂等键作用域包含租户与业务操作，保存规范化请求摘要和首次结果。同键同请求返回首次凭据，同键不同请求拒绝。真实多实例实现依赖数据库唯一约束与事务，进程 Map 只能做教学模型。

## 故障注入与恢复表

提交前断开：安全重试同一意图；事务已提交但响应丢失：先按 operation_id 查询结果；发往支付渠道后结果未知：进入 processing/reconciling，按渠道幂等规则查询，不再次付款；证据被撤回：阻止新的提交并检查受影响草稿。

将通知通过事务 Outbox 发布，通知失败不应回滚已经完成的退款，也不能重复退款来“重试通知”。接收通知同样按事件 ID 去重。跨系统原子性并不因用了事务就自动成立。

## 如何交付这一个案例

验收包含跨租户同 ID、金额为字符串、超额、旧版本、重复确认、同键异体、响应丢失、并行提交和渠道超时。对每条测试检查订单、退款记录、操作状态和通知，而非只看 HTTP 状态码或助手回答。

最后衡量客服完整处理时间、审核与返工、错误退款、人工接管和每成功任务总成本。部署先只读建议，再影子比较，再限制金额与租户的小流量提交。完整案例的价值是把前面各层契约接起来，让失败可定位、可恢复、可解释。

## 把机制放到一条完整路径中

```flow
退款助手闭环
读取证据｜身份订单政策与已退金额
形成提议｜固定金额版本和操作身份
审批复核｜确认摘要未变且当前条件满足
幂等提交｜核对支付回执并完成审计
```

## 配套代码：全链路案例：可审计的工单退款助手

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
const order = { id: "o1", tenant: "a", paid: 500, refunded: 0, version: 1 };
const operations = new Map();
function submit(tenant, action, approval) {
  if (tenant !== order.tenant || action.orderId !== order.id)
    throw Error("not visible");
  const fingerprint = JSON.stringify([
    action.orderId,
    action.amountCents,
    action.expectedVersion,
  ]);
  const key = JSON.stringify([tenant, action.operationId]);
  const prior = operations.get(key);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw Error("idempotency conflict");
    return { ...prior.receipt };
  }
  if (
    !approval.approved ||
    approval.tenant !== tenant ||
    approval.fingerprint !== fingerprint
  )
    throw Error("approval mismatch");
  if (action.expectedVersion !== order.version) throw Error("version conflict");
  if (
    !Number.isSafeInteger(action.amountCents) ||
    action.amountCents <= 0 ||
    action.amountCents > order.paid - order.refunded
  )
    throw Error("invalid amount");
  order.refunded += action.amountCents;
  order.version++;
  const receipt = {
    refundId: "r" + (operations.size + 1),
    amount: action.amountCents,
  };
  operations.set(key, { fingerprint, receipt });
  return { ...receipt };
}
const action = {
  operationId: "op1",
  orderId: "o1",
  amountCents: 200,
  expectedVersion: 1,
};
const approval = {
  approved: true,
  tenant: "a",
  fingerprint: JSON.stringify(["o1", 200, 1]),
};
console.log([
  submit("a", action, approval).amount,
  submit("a", action, approval).amount,
]);
console.log({ refunded: order.refunded, operations: operations.size });
try {
  submit("a", { ...action, operationId: "op2", amountCents: 100 }, approval);
} catch (e) {
  console.log(e.message);
}
```

Map 只演示单进程幂等，不具备数据库事务保证。相同意图复用首次凭据，改变金额不能复用旧确认；生产还要实现审批时效、原子消费和渠道查账。

## 从示例走向实际使用

验收覆盖越权、超额、重复点击、审批参数变化、订单版本变化和成功后断线。每个场景检查实际业务效果次数、回执和额度状态，而不是只看界面提示。

用这个案例介绍项目时明确哪些已经实现、哪些只是方案或离线实验，不把模拟工具结果当真实支付验证。
