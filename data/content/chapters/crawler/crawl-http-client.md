---
{"id":"crawl-http-client","moduleId":"crawler","title":"HTTP 客户端、Session 与连接池","prerequisites":["py-iterators","crawl-boundaries"],"sources":["httpx"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识HTTP 客户端、Session 与连接池

HTTP 客户端负责建立连接、发送请求、读取响应和管理超时。反复抓取同一站点时，复用 Client 或 Session 可以保留连接池与必要会话状态，减少每次重新连接的成本。它并不意味着所有请求都可以无限并发。

连接池是可复用连接的集合；当可用连接不足时，请求可能先在池中等待。因此请求慢既可能是目标服务器慢，也可能是自己的连接池已经被占满。

## 连接、会话与超时分别配置

Session 可以保存 Cookie 等会话信息，但不同账号或租户不应不加区分地共享同一个会话。连接复用还要求响应被正确消费或关闭；只读取一部分就丢弃对象，可能让连接长期占用。使用上下文管理器能帮助保证退出时释放客户端资源。

HTTPX 等客户端区分连接、读取、写入和池等待超时。读取超时通常关注等待下一块数据的间隔，不等于整个下载总时长；一个持续缓慢发送小块的响应可能一直未触发读取空闲超时，因此还需任务级总预算。并发上限、连接数和每域速率也不是同一个参数。

响应处理先检查状态码与内容类型，再解析正文。200 响应可能是登录页或错误页面，不能直接当成目标数据。TLS 证书验证应正常开启，重定向需要范围校验，敏感认证头不能随意发送到新的主机。

## 把机制放到一条完整路径中

```flow
HTTP 客户端生命周期
创建客户端｜设置连接池会话与超时
获取连接｜受并发和池容量约束
校验响应｜区分状态类型与业务内容
消费关闭｜释放响应并在结束时关闭客户端
```

## 配套代码：HTTP 客户端、Session 与连接池：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

config={'max_connections':20,'max_keepalive_connections':10,'connect_timeout':3,'read_timeout':10}
show(config['max_keepalive_connections']<=config['max_connections'])
show(min(100,config['max_connections']))
```

这里验证客户端配置关系，没有在浏览器导入 HTTPX 或建立真实连接。实际项目可用 with httpx.Client 或 async with httpx.AsyncClient，并按部署的库版本确认参数；本模型的 min 计算不能替代连接池或队列实现。

## 从示例走向实际使用

小项目可使用一个生命周期清楚的同步 Client；大量 I/O 并发可评估异步 Client，但仍需信号量、队列与按域限制。每次请求都创建新客户端会失去连接复用收益。

课内配置模型只比较连接预算，不执行网络请求。真实实验应针对自有或允许的端点，测连接复用、慢响应和池耗尽三种情况。
