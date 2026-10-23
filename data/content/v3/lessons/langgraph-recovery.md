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
