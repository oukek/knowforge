---
{"id":"crawl-retry","moduleId":"crawler","title":"超时、重试、退避与 Retry-After","prerequisites":["py-iterators","crawl-boundaries"],"sources":["httpx","http-semantics","scrapy-throttle"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识超时、重试、退避与 Retry-After

采集请求可能因短时网络故障或服务过载失败，但重试也会增加目标站点压力。可靠重试需要回答三个问题：哪些错误值得重试、什么时候再试、总共允许投入多少时间。无条件立即重试通常会把暂时故障放大。

服务器返回 Retry-After 时，是在告诉客户端建议的再次尝试时间。它可能是秒数，也可能是 HTTP 日期，不能只当成任意字符串或永远按整数解析。

## 错误分类与整体预算

连接中断、部分 5xx 与 429 可能适合有限重试；认证失败、格式错误或明确禁止访问通常需要修正配置或停止。不同状态的处理应以接口契约为准。重试只适用于允许重复的请求或具有幂等保障的写入，不能因为采集程序通常用 GET 就忽视其他操作。

指数退避逐次增加等待，抖动避免多个 worker 同时醒来。服务端要求等待更久时，不应为了本地 cap 提前重试；若等待超过任务剩余预算，应延后调度或结束当前任务。单次请求超时与整个任务截止时间分开控制，避免多次尝试累加成不可预测等待。

每次尝试记录原因、耗时与下一次时间，但同一任务要有稳定 ID，便于统计真实任务成功率而非只看请求次数。取消信号应中断等待与请求。达到预算后进入明确失败或待人工处理状态，不让任务在后台永远循环。

## 把机制放到一条完整路径中

```flow
有限重试
分类错误｜判断临时故障与永久拒绝
计算等待｜结合退避抖动与 Retry-After
检查预算｜超出截止时间则延后或结束
再次尝试｜保留任务身份并响应取消
```

## 配套代码：超时、重试、退避与 Retry-After：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

def delay(attempt, retry_after=None, cap=30):
    backoff = min(cap, 2**attempt)
    return max(backoff, max(0, retry_after)) if retry_after is not None else backoff
show([delay(n) for n in range(7)])
show(delay(1,12))
show(delay(1,120))
```

代码只验证确定性的退避上限，故意没有加入随机抖动以便预测输出。生产实现应加入可注入随机源、HTTP 日期解析和总 deadline；达到上限后也要限制重试次数，不能无限每 30 秒重试。

## 从示例走向实际使用

用本地受控服务依次返回 503、429 和成功，检查是否遵守等待与次数。再测试 Retry-After 超过剩余预算、日期格式和永久错误。

课内延时函数用于观察指数与上限；真实调度应单独处理服务端最早重试时间，不可把较长 Retry-After 截短后提前访问。示例最后一项返回 120，说明本地 30 秒退避上限不会缩短服务器要求的等待；预算不足时应交回调度器延后执行。
