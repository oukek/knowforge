---
{"id":"openai-agents-tools","moduleId":"agents","title":"OpenAI Agents SDK：工具循环、参数契约与身份隔离","prerequisites":["ai-agent-primer","ai-tools-primer"],"sources":["agents-quick","agents-sdk","agents-guard","tutorial-agents-sdk"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识OpenAI Agents SDK

OpenAI Agents SDK 的 Agent 描述角色、模型与工具，Runner 推进一次运行：请求模型、处理工具提议、收集结果，直到最终输出或其他停止条件。SDK 帮助组织循环，业务权限仍由宿主负责。

一个工单查询工具可以只接受 ticket_id，把当前租户从已认证请求注入闭包或上下文。这样模型无法靠填写 tenant_id 切换到其他租户。

## 工具 Schema 与执行上下文分工

函数工具把参数类型和描述提供给模型，使它知道怎样提出调用。Schema 校验解决形状问题，执行函数解决资源与业务问题。例如一个格式合法的工单 ID 仍可能不属于当前用户。认证上下文不能由模型文本自报。

每次 run 可能包含多轮模型和工具交互，max_turns 限制轮数但不等于总墙钟时间或费用上限。宿主还需取消、工具预算、并发控制和总截止时间，并将运行终态映射到应用任务。

工具错误要区分权限拒绝、业务不存在、暂时故障与结果未知。不要把所有异常转成普通成功字符串，让模型误以为查询结果就是“系统超时”。重要写操作独立实施幂等与审批，即使模型输出结构完全正确也不例外。

## 模型提议，宿主执行

Agent 配置模型、指令和工具，Runner 管理模型输出、工具调用与停止条件。工具名称和参数 schema 让模型知道能请求什么，但工具执行函数仍是业务边界，必须校验参数、认证主体、资源归属和预算。严格 JSON 只说明形状合法，不说明工单属于当前用户。

工具返回值应结构化、最小化，区分 not_found、not_allowed、retryable_error；对外可以合并不存在与无权限避免泄漏，对内日志保留诊断类别。不要让工具直接接受模型传入的 SQL、任意 URL 或 shell 命令，除非有专门约束与执行隔离。

## 真实 SDK 最小闭环

本地虚拟环境安装 openai-agents，配置 OPENAI_API_KEY 与 OPENAI_MODEL。代码是教学只读工具示例；真正业务需要从已认证请求构造工具闭包。本站浏览器不执行模型调用，也不要求把密钥填到页面。
```python
import asyncio, os
from agents import Agent, Runner, function_tool

def build_agent(authenticated_tenant):
    records={'a':{'ticket-7':'缓存失效'},'b':{'ticket-8':'支付回调'}}
    @function_tool
    def read_ticket(ticket_id: str) -> str:
        """Read a ticket visible to the authenticated caller."""
        return records.get(authenticated_tenant,{}).get(ticket_id,'not_found')
    return Agent(name='SupportReader',model=os.environ['OPENAI_MODEL'],
        instructions='先查询工单，只使用工具返回的事实回答。不得执行写入。',
        tools=[read_ticket])

async def main():
    agent=build_agent('a')  # 实际服务中由认证中间件注入
    result=await Runner.run(agent,'请解释 ticket-7，并说明证据来源。',max_turns=6)
    print(result.final_output)
if __name__=='__main__': asyncio.run(main())
```
这里没有把 tenant_id 暴露给模型，模型即使猜到 ticket-8 也无法跨租户读取。max_turns 限制循环轮数，但不是完整的费用或墙钟时间预算，还需约束工具次数、单工具超时和总成本。

## 一次 run 的状态演化

先发送用户问题与工具定义；模型产生工具调用；SDK 分派到函数；函数返回受控观察；模型基于观察继续或输出最终回答。工具错误不应该全部转成普通成功文本，否则模型可能把失败当业务事实。对确定的权限失败不重试，对瞬时网络失败按预算重试，对副作用不确定结果使用业务幂等和状态查询。

## 测试方式与证据

先直接单元测试 read_ticket 的授权规则，再用固定工具调用序列测试执行器，不必每条测试都请求模型。集成评估才观察模型是否选对工具、参数和停止时机；记录工具轨迹和业务不变量，而不只比较最后一句话。加入跨租户 ID、未知字段、越界参数、空结果、超时和错误恢复样例。

## 适用边界

SDK 会话不代替业务数据库，工具 guardrail 不代替工具内部的资源授权，trace 也不应无条件记录全部客户数据。多租户服务应在请求作用域创建隔离的执行上下文，避免将可变 tenant 全局变量复用给并发请求。

## 把机制放到一条完整路径中

```flow
Agents SDK 工具循环
构建 Agent｜设置任务工具与可信上下文
Runner 请求模型｜获得回答或工具提议
宿主执行工具｜校验资源并返回明确结果
继续或完成｜受轮数时间与费用预算约束
```

## 配套代码：OpenAI Agents SDK：工具循环、参数契约与身份隔离

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```python
import json
records={'a':{'ticket-7':'缓存失效'},'b':{'ticket-8':'支付回调'}}
def read(tenant,ticket): return records.get(tenant,{}).get(ticket,'not_found')
print(json.dumps([read('a','ticket-7'),read('a','ticket-8')],ensure_ascii=False))
print(json.dumps({'caller':'a','tool_args':{'ticket_id':'ticket-8'}},separators=(',',':')))
```

工具参数只包含要查询的工单，不包含可被模型自由指定的调用身份。第二次即使 ID 存在，也因租户归属不同返回 not_found；修改提示词不会改变这条宿主授权规则。

## 从示例走向实际使用

先直接测试工具函数的隔离规则，再用固定调用序列测试运行逻辑，最后用真实模型评估工具选择和停止行为。这样可以区分业务代码错误和模型决策错误。

正文示例需要本地服务端密钥且可能计费，课内运行区只演示隔离逻辑。不要把服务商 key 放到前端代码或示例输出里。
