## 宿主、模型客户端与 Agent
模型客户端负责模型协议和凭据，Agent 将指令、工具与执行行为组合起来，Session 表示一次业务会话的状态。把 Azure 凭据或模型部署名放进每条用户消息，不但混淆职责，也可能泄露敏感配置。凭据从服务端环境或部署身份注入，选择明确的生产身份策略；开发机的交互登录不代表生产机器自动可用。

Microsoft Agent Framework 与 OpenAI Agents SDK 是不同项目，包名、会话对象和工作流 API 不能互相照搬。资料按 2026-10-23 的官方文档核对；各语言支持范围并不完全相同，特别是实验性的 functional workflow 不能默认当作所有语言的稳定接口。
## 一个真实 Python 接入骨架
在本地虚拟环境安装 agent-framework-foundry 和 azure-identity，完成对应部署的认证。此代码会调用实际模型并可能计费，本站浏览器实验不会执行它。
```python
import asyncio, os
from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from azure.identity import AzureCliCredential

async def main():
    client = FoundryChatClient(
        project_endpoint=os.environ['FOUNDRY_PROJECT_ENDPOINT'],
        model=os.environ['FOUNDRY_MODEL'],
        credential=AzureCliCredential(),
    )
    agent = Agent(client=client, name='TicketClassifier',
        instructions='只基于工单文本建议类别，不执行任何业务写入。')
    result = await agent.run('登录后反复跳回登录页，请建议排查方向。')
    print(result)

if __name__ == '__main__': asyncio.run(main())
```
Agent Framework 不自动读取任意 .env 文件；在 shell 配置环境变量或显式加载。锁定经过验证的 SDK 版本，把认证失败、模型不可用和响应解析失败分开记录。
## 为什么复杂流程用 Workflow
固定的“读取→分类→审批→写入”可用显式执行路径表达，节点之间传递类型化消息，运行事件用于观察进度；扇出/汇合需要定义何时算完成，以及一个分支失败时其他分支如何处理。Checkpoint 记录的边界依 API 和执行模型不同，不能仅因函数被 @step 装饰就假定外部付款只执行一次。

中间件适合日志、指标、统一约束和拦截，不应隐藏核心业务提交顺序。上下文提供器负责组织记忆材料，不代表材料已经通过资源权限检查。需要在检索前就按认证主体过滤数据，而不是检索完才让模型决定能否查看。
## 从单 Agent 到生产服务
先用只读工具跑通并保留 trace，然后添加会话持久化，最后添加带审批的副作用节点。固定 session 与租户的映射，并对同一会话的并发写入作版本控制或串行处理。发布新 workflow 时用版本字段区分旧 checkpoint；恢复旧任务不能盲目套用已改变的节点结构。
## 验收和排错
测试缺少凭据、无权限部署、工具参数错误、节点超时、重启恢复和并发会话。用业务事件而不只是最后一句回答做断言。若 workflow 的事件在前端显示成功而业务写入失败，应检查“文本完成”和“事务完成”是否被错误合并为一个状态。
