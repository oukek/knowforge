---
{"id":"agent-tool-scheduler","moduleId":"agents","title":"工具执行调度：依赖图、有界并发与预算准入","prerequisites":["ai-agent-primer","ai-tools-primer"],"sources":["lg-graph","agents-handoff"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识工具执行调度

模型提出多个工具调用，不意味着应用应该同时全部执行。工具之间可能有依赖，也可能争用并发、token 或外部接口配额。调度器把计划转成受资源约束的执行顺序。

例如先查询订单才能判断退款额度，而查询政策和物流可以在身份验证后并行。依赖图表达“必须先完成什么”，并发上限表达“最多同时做多少”。

## 就绪队列、资源预留与取消传播

先验证任务 ID 唯一、依赖存在且图无环。所有前置任务完成的节点进入就绪集合，调度器按公平与优先规则选择。环会导致没有可推进节点，不能让任务永远显示运行中。

并发槽位只是一种资源，还需要检查工具配额、任务剩余时间和费用预算。获得槽位后才能启动，结束或异常时确保释放；预算预留与账务结算另行处理。生产调度可以动态填补空槽，而课内波次执行会等待整批结束。

失败传播取决于依赖语义：必要前置失败时后继不能继续，可选分支失败可形成部分结果。取消信号向正在运行的工具传递，但无法取消的外部副作用需要查询与补偿，不应直接当作未发生。

## 模型给计划，宿主决定能否执行

一轮模型可能提出多个工具调用。它们不一定相互独立，参数形状合法也不代表可以同时执行。宿主先验证工具是否注册、参数和身份是否合法、依赖是否完整、成本和时间是否允许，再安排执行。模型返回的 parallel 标记只是建议，不能绕过资源约束。

查询余额与查询政策可以并行，创建订单后支付则存在数据依赖；两次修改同一订单还可能互相冲突。计划中的依赖 ID 应指向当前任务里真实存在的调用，不能跨任务偷偷读取其他用户的结果。

## 依赖图与就绪队列

把调用看作节点，依赖为有向边。只有全部依赖成功的节点才进入 ready 队列；运行数小于并发上限时才启动。图必须检查未知依赖、自依赖和环。没有运行任务但仍有未完成节点且无人就绪，说明图无进展，应报错而不是无限等待。

| 状态 | 能做什么 | 失败后 |
|---|---|---|
| pending | 等待依赖 | 标记阻塞原因 |
| ready | 参加准入 | 预算不足则停止 |
| running | 占用槽位与资源 | 清理后释放 |
| succeeded | 提供结构化结果 | 下游可进入就绪 |

需要可选依赖或容错结果时在契约中明确，不能默默把错误转为空数组让下游误认为没有数据。

## 并发槽位不是全部约束

全局并发上限之外，还需按工具、租户和下游资源设限。搜索接口可能允许 10 个并发，支付接口只允许某订单一个写入。队列必须有容量与等待 deadline，不能把并发限制器变成无限积压器。

总预算包含排队、连接、执行、重试和结果整理。启动前预留最坏可接受成本或执行配额，多个并发调用应原子地声明预算，避免每个都看到余额足够。实际费用未知时使用保守估算并按完成账单结算，不把预估当最终账单。

## 取消与失败传播

一个必需节点失败，应阻止依赖它的节点启动，并按任务策略取消不再有价值的同组工作。AbortSignal 只能请求支持它的操作停止；已发送的写入可能已经完成，需要用 operation_id 查状态。重试仅用于可重试错误，并复用同一业务身份。

```js
if (remaining(deadline) <= estimatedMinimum) throw new Error('budget exhausted');
// 先声明槽位和预算，再启动；finally 释放运行资源
```

不能在 catch 中不断换工具直至成功，最大步数、最大重试和无进展检测必须由宿主强制执行。

## 验收应测不变量而非只看顺序

记录每个节点的启动、完成、尝试次数、预算声明和取消原因。测试峰值运行数从不超过上限、依赖未成功绝不启动、失败后不提交写入、取消后槽位被释放、同业务操作不重复。慢节点、立即失败、部分完成后断网、环与未知依赖都要覆盖。

面试时还应说明取舍：批调度容易验证但有屏障等待，连续 ready 队列利用率更高却更需仔细处理竞争；关键在资源和业务正确性，不是把所有调用塞进 Promise.all。

## 把机制放到一条完整路径中

```flow
工具调度
验证计划｜检查身份依赖与无环条件
选就绪任务｜前置完成且资源预算充足
有界执行｜限制并发并传播取消失败
更新队列｜保存结果释放槽位推进后继
```

## 配套代码：工具执行调度：依赖图、有界并发与预算准入

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
async function executePlan(jobs, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw Error("invalid limit");
  const ids = new Set(jobs.map((j) => j.id));
  if (
    ids.size !== jobs.length ||
    jobs.some((j) => j.deps.some((d) => !ids.has(d)))
  )
    throw Error("invalid dependency");
  const done = new Set(),
    waves = [];
  while (done.size < jobs.length) {
    const ready = jobs
      .filter((j) => !done.has(j.id) && j.deps.every((d) => done.has(d)))
      .slice(0, limit);
    if (!ready.length) throw Error("cyclic plan");
    waves.push(ready.map((j) => j.id));
    await Promise.all(ready.map((j) => j.run()));
    ready.forEach((j) => done.add(j.id));
  }
  return waves;
}
const run = async () => 1;
const jobs = [
  { id: "a", deps: [], run },
  { id: "b", deps: [], run },
  { id: "c", deps: ["a", "b"], run },
];
console.log(await executePlan(jobs, 2));
console.log(await executePlan(jobs, 1));
try {
  await executePlan([{ id: "a", deps: ["a"], run }], 2);
} catch (e) {
  console.log(e.message);
}
```

分批 DAG 模型保证依赖先完成和每批最多 limit 个任务；批内使用 Promise.all。失败会中断后续批，但不会自动取消已经启动的同批 Promise，真实调度器需增加取消与资源清理。

## 从示例走向实际使用

测试乱序完成、依赖缺失、环、重复 ID、失败和取消。断言最大活动数不超限、依赖满足才启动，以及所有任务最终都有明确状态。

课内 Promise.all 分批方案便于看清 DAG，真实实现需保证一个分支失败后其他仍在运行的分支被正确收尾和记账。
