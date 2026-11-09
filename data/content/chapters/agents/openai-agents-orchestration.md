---
{"id":"openai-agents-orchestration","moduleId":"agents","title":"OpenAI Agents SDK：Handoff、Agent-as-tool 与会话历史","prerequisites":["ai-agent-primer","ai-tools-primer"],"sources":["agents-handoff","agents-state","agents-sdk","tutorial-agents-handoffs"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识OpenAI Agents SDK

把任务交给另一位 Agent 有两种常见方式。Handoff 转移后续对话处理权；Agent-as-tool 把专家当成一个工具调用，专家返回后主 Agent 继续组织结果。差别在控制权与最终责任，而不只是名称。

例如客服分诊后把整段问题交给退款专家，适合考虑 handoff；主助手同时咨询数据库和网络专家后综合回答，则更像专家工具。

## 控制权、历史与四类状态

Handoff 需要明确目标专家、输入范围和允许历史。共享过多材料会增加成本和泄漏面，过少又可能丢失任务条件。接收专家仍受同一认证与工具权限边界，不会因为交接自动获得额外业务能力。

专家工具适合有清楚输入输出的子任务。主 Agent 负责检查返回结果是否完整、冲突如何解决，以及是否继续调用。专家输出是待核对结果，不是天然更高优先级的系统指令。

对话历史、可恢复运行状态、业务状态和长期记忆分别管理。历史说“已经退款”不代表支付系统确实完成，前端收到文本也不代表整个运行结束。跨轮会话使用明确隔离键，避免相同 userId 在不同租户混用。

## Handoff 与专家工具的差异

Handoff 把当前对话执行权交给另一位专家，后续由新 Agent 的指令和工具继续处理。Agent-as-tool 则是主 Agent 调用专家得到一个结果后，仍由主 Agent 组织最终回答。它们不是仅仅换一个函数名：谁负责最终响应、谁保留后续控制权、哪些历史会传入，都影响测试与权限。

退款专家不应仅因被 handoff 就自动获得所有支付权限。工具能力与认证主体仍由应用配置，handoff 输入/历史需要最小化处理，避免把不相关客户材料和内部推理片段扩散到每位专家。

## 一段可在本地接入的示例

```python
import asyncio, os
from agents import Agent, Runner, SQLiteSession

expert=Agent(name='DatabaseReviewer',model=os.environ['OPENAI_MODEL'],
    handoff_description='Analyze SQL and transaction failure reports.',
    instructions='只解释数据库故障，不执行 SQL。区分证据与猜测。')
router=Agent(name='Triage',model=os.environ['OPENAI_MODEL'],
    instructions='数据库相关问题转交给 DatabaseReviewer，其他问题直接澄清。',
    handoffs=[expert])
session=SQLiteSession('tenant-a:case-7','agent-history.db')
async def main():
    first=await Runner.run(router,'订单提交时发生死锁，应该收集哪些证据？',session=session,max_turns=6)
    print(first.final_output)
    print(first.last_agent.name)
if __name__=='__main__': asyncio.run(main())
```
安装 openai-agents 并在服务端配置密钥和模型，示例会调用模型。SQLiteSession 适合本地演示；多实例生产环境要选择匹配部署的持久实现并管理同一会话并发。不要把本站学习进度数据库与示例的 Agent 会话库混为一体。

## 四类状态不能混用

对话历史用于提供上下文，业务状态记录工单是否已经创建，运行状态用于在审批中断后恢复同一 run，长期记忆保存跨会话的用户偏好。把历史文本当作订单支付事实，会被模型措辞和截断影响。把全部历史与 previous_response_id 同时重复回放，也可能把上下文重复发送；应明确一种连续性策略，再设计有意的同步。

## 流式输出与完成判定

收到文本片段不代表整个 run 完成；之后仍可能发生工具调用、handoff 或错误。前端应区分 token_delta、tool_started、tool_completed、approval_required、run_completed 和 run_failed。先显示的草稿可以保留，但只有完成事件才把运行标为成功；断线后应查询或恢复任务，不应直接再创建一个相同副作用的新 run。

## 验证和反例

固定一组工单，断言路由专家、调用工具集合和最终责任人。测试上一轮专家不适用于下一轮新主题时是否需要重新分诊。会话隔离测试用两个租户相同 userId，防止 session_key 缺少租户维度。追踪历史长度、压缩前后证据保留及敏感字段，不把 trace 当成无期限数据仓库。

## 把机制放到一条完整路径中

```flow
Agent 间协作
确定分工｜转移控制权或请求专家结果
裁剪交接内容｜保留必要状态与证据
执行受控子任务｜权限预算和会话继续隔离
确认责任｜专家接管或主 Agent 汇总完成
```

## 配套代码：OpenAI Agents SDK：Handoff、Agent-as-tool 与会话历史

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```javascript
const sessions = new Map();
function append(tenant, user, text) {
  const key = tenant + ":" + user;
  const old = sessions.get(key) || [];
  sessions.set(key, [...old, text]);
}
append("a", "u1", "订单问题");
append("b", "u1", "工资问题");
console.log([...sessions.values()]);
console.log({
  handoff: "expert owns next step",
  tool: "manager resumes after result",
});
```

相同 userId 在不同租户仍拥有不同历史。代码中的控制权描述用于对比调用协议，并不模拟 SDK 的完整运行时；真实实现需要按返回结果和持久状态管理后续轮次。

## 从示例走向实际使用

测试路由到谁、谁拥有下一步、允许哪些工具和谁产生最终回答。切换话题时重新判断当前专家是否适用，避免上轮交接永久锁住错误角色。

课内两类控制权的字符串说明便于建立概念，正文给出真实会话示例；生产多实例需要适合部署的共享持久存储。
