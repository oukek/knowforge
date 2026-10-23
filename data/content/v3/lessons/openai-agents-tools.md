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
