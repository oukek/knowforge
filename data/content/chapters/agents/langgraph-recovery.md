---
{"id":"langgraph-recovery","moduleId":"agents","title":"LangGraph Checkpoint：线程、恢复与副作用重放","prerequisites":["langgraph-state","fullstack-idempotent-outbox"],"sources":["lg-memory","lg-interrupt","tutorial-langgraph-interrupt"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识LangGraph Checkpoint

Checkpoint 保存图在某个执行边界的状态，使任务可以继续、暂停或检查历史。它不是整个 Python 进程的镜像，不会替你保存所有连接，也不会撤销外部系统已经发生的写入。

最容易出错的窗口是工具写入成功之后、checkpoint 保存之前宕机。恢复可能再次执行节点，因此可靠恢复必须同时考虑图状态与业务幂等。

## 执行位置和业务效果的两份事实

thread_id 用来定位一条图执行线，应用还要验证它属于当前用户或租户。使用相同 ID 才能找到对应状态，但“知道 ID”不是授权。内存 checkpointer 只能在当前进程内保留数据，跨重启需要持久存储。

业务操作使用稳定 operation_id，接收方对其做唯一性与参数一致性检查。再次收到同操作时返回已有回执，而不是重复产生效果。图的 checkpoint 回答从哪继续，幂等账本回答是否已经做过，两者缺一不可。

图结构与状态 Schema 变更时，旧 checkpoint 可能不再适用。发布前检查节点名称、字段和 reducer 的兼容性，必要时迁移或保留旧版本执行器处理存量任务。回滚代码无法自动回滚已发生的外部业务效果。

## Checkpoint 不等于完整进程快照

Checkpointer 保存图运行的状态和恢复所需信息，不保存任意 Python 调用栈、所有打开的连接或外部系统已经发生的事务。thread_id 用于定位一条持久执行线；它不是身份凭证。Store 用于应用定义的长期、跨线程信息，不能与当前图的短期状态混为一谈。

同一个 thread_id 是否允许并发推进，取决于运行时和应用的协调策略。应用至少需要把线程绑定到租户/用户，并在恢复接口校验资源权限。客户端能猜到 thread_id 不能因此读取别人工作流的历史。

## 无模型依赖的最小持久化演示

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
class State(TypedDict):
    total: int

def increment(state): return {'total':state['total']+1}
builder=StateGraph(State)
builder.add_node('increment',increment)
builder.add_edge(START,'increment')
builder.add_edge('increment',END)
graph=builder.compile(checkpointer=InMemorySaver())
config={'configurable':{'thread_id':'tenant-a:demo'}}
graph.invoke({'total':1},config)
print(graph.get_state(config).values['total'])
```
InMemorySaver 只适合实验，进程退出就丢失。生产需要受支持的数据库 checkpointer 并初始化对应 schema，管理连接池、备份、版本与保留策略。不能因为示例里可 get_state 就声称它已经跨进程耐久。

## 崩溃窗口与幂等账本

节点向工单系统创建任务，成功返回后还没写入 checkpoint 就宕机，恢复时可能再次调用该节点。为业务操作分配稳定 operation_id，在接收服务建立唯一约束并返回已有结果。checkpoint 决定“从哪继续”，业务幂等账本决定“同一副作用是否已经发生”；两者不能替代。

## 版本演进

状态中记录 workflow_version 和必要的 schema_version。修改节点名称、删除状态字段或改变 reducer 之前，先验证旧 checkpoint 是否可读，必要时迁移或让旧实例继续处理存量。回滚代码也不能自动回滚已经写入新格式的状态，因此发布方案需包含双版本兼容与任务分流。

## 如何验证恢复而非重新跑

在只读节点后、写工具成功后、checkpoint 写入前后分别注入崩溃。比较原任务 ID、操作 ID 和业务写入次数，确认恢复没有生成第二笔效果。恢复测试必须真实重启进程/连接存储；在一个函数里捕获异常后再调用一次不能覆盖全部故障窗口。

## 把机制放到一条完整路径中

```flow
持久执行恢复
保存检查点｜记录图状态与执行位置
绑定业务操作｜稳定 ID 关联实际副作用
故障后加载｜验证身份与状态版本
幂等继续｜复用已有回执或执行未完成步骤
```

## 配套代码：LangGraph Checkpoint：线程、恢复与副作用重放

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```python
import copy, json
checkpoint={'step':'write','operation_id':'op-7','payload':{'title':'follow up'}}
ledger={}
def write(state):
    key=state['operation_id']
    if key not in ledger: ledger[key]={'ticket_id':len(ledger)+1}
    return ledger[key]
first=write(copy.deepcopy(checkpoint))
second=write(copy.deepcopy(checkpoint))
print(json.dumps([first,second],separators=(',',':')))
print(len(ledger))
```

重复读取相同 checkpoint 会两次请求 write，但账本只创建一次效果。移除稳定 operation_id，改成每次随机生成新值，会让恢复失去去重基础。这个字典不是耐久存储，生产需事务与唯一约束。

## 从示例走向实际使用

恢复测试要真实模拟进程退出与重新启动，并在写入前后设置故障点。核对任务 ID、操作 ID、回执与业务记录数，确认没有把“重新跑一遍”误当恢复。

课内 ledger 是单进程机制模型；生产唯一约束、事务和外部服务幂等共同保障重复请求的结果。
