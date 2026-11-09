---
{"id":"agent-human-review","moduleId":"agents","title":"人工审批：中断、恢复、操作绑定与 TOCTOU","prerequisites":["langgraph-recovery"],"sources":["lg-interrupt","agents-guard","tutorial-langgraph-interrupt"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识人工审批

人工审批让用户对一个具体、可审阅的操作作决定。批准“退款”三个字不够，必须知道哪笔订单、多少金额、基于哪个状态版本以及批准何时失效。否则程序可能在获得批准后改变参数。

审批也不同于输入过滤。Guardrail 判断内容是否符合规则，审批确认某项动作是否被允许；最终执行还要检查权限和当前业务条件。

## 中断、绑定与使用前复核

准备操作时规范化参数并生成摘要，连同资源、版本、操作 ID 和有效期展示。审批记录绑定这个摘要，而不是一个可被任意复用的 approved 布尔值。用户修改参数后应重新形成待审操作。

执行暂停需要保存恢复状态，前端刷新后从服务端读取。LangGraph 的 interrupt 恢复会重新进入相关节点，前面的代码应可重放；其他 SDK 使用自己的运行状态对象，不能互换恢复 API。

审批通过与执行之间可能发生余额或权限变化，这叫检查与使用之间的竞态。提交时重新核验版本和授权，并以事务或可靠幂等协议消费审批与记录效果。重复点击不能产生第二次副作用。

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

## 把机制放到一条完整路径中

```flow
审批操作
准备提议｜固定资源参数版本与有效期
展示等待｜持久保存并接收认证用户决定
执行前复核｜确认提议未变且权限仍有效
一次提交｜消费审批并保存幂等回执
```

## 配套代码：人工审批：中断、恢复、操作绑定与 TOCTOU

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```python
import json
approval={'operation':'op-1','amount':100,'version':3,'used':False}
def allowed(request):
    return not approval['used'] and all(request[k]==approval[k] for k in ['operation','amount','version'])
print(json.dumps([allowed({'operation':'op-1','amount':100,'version':3}),allowed({'operation':'op-1','amount':1000,'version':3})]))
approval['used']=True
print(json.dumps(allowed({'operation':'op-1','amount':100,'version':3})))
```

第二个请求只改金额也必须拒绝；消费审批后，相同请求再次执行应走幂等结果查询而不是再次产生副作用。生产中比较的是规范化参数摘要，并在数据库事务中消费审批。

## 从示例走向实际使用

用金额篡改、审批过期、权限撤销、重复确认和服务重启测试整条路径。用户拒绝后任务应有明确终态，不继续让模型换个工具绕过。

课内绑定金额与版本的比较是核心思想；真实审批还需认证、持久化、时效和原子消费。
