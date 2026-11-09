---
{"id":"llm-structured","moduleId":"llmapp","title":"结构化输出、Schema 与业务验证","prerequisites":["ai-llm-primer","ai-application-anatomy"],"sources":["llm-structured","json-schema"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识结构化输出、Schema 与业务验证

结构化输出让应用接收符合约定字段的结果，例如 {item, quantity}，从而渲染界面或继续业务处理。可解析 JSON、符合 Schema 和业务正确是三道不同检查：数量 -1 可能是合法 JSON，甚至符合宽松整数 Schema，但不是合法下单数量。

模型服务提供的结构约束可以提高格式可靠性，应用仍需处理拒绝、截断、协议错误与业务授权。

## 结构约束后的验证链

先定义最小输出 Schema，包括必填字段、类型、枚举和是否允许额外属性。使用服务实际支持的 Schema 子集，不能把任意验证器能力都假定可传给模型。JSON mode 与严格 Schema 输出的保证不同，接入时必须区分。

收到响应后先检查完成状态与拒绝类型，再解析并校验结构，然后验证业务范围、资源归属与当前状态。比如 quantity 是正整数仍需检查库存，item 字符串合法仍需确认该用户能购买对应商品。模型不能通过输出一个合法字段获得权限。

流式 JSON 的中间片段可能尚未完整，不应边解析到某字段就执行副作用。自动修复格式也应有预算与审计，不能把任意输出用正则“修成”一个看似有效对象。对重要动作，完整验证后再形成可审阅操作或事务提交。

## 把机制放到一条完整路径中

```flow
结构化结果验证
检查终态｜区分完成拒绝截断与失败
校验 Schema｜验证字段类型与额外属性
校验业务｜确认范围归属和当前状态
受控使用｜验证通过后才展示或执行
```

## 配套代码：结构化输出、Schema 与业务验证：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

def validate_order(data):
    return set(data)=={'item','quantity'} and isinstance(data['item'],str) and type(data['quantity']) is int and data['quantity']>0
show(validate_order({'item':'a','quantity':2}))
show(validate_order({'item':'a','quantity':-1}))
```

代码只验证一个小型结构与数量规则，没有证明 item 对应真实商品或当前用户有权购买。真实模型的 schema 参数应以供应商文档为准；应用收到结构正确的候选后仍需查业务数据和授权。

## 从示例走向实际使用

测试额外字段、数字字符串、布尔值、负数、拒绝与长度截断。Python 中 bool 与 int 的关系容易造成宽松检查误收，因此按契约使用严格类型验证。

课内 validate_order 特意使用 type(quantity) is int，展示结构与业务范围的分层。真实系统还需权限和状态检查。
