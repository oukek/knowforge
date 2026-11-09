---
{"id":"ai-protocol-frameworks","moduleId":"aibasics","title":"API、MCP、Skill、SDK 与 Agent Framework：分层理解","prerequisites":["ai-concept-map","ai-llm-primer"],"sources":["mcp-version","agents-sdk","lg-overview","a2a-intro"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识API、MCP、Skill、SDK 与 Agent Framework

API、MCP、Skill、SDK 和 Agent Framework 位于不同层。API 描述服务怎样调用，SDK 提供语言级封装，MCP 协议组织工具等能力的发现与交互，Skill 提供可复用任务说明，框架组织状态与执行。它们可以组合，不是必须选一个放弃其他。

例如一个 Agent 用 SDK 调模型，通过 MCP 访问受控资料工具，并按某个 Skill 的步骤处理任务；宿主仍负责身份、资源权限与持久状态。

## 按职责区分协议与运行时

协议约定消息与能力交互，不能自动保证远端工具安全或业务授权。发现一个工具只说明知道它存在，是否允许当前用户调用、参数属于谁和结果能否外传，仍由应用与服务端验证。跨服务凭证也应限定受众与作用域。

Skill 通常把说明、示例或资源组织成按需使用的能力材料，渐进式加载减少一次塞入全部细节，但路由、版本与可信来源仍需管理。说明中要求执行某个动作，不等于用户已经授权这个动作。技能文本与宿主权限是不同层。

Agent Framework 提供循环、状态、工具集成或工作流等抽象，不同框架强调点不同。选择时用同一个任务与工具契约比较恢复、观测、并发与维护成本，不能仅按抽象名称多寡评价。框架升级还需验证已有状态与检查点兼容。

## 先问它解决哪一层问题

REST API 提供资源或业务能力的接口；Function Calling 描述模型提出结构化工具请求的往返；MCP 为应用连接工具和上下文定义互操作约定；Skill 常指可复用说明、资源与工作步骤，其具体格式依产品而异；SDK 和框架提供调用与编排代码。

这些词能组合，不是互相替代。后端订单 REST API 可以包装成工具，经 MCP 暴露，再由某个 Agent SDK 执行。业务授权仍在真实服务边界，不能因为多包了一层协议就自动获得权限。

## 对照表帮助定位

| 概念 | 重点 | 不自动提供 |
|---|---|---|
| API | 业务操作契约 | 模型何时该调用 |
| Tool Calling | 行动请求与结果关联 | 资源授权和实际执行 |
| MCP | 工具/上下文互通 | 完整业务流程与安全保证 |
| Skill | 复用任务知识和流程 | 所有产品统一格式与执行权限 |
| Framework | 状态、路由、工具循环 | 正确数据和业务验收 |

A2A 关注不同 Agent 系统之间的互操作，不等同于每个内部函数调用都必须使用它。是否需要网络协议，取决于跨边界协作需求。

## 版本和信任边界

协议会演进。MCP 的现代按请求版本与传统初始化握手模式应按选定规范和 SDK 实现，不能照旧示例假定所有服务生命周期相同。Skill 的名称也不能证明可信，外部说明可能含有不合适指令。

发现工具只代表能力可描述，认证令牌的受众、scope 和资源归属仍需校验。框架 guardrail 是一层检查，不可替代真正权限和事务约束。

## 选型和验收

小项目可以先用简单函数和显式状态，跨服务才考虑协议与注册发现，长任务再加入持久编排。用同任务、工具和评估集比较框架，记录复杂度、恢复、质量与运维，而不是按抽象名称数量评分。

面试能够把 MCP、Skill 与 REST API 的差异落实为一个完整调用链，并解释无法保证的部分，比背“某某协议是未来”更有说服力。

## 把机制放到一条完整路径中

```flow
AI 能力分层
模型接口｜提供推理输入输出契约
工具协议｜描述发现调用与结果交互
技能材料｜按任务加载说明与资源
执行框架｜组织状态权限恢复与观测
```

## 配套代码：API、MCP、Skill、SDK 与 Agent Framework：分层理解

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
const layers = {
  API: "business interface",
  FunctionCalling: "model action protocol",
  MCP: "context/tool interoperability",
  Skill: "reusable instructions/resources",
  Framework: "orchestration runtime",
  A2A: "agent interoperability",
};
console.log(["API", "MCP", "Skill", "Framework"].map((x) => layers[x]));
console.log(layers.Unknown ?? "unknown");
```

字典仅归纳常用职责，Skill 格式和协议生命周期应按具体产品与版本核对；本例不实现任何网络协议。

## 从示例走向实际使用

画出自己的系统分层，把模型接口、工具协议、执行器、技能材料与业务服务分别标注。若一个组件承担所有职责，就检查是否存在难以测试的耦合。

下面对照表用于定位概念，不代表某协议提供完整安全保证。真正落地时锁定版本，并为每个跨边界调用建立契约测试。
