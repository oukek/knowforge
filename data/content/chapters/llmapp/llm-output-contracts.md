---
{"id":"llm-output-contracts","moduleId":"llmapp","title":"结构化输出的完整契约：拒绝、截断与业务校验","prerequisites":["ai-llm-primer","ai-application-anatomy"],"sources":["oa-schema","agents-guard"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识结构化输出的完整契约

结构化结果进入业务前，需要先回答“这次调用是什么结果类型”。正常完成、拒绝、截断和传输失败不能都被转换成一个空对象，否则界面可能把失败当成没有数据，业务也可能错误继续。

输出契约同时规定终态、数据结构和业务含义。一个符合 Schema 的退款金额，仍然可能超过允许退款余额。

## 归一化结果到业务提交

内部用区分联合表达 completed、refused、incomplete、failed 等类型，只有 completed 才进入数据验证。适配器负责供应商字段映射，业务层不猜测某个缺失字段究竟是拒绝还是版本不兼容。

结构校验应严格处理额外字段、数字字符串、整数范围与版本。金额优先用最小货币单位，避免小数表示与四舍五入不一致。校验通过只得到可用提议，执行前仍检查资源归属、当前状态和审批绑定。

流式结果在完成前是暂态，不能见到 amount 字段就扣款。Schema 升级需要考虑旧任务与历史记录，明确字段语义和兼容策略；仅增加可选字段也可能改变下游默认行为。

## 结构正确只是第一道门

JSON 能解析只证明语法成立；Schema 可以约束类型、必填字段和枚举；业务校验还需判断订单存在、金额范围、资源归属和版本是否允许更新。这是三种不同失败。模型返回合法的 `{"refundCents":999999}`，不能因为字段是整数就执行退款。

结构化输出也有协议分支：请求失败、模型拒绝、生成不完整和成功完成。不同 SDK 的字段与事件形式不同，应按对应版本解析真实响应类型，不能假设所有响应都位于 output 数组第一项，也不能把拒绝信息强制塞进业务 Schema。

## 先设计应用自己的归一化结果

把供应商响应适配为明确联合类型，例如 completed(data)、refused(reason)、incomplete(reason)、transport_error(retryable)。然后对 completed 执行 Schema 和业务校验，输出 verified 或 invalid。界面可以展示草稿和失败原因，但提交入口只接受 verified 对象。

| 层 | 例子 | 合理处理 |
|---|---|---|
| 传输 | 超时、连接断开 | 判断是否可重试，保留请求身份 |
| 协议 | 拒绝、输出上限截断 | 单独展示，不伪造空业务对象 |
| 结构 | 金额是字符串、未知字段 | 拒绝或进行版本化迁移 |
| 业务 | 金额大于实付、资源不属于用户 | 拒绝提交，查询权威事实 |

不要用 `data || {}` 抹平所有错误，否则下游可能把零值当成真实决定。

## 流式 JSON 不能边到边执行

半个字符串、尚未闭合的数组或部分合法字段只适合预览。即使流式解析器已经产出完整 amount 字段，后续可能出现拒绝、冲突字段或连接失败。副作用应等完整响应与全部校验完成，或使用专门设计的、独立有身份和确认的工具事件。

```js
function commitDraft(result, facts) {
  if (result.kind !== 'completed') return {kind: 'blocked'};
  // 先完整校验，再建立待确认动作，最后由业务服务提交
}
```

UI 的“生成中”与数据库的“已提交”应是不同状态，刷新和重连也不能把生成草稿误恢复成完成记录。

## Schema 版本迁移要保持语义

旧版本字段 `amount` 若默认是元，新版本 `amountCents` 是分，不能简单改名。为 payload 保存 schemaVersion，通过明确转换器处理单位、默认值和枚举变化。读旧记录可迁移，写入新版本仍需重新校验业务范围。

未知版本应明确拒绝；不能让模型自行解释旧字段。测试 null、缺字段、额外字段、布尔值混入数字、NaN、非整数和超安全整数。在 JS 中金额推荐使用约定的最小货币单位及安全整数范围，跨语言与数据库也要一致。

## 验收清单如何形成自动测试

至少准备成功、拒绝、截断、空输出、非法 JSON、类型错误、范围错误、旧版本与重复响应。对流式通道在每个字节边界切断，确认不会触发写入。将适配层协议测试、Schema 测试和业务授权测试分别执行，定位失败才清楚。

面试回答应能说明保证来自哪一层，以及无法保证什么。JSON Schema 本身不保证事实正确，模型输出格式可靠也不意味着业务执行可靠；需要把这些契约连成完整状态机。

## 把机制放到一条完整路径中

```flow
完整输出契约
归一终态｜明确完成拒绝截断和故障
验证结构｜检查版本类型范围与字段集合
验证业务｜检查权限余额状态与审批
提交或拒绝｜只使用完整且合法的结果
```

## 配套代码：结构化输出的完整契约：拒绝、截断与业务校验

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
function verify(result, maxRefund) {
  if (result.kind !== "completed") return result.kind;
  const d = result.data;
  if (
    !d ||
    Object.keys(d).sort().join(",") !== "amountCents,schemaVersion" ||
    d.schemaVersion !== 1 ||
    !Number.isSafeInteger(d.amountCents) ||
    d.amountCents < 0 ||
    d.amountCents > maxRefund
  )
    return "invalid";
  return "verified";
}
const cases = [
  { kind: "refused" },
  { kind: "incomplete" },
  { kind: "completed", data: { schemaVersion: 1, amountCents: "500" } },
  { kind: "completed", data: { schemaVersion: 1, amountCents: 501 } },
  { kind: "completed", data: { schemaVersion: 1, amountCents: 500 } },
];
console.log(cases.map((x) => verify(x, 500)));
```

这些是应用自己的归一化类型。拒绝和截断不进入金额校验；字符串金额与超额金额都失败，完整且满足简化业务范围的结果才 verified。

## 从示例走向实际使用

把终态与数据边界组合成测试矩阵，例如拒绝带部分文本、截断包含半个 JSON、完成但金额超限。确保没有任何解析异常被默默当作成功。

课内 verify 将数值类型、字段集合与额度范围分别约束，展示“可解析”到“可使用”的距离；真正支付还需要事务和幂等。
