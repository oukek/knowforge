---
{"id":"langgraph-state","moduleId":"agents","title":"LangGraph 状态与 Reducer：并行更新如何合并","prerequisites":["ai-agent-primer","ai-tools-primer"],"sources":["lg-graph","tutorial-langgraph-state"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识LangGraph 状态与 Reducer

LangGraph 用状态图表达计算过程：状态保存当前数据，节点读取状态并返回更新，边决定接下来运行谁。图并不要求每个节点都是模型调用，校验、检索和普通函数同样可以成为节点。

当两个分支并行查资料时，它们可能同时更新 evidence 字段。怎样把更新组合成一个状态，需要显式的 reducer；这也是图与普通顺序赋值的重要区别。

## 部分更新与合并规则的代数性质

节点只返回自己修改的字段，避免把读取时的旧完整状态覆盖回去。默认覆盖适合单一写入者；多个并发写入者需要字段对应的合并规则，否则可能冲突。返回列表追加并不是任何情况下都正确。

结合律表示不同分组方式不改变结果，交换律表示更新顺序不影响结果，幂等性表示同一更新重复一次不改变结果。列表拼接通常结合但不交换也不幂等；按稳定 ID 合并可以去重，但同 ID 的冲突值仍需业务规则。

状态应保存下一步所需事实与版本化引用，不把所有原始文件无界堆入。大状态增加持久化和上下文成本，也使恢复难以检查。图结构清晰后，分别测试节点函数和图级分支合并。

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

## 把机制放到一条完整路径中

```flow
状态图执行
读取当前状态｜节点获得约定字段
计算局部更新｜只返回自己负责的变化
按字段合并｜Reducer 处理并行与重复
沿边推进｜基于新状态选择后续节点
```

## 配套代码：LangGraph 状态与 Reducer：并行更新如何合并

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```python
import json
old=[{'id':'a','text':'A'}]
update=[{'id':'b','text':'B'}]
def merge(left,right):
    by_id={item['id']:item for item in left}
    by_id.update({item['id']:item for item in right})
    return [by_id[key] for key in sorted(by_id)]
print(json.dumps([len(old+update+update),len(merge(merge(old,update),update))]))
print(json.dumps(merge(old,update),separators=(',',':')))
```

第一行对比 list 追加与按证据 ID 合并的重放结果。这个 reducer 选择右侧同 ID 版本，只有版本先后已定义时才合理；生产中还要用版本号解决乱序覆盖，而不是直接照搬 update。

## 从示例走向实际使用

正文真实图示例不调用模型，可以本地安装 LangGraph 后观察两条分支汇合。修改 reducer、添加重复证据和随机延迟，检查结果是否符合设计。

课内按 ID 合并示例解决重复，但相同 ID 内容不同默认后写覆盖；重要事实需要进一步采用冲突拒绝或明确版本优先规则。
