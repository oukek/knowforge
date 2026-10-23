## 审批的对象必须明确
审批应针对一个已生成、可审阅的操作：目标资源、规范化参数、风险等级、业务版本、过期时间和操作 ID。只保存 approved=true 会让之后被修改的参数沿用旧批准，形成检查与使用之间的竞态。模型生成批准文本也不能作为审批事实，审批来自认证用户或明确授权的策略。

Guardrail 验证输入/输出是否满足规则；审批决定特定副作用是否允许执行。二者可以串联，但即使模型输出完全符合 schema，工具也要检查资源权限、幂等键和审批状态。
## LangGraph 的中断与恢复
```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver
class State(TypedDict):
    proposal: dict
    status: str

def review(state):
    accepted=interrupt({'proposal':state['proposal']})
    return {'status':'approved' if accepted is True else 'rejected'}
builder=StateGraph(State)
builder.add_node('review',review)
builder.add_edge(START,'review'); builder.add_edge('review',END)
graph=builder.compile(checkpointer=InMemorySaver())
config={'configurable':{'thread_id':'review-demo'}}
print(graph.invoke({'proposal':{'ticket':7},'status':'pending'},config))
print(graph.invoke(Command(resume=False),config)['status'])
```
恢复时节点可能从头重新执行，因此 interrupt 之前的代码必须可重放，不能在前面先付款再等待批准。审批 API 应先验证用户权限，再恢复相同任务；不同用户发来的任意 resume=True 不能直接放行。
## OpenAI Agents SDK 的责任分配
SDK 可返回待审批的 interruptions 与可恢复 state，宿主展示待执行内容、接收确认后恢复该 run。应用必须保存状态并绑定会话、用户和具体请求。应按当前语言 SDK 的恢复 API 操作，不要将 LangGraph 的 Command 对象传给 OpenAI Runner；它们的序列化与生命周期并不通用。
## 一次审批一次效果
签发操作摘要，将 approved 参数摘要与执行时摘要比较，校验资源版本与有效期；事务内消费一次性审批凭证并记录 operation_id。若外部调用超时但可能已成功，先查询业务状态再决定重试。对拒绝、撤销、过期、权限变化和参数变化分别返回明确状态。
## 迁移实验
先审批金额 100，再把待执行金额改为 1000，验证旧审批被拒绝。审批后撤销当前用户权限，执行时应重新校验。重复点击“确认”两次，业务效果只能发生一次。最后模拟审批页面刷新，确保看到的是服务端持久状态而不是 localStorage 中的布尔值。
