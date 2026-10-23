## StateGraph 的状态模型
节点读取当前状态并返回更新，边决定下一步，compile 建立可执行图。状态 schema 是字段协议，reducer 决定同一字段多次更新如何组合。默认覆盖与消息追加不是一回事；把所有节点都返回完整状态，会把自己没修改的旧值也重新覆盖给其他分支。

并行图不能把执行完成先后当作确定业务顺序。若两个分支同时追加证据，append reducer 可能保留两者，但证据去重、稳定排序和版本优先仍是应用规则。reducer 的结合律影响批处理分组，交换律影响顺序变化，幂等性影响重复更新；不能因为用了 operator.add 就认为三者都成立。
## 本地可运行的真实图
安装 langgraph 后运行，不需要模型密钥；这是确定性图，适合先验证状态与分支。
```python
from typing import Annotated, TypedDict
import operator
from langgraph.graph import StateGraph, START, END
class State(TypedDict):
    query: str
    evidence: Annotated[list[str], operator.add]

def read_a(state): return {'evidence':['doc-a']}
def read_b(state): return {'evidence':['doc-b']}
def summarize(state): return {'query':','.join(sorted(state['evidence']))}

builder = StateGraph(State)
builder.add_node('read_a', read_a)
builder.add_node('read_b', read_b)
builder.add_node('summarize', summarize)
builder.add_edge(START, 'read_a')
builder.add_edge(START, 'read_b')
builder.add_edge(['read_a','read_b'], 'summarize')
builder.add_edge('summarize', END)
graph=builder.compile()
print(graph.invoke({'query':'q','evidence':[]})['query'])
```
最终对 evidence 排序是为了演示明确输出顺序，而不是暗示图会按节点注册次序返回结果。真实证据需要 doc_id、版本、租户和来源，用领域规则合并，而不是仅依赖字符串排序。
## Reducer 的反例
旧证据为 [a]，更新为 [b]，追加得到 [a,b]；同一更新重放一次得到 [a,b,b]，因此追加不是幂等。若外部调用可能重试，应按 operation_id 或证据主键去重。去重也不能简单用正文相等，因为同文本的两个不同来源可能都要保留。
## 状态规模与错误处理
状态里保存定位信息和必要结果，不要无界堆积原始网页、音频或全部模型 token。大对象可以存外部对象存储，图状态保留版本化引用。节点错误的重试策略应与工具幂等一致；一个节点能重试，不代表它调用的第三方业务也能安全重试。
## 迁移训练
把 read_b 改成延迟任务或抛错，观察汇合节点何时执行；再取消 reducer，分析两个分支更新同一键是否冲突。增加重复证据，用有 ID 的集合型 reducer 替代 list add，并验证重放、乱序和不同分组下的结果一致性。
