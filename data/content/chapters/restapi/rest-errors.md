---
{"id":"rest-errors","moduleId":"restapi","title":"Problem Details 与稳定错误模型","prerequisites":["rest-model","net-navigation"],"sources":["problem-details"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Problem Details 与稳定错误模型

错误模型让客户端稳定识别失败类别，并给用户提供合适操作。若所有异常都返回“系统错误”，客户端无法区分参数需要修改、登录已过期还是服务暂时不可用。若直接返回数据库堆栈，又会暴露内部信息并让契约依赖实现细节。

Problem Details 提供一种标准化 HTTP 错误表示方式，常见字段包括 type、title、status、detail 和 instance，业务还可增加约定扩展字段。

## 机器识别与人类说明分开

type 或稳定业务 code 用于程序分支，title 提供简短类别说明，detail 描述本次具体问题，instance 可关联本次错误发生实例。客户端不应通过中文提示文案做逻辑判断，因为文案会翻译或调整。HTTP 状态与正文 status 应一致。

字段错误可提供路径、规则和安全的说明，例如 items[2].count 超出范围，而不回显密码或完整敏感输入。未知内部异常映射为受控服务错误，并在服务端日志记录请求 ID 与真实堆栈。用户拿到请求 ID 后，支持人员能够关联排查。

错误契约还要表达是否可恢复，但重试建议不能绕过方法与幂等条件。流式响应已经开始后，可能无法再修改 HTTP 状态，需要应用事件协议表达中途失败，并保留任务最终状态。统一错误处理不等于所有通道都套同一个 JSON 响应。

## 把机制放到一条完整路径中

```flow
稳定错误响应
分类异常｜区分输入权限冲突与服务失败
映射契约｜选择状态和稳定机器标识
安全说明｜返回必要细节与请求关联
客户端恢复｜按类别提供具体下一步
```

## 配套代码：Problem Details 与稳定错误模型：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

problem={'type':'https://example.test/problems/invalid-input','title':'Invalid input','status':400,'detail':'limit must be positive','instance':'urn:request:demo'}
show(problem['status'])
show(problem['type'].rsplit('/',1)[-1])
```

示例给出错误表示的稳定类型和状态，但没有发送 HTTP 响应。真实服务要设置 application/problem+json，并确保实际状态为 400；instance 或 request_id 应避免暴露敏感内部路径，客户端不应解析 detail 的文字决定业务分支。

## 从示例走向实际使用

为常见错误建立示例与契约测试，检查字段稳定、敏感信息不泄露、状态正确。让前端根据类别提供重新登录、修改输入或稍后重试。

课内 problem 对象展示结构，不是完整异常中间件。真实实现应明确媒体类型、追踪关联与不同业务错误的映射。
