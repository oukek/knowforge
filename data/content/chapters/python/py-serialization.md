---
{"id":"py-serialization","title":"Python 序列化：JSON、数据契约与不可信输入","moduleId":"python","prerequisites":["py-typing","py-unicode"],"sources":["py-types","py-functions"]}
---
## 序列化是为数据选择可交换的表示
内存对象不能直接通过网络传给另一个进程，需要编码成约定格式。JSON表达有限的值类型，不包含任意Python类、函数和资源。字典转JSON再转回来不等于完整复制原对象图，元组、日期、Decimal和非字符串键等可能改变或无法表示。

反序列化也不是验证。json.loads能解析只说明语法满足JSON，并不证明字段齐全、类型正确、金额合法或用户有权限访问引用ID。
## 序列化保留的是协议允许表达的数据

序列化把内存中的对象转成可保存或传输的表示，反序列化按协议恢复数据。JSON支持对象、数组、字符串、数值、布尔和null，但不直接表达Python元组、集合、日期、Decimal或任意类实例。JSON对象键是字符串，因此整数键经过往返可能变成字符串；元组通常变成数组，读回来是列表，不能假设所有Python类型都原样保留。

接口应先设计字段含义与单位，例如金额使用整数分，时间使用约定时区和格式，ID即使看起来像数字也可能应以字符串传递。JSON文本里的true与Python的True写法不同，解析器负责映射，不需要手动replace字符串。

```python
import json
from decimal import Decimal

order = {"id": "0012", "amount_minor": 990, "currency": "CNY"}
text = json.dumps(order, ensure_ascii=False)
restored = json.loads(text)
print(restored["id"], restored["amount_minor"])
price = json.loads('{"price": 0.1}', parse_float=Decimal)
print(price["price"] + Decimal("0.2"))
```

## 解析成功与数据有效是不同的步骤

json.loads接受的内容可能是一个列表、字符串甚至null，不一定是业务期待的字典。拿到结果后继续验证结构、必填字段、字段类型、长度、取值范围与额外字段处理方式。发送方传来合法JSON的负余额，仍是非法业务数据；用JSON解析也不会自动完成用户权限验证。

序列化格式还需要大小与深度限制，避免一个合法但巨大的输入耗尽内存。pickle可以重建更复杂的Python对象，但加载不可信内容会带来执行风险，不适合作公开接口或用户上传格式。缓存和持久文件同样可能被外部影响，不能因为不是HTTP参数就自动认为可信。

## 写出明确的输入检查
```python
import json
raw = '{"title":"Python","minutes":30}'
value = json.loads(raw)
if not isinstance(value, dict):
    raise ValueError("必须是对象")
if not isinstance(value.get("title"), str):
    raise ValueError("title 必须是字符串")
minutes = value.get("minutes")
if type(minutes) is not int or not 1 <= minutes <= 240:
    raise ValueError("minutes 必须是 1 到 240 的整数")
print(json.dumps(value, ensure_ascii=False, sort_keys=True))
```
这里使用type(...) is int是为了不把bool当业务整数接受，因为Python中bool是int的子类。真实项目可用schema工具集中验证，仍需明确未知字段、缺失字段和兼容规则。
## 格式与版本需要长期维护
日期选ISO格式并说明时区，金额选最小单位整数或十进制字符串，大整数要考虑JavaScript安全整数范围。版本升级时区分新增可选字段与破坏性变化，不要让客户端根据偶然字段猜版本。
```flow
数据跨边界
内部对象｜业务类型与不变量
编码契约｜字段、单位、格式、版本
字节传输或存储｜大小与完整性限制
解析和验证｜语法、结构、范围、权限
恢复内部对象｜只接受约定的数据
```
## 不能反序列化任意对象
pickle等格式可以在加载过程中触发代码执行，不能用于不可信来源。即使JSON没有这种任意对象机制，超大内容、深度嵌套和重复键等也需要限制或明确策略。导入备份前验证版本、账号范围和数据规模，不能直接把所有字段写数据库。

测试往返、缺失字段、错误类型、超大输入与旧版本兼容。序列化测试不仅比较一个字符串，还要确认业务语义和安全边界没有在转换中改变。
