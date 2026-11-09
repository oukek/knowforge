---
{"id":"rest-status","moduleId":"restapi","title":"状态码、Location 与异步接受","prerequisites":["rest-model","net-navigation"],"sources":["http-semantics","problem-details"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识状态码、Location 与异步接受

HTTP 状态码描述请求在协议层的处理结果，帮助客户端决定继续、修正输入、认证或重试。正文可以补充业务细节，但不宜把所有失败都包装为 200 再让每个调用方猜测。状态码与业务错误码可以各司其职。

创建资源、接受后台任务和完成无正文操作是不同事实，分别可能使用 201、202 与 204。尤其 202 只说明接受处理，不说明任务最终成功。

## 状态与响应信息共同构成契约

201 通常用于成功创建资源，并可通过 Location 指向新资源。202 应提供查询任务状态的方式，客户端不能收到它就显示最终完成。204 表示成功但没有响应正文，不应再让客户端尝试解析 JSON。普通成功读取通常返回 200 与表示。

4xx 表达请求相关问题，例如格式错误、认证不足、权限拒绝、资源不存在或状态冲突；5xx 表达服务端处理失败。401 与 403 不应只按字面中文混用，认证挑战与已识别但无权限是不同情况。为了避免泄露资源存在性，服务也可能对无权访问对象统一使用 404，但要保持契约一致。

重试策略不能只按“非 200 就重试”。参数错误需要修改，限流可能等待 Retry-After，暂时服务失败则受预算约束。错误响应仍应有稳定结构和请求 ID，方便用户反馈与服务端定位。

## 把机制放到一条完整路径中

```flow
响应结果表达
识别事实｜创建接受完成或失败
选择状态｜使用符合语义的 HTTP 状态
补充信息｜提供 Location错误结构或任务链接
客户端处理｜按契约展示恢复与重试路径
```

## 配套代码：状态码、Location 与异步接受：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

def status(created=False,accepted=False,has_body=True):
    if accepted: return 202
    if created: return 201
    return 200 if has_body else 204
show([status(created=True),status(accepted=True),status(has_body=False)])
```

函数演示状态语义的几个分支，不是所有 API 的统一状态机。真实实现还应匹配 Location、Content-Type、body 和缓存头；例如 204 不能再发送一个表示“成功”的 JSON 实体。

## 从示例走向实际使用

为每条接口写正常、参数错误、未登录、越权、冲突与依赖失败的响应示例。测试状态、头与正文一起符合契约，尤其检查 204 无正文和 202 可追踪。

课内函数仅区分几种成功语义，不是完整状态码选择器。真实业务状态需要根据具体操作与失败原因判断。
