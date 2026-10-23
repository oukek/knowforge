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
