---
{"id":"agent-harness-choice","moduleId":"agents","title":"Harness 选型：AgentScope 与 LangGraph 的抽象边界","prerequisites":["ai-agent-primer","ai-tools-primer"],"sources":["ie-agentscope-core","ie-agentscope-react","lg-overview","lg-memory","tutorial-agentscope"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Harness 选型

Harness 可以理解为围绕模型运行的执行环境，通常包含工具、上下文、状态、调度、恢复和观测。不同项目对这个词范围不同，面试或选型时先说明讨论哪些能力。它不等同于某个模型，也不是单一标准接口。

AgentScope 与 LangGraph 的区别更适合从组织任务的重心理解：前者强调 Agent、消息和协作等组合，后者以状态图和显式控制流为核心；实际能力存在重叠，不能说一个只能多 Agent、另一个只能工作流。

## 用真实故障场景比较抽象

需要大量角色交互时，消息与 Agent 抽象可能更贴合团队；需要明确分支、暂停、恢复和状态合并时，显式图有助于表达控制边界。最终仍需核对具体版本、语言和持久化实现，而不是依据名称做判断。

同一个 POC 应包含模型工具调用、一个并行分支、一次人工审批和一次进程故障。比较状态可解释性、重复副作用防护、调试成本和部署依赖。两个框架都能跑通正常路径时，异常路径往往更能揭示差异。

迁移成本来自状态格式、工具接口、历史与观测，而不只是框架 API。把业务工具和授权逻辑保持独立，可以减少锁定；但过早为所有框架做一层巨大通用抽象，也可能增加复杂度。

## 先澄清词义与拼写

这里的 AgentScope 是 AgentScope 框架，不是某个“agent 的 scope”。Harness 指围绕模型的工具执行、上下文、状态、权限、资源、恢复与观测等运行环境，不完全等同于一个 SDK。选框架前先列你需要的运行时能力，避免拿不同层次的产品硬比功能数量。

## 两种组织任务的重心

AgentScope 以 Agent、消息、模型/格式适配、工具与协作流程组织应用，可从 ReAct Agent、消息交换与多 Agent 协作入手；并非只能做自由对话，也有工作流与会话状态能力。LangGraph 以状态图、节点、边与 reducer 描述执行，适合把分支、循环、中断恢复和状态更新显式表示；并非不能多 Agent，图节点也可以封装 Agent。

| 维度 | AgentScope 的常见切入 | LangGraph 的常见切入 |
| --- | --- | --- |
| 建模视角 | Agent 与消息协作、模型和工具组合 | State、节点、边与更新合并 |
| 适合验证 | 多角色交互、可替换 Agent 组件 | 分支、状态演进、审批与恢复 |
| 必须额外确认 | 当前版本的持久化、部署、错误语义 | checkpointer、并发 reducer、外部幂等 |
两者都不能自动替业务做认证、租户隔离、密钥管理和账务，也不能因为有 checkpoint 就宣称所有副作用 exactly-once。

## 用同一任务做 POC

例如售后流程：识别问题、检索政策、查询订单、待人工确认、执行退款、生成报告。用相同模型、工具和样本分别实现，注入进程崩溃、工具成功响应丢失、审批重复提交和状态冲突。比较实现可理解性、恢复正确性、可测性、观测与团队维护成本，而非只比 hello world 行数。

## 什么时候选显式图

审批、长任务恢复、阶段验收、条件分支和并发状态冲突是核心时，图式状态更容易解释执行走到哪一步。但图节点粒度过细也会增加状态/调试成本。若业务主要是 Agent 消息协作、原型验证与组件组合，先从相应 Agent 抽象实现可能更直接。实际边界随版本变化，应核对目标版本文档与实验，不给绝对功能禁令。

## 面试中的选择结论

先给约束，再给候选和证据，最后说明迁移与锁定成本。如果项目只需要固定三步处理，普通服务代码也可能比两种框架都更合适。应能解释自己选择了哪层抽象，并指出它没有替你完成的宿主责任。

## 把机制放到一条完整路径中

```flow
Harness 选择
澄清范围｜工具状态协作恢复与部署需求
匹配抽象｜角色消息或显式图的表达方式
同题试验｜正常审批并行与故障恢复
评估维护｜调试迁移成本和团队能力
```

## 配套代码：Harness 选型：AgentScope 与 LangGraph 的抽象边界

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

使用本地 JavaScript 模型验证关键不变量；不调用真实数据库、模型或生产服务。实验简化之处与真实系统步骤见正文。

```javascript
const transitions={created:['retrieving'],retrieving:['approval'],approval:['done','cancelled'],done:[],cancelled:[]};
function transition(state,next) {
 if(!transitions[state]?.includes(next)) throw new Error('invalid transition');
 return next;
}
let state=transition('created','retrieving');
state=transition(state,'approval');
console.log(state);
console.log(transition(state,'done'));
try { transition('created','done'); } catch(e) { console.log(e.message); }
```

本段程序用于把状态、条件和数据之间的关系写清；真实实现仍需上文介绍的资源、权限与失败协议。

## 从示例走向实际使用

先列必须满足的能力，再用同题实验给出选择和放弃项。选择普通程序或较轻运行时也合理，前提是它能清楚满足当前需求。

课内状态机只演示显式转移约束，不代表任一框架的完整 API 或性能结论。

## 关联面试原题

以下为用户提供的朋友面试记录，保留原问法；公司与面试日期未提供，不作推断。链接进入独立题库中的参考答案、评分要点和后续追问。

- [不同的harness如何选择？agent scope vs langgraph的区别和应用场景，怎么做选择？](/practice/friend-agent-harness-choice-1)
