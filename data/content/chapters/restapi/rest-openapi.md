---
{"id":"rest-openapi","moduleId":"restapi","title":"OpenAPI、JSON Schema 与契约测试","prerequisites":["rest-model","net-navigation"],"sources":["openapi","json-schema"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识OpenAPI、JSON Schema 与契约测试

OpenAPI 用机器可读文档描述 HTTP API 的路径、方法、参数、请求体、响应与安全方案。JSON Schema 描述数据结构和约束。它们能支持文档、客户端生成和契约检查，但文档存在不代表服务实现已经遵守。

例如文档声明 id 是字符串，服务却返回数字，前端生成类型再准确也无法修复运行时违约。契约需要与真实响应持续核对。

## 结构描述与行为语义的边界

Schema 可以描述必填、类型、长度、枚举与组合条件，但资源归属、余额扣减和状态迁移通常还需要业务逻辑。示例帮助人理解，不能代替约束；只有一个成功响应示例，也不能说明所有错误与边界。

OpenAPI 不同版本对 Schema 的支持和工具兼容性不同，项目应锁定使用版本并检查生成器、验证器和文档工具。不要因为规范有新版本，就假设所有现有工具立刻完整支持。契约源可以从代码生成或独立维护，关键是有明确唯一来源与漂移检查。

生成客户端减少重复手写，但仍需处理网络失败、取消、重试与错误类型。契约测试应对真实接口发送代表性输入并验证状态、头和正文，也检查禁止字段没有泄露。只验证文档本身语法正确，覆盖不了实现偏差。

## 把机制放到一条完整路径中

```flow
接口契约闭环
描述协议｜路径方法参数响应与认证
约束数据｜使用明确版本的 Schema
生成工具｜文档客户端与测试辅助
核对实现｜真实请求验证并阻止契约漂移
```

## 配套代码：OpenAPI、JSON Schema 与契约测试：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

schema={'type':'object','required':['id'],'properties':{'id':{'type':'string'}}}
show(schema['required'])
show(schema['properties']['id']['type'])
```

展示 schema 的必填和属性类型，不包含完整 JSON Schema 验证器。真实运行应使用符合所选 draft 的库，处理 additionalProperties、组合、格式和业务范围，并对响应与请求分别验证。

## 从示例走向实际使用

从一个真实接口补全正常、校验失败、未登录和冲突响应，生成文档后用实际请求验证。变更时检查是否破坏已有消费者，而不是只看 JSON 文件能否解析。

课内 schema 字典说明 required 与 properties 的区别，真实校验需要相应验证器，不能靠手工检查几个键冒充完整 JSON Schema 实现。
