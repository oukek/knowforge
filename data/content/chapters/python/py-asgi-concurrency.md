---
{"id":"py-asgi-concurrency","title":"Python ASGI 服务：事件循环、同步边界与请求并发","moduleId":"python","prerequisites":["py-asyncio","py-concurrency","py-context"],"sources":["py-types","py-functions"]}
---
## ASGI 描述应用与服务器的通信方式
ASGI服务器接收网络连接，把请求范围与消息交给应用；应用通过异步调用接收和发送事件。框架在上面提供路由、依赖注入、验证等便利。ASGI不是“所有函数写async就会快”，真正是否阻塞取决于函数内部操作及框架如何调度同步端点。

一个进程中的事件循环负责推进许多等待中的请求。若某个async端点直接调用阻塞数据库驱动或长CPU计算，其它请求也可能迟迟得不到执行机会。多个worker进程增加隔离与并行资源，但也各有连接池和内存成本。
## 服务器、协议接口与框架各负责哪一层

ASGI服务器处理监听端口、连接与协议解析，应用是接收scope、receive和send的可调用对象，框架在应用层提供路由、请求对象和响应构造。HTTP scope保存方法、路径、头等本次请求信息；receive提供正文或断开等事件；send把响应事件交回服务器。WebSocket和lifespan使用不同事件序列，不能只实现HTTP就假装所有协议都支持。

同步WSGI应用通常通过同步调用迭代响应；ASGI允许应用在接收与发送间await，从而支持异步I/O和长连接交互。但底层使用异步接口，不代表业务代码自动非阻塞。框架可能把普通同步端点卸载到线程池，这与在async端点中直接调用阻塞库是不同路径，应按实际框架文档理解。

## 请求状态为什么不能放在普通全局变量

一个worker同时处理多个请求，若用全局current_user保存当前用户，请求A在await时挂起，请求B可能把值改成另一用户。恢复后的A再读取就串号。应显式传递用户上下文，或在适合范围使用ContextVar，并在结束时恢复绑定。

```python
from contextvars import ContextVar
request_id = ContextVar("request_id", default="-")

def process(identity):
    token = request_id.set(identity)
    try:
        print(request_id.get())
    finally:
        request_id.reset(token)

process("request-a")
print(request_id.get())
```

ContextVar解决上下文绑定传播，不自动验证身份，也不使绑定的可变对象线程安全。后台任务可能继承创建时的上下文，不能因此把请求里的数据库会话无限延长使用。请求范围、任务范围和应用范围资源应分别管理，服务退出时再由相应拥有者清理。

## 将阻塞函数移出循环的示意
```python
import asyncio

def blocking_library_call(value):
    # 这里代表一个只能同步调用的库，不在本例发真实网络请求。
    return value.upper()

async def main():
    result = await asyncio.to_thread(blocking_library_call, "ready")
    print(result)

await main()
```
to_thread适合把某些同步阻塞调用移到线程执行，但调用方取消等待不保证线程里的函数立即停止。CPU密集Python代码还要考虑GIL与进程方案，不能把线程卸载当通用多核加速。
## 请求生命周期与依赖范围
数据库会话等资源应按明确范围创建和关闭，不能把某用户请求上下文放到全局对象。ContextVar适合请求相关上下文传播，但线程、后台任务与复制上下文的行为仍需理解。认证、校验和业务授权应在明确边界完成。
```flow
请求进入 ASGI 应用
服务器解析连接与消息｜连接数和协议预算
框架路由与依赖｜认证、数据解析、资源获取
异步业务逻辑｜原生异步I/O或受控同步桥接
发送响应｜状态、头与正文逐步提交
清理与取消｜断开、异常、超时都收束资源
```
## 容量与故障验证
按请求同时持有的连接、线程、内存和CPU工作计算容量。增加worker会同时增加数据库连接需求，不能只把进程数乘到很大。流式响应还要考虑慢客户端与背压，不能无限生产数据。

压测中观察事件循环延迟、线程池等待、连接池等待与尾延迟；测试客户端提前断开和服务退出。接口逻辑正确不代表高并发下稳定，需要把队列、超时与资源上限一起设计。

## 直接观察 ASGI 消息，而不依赖框架术语

下面是一个最小HTTP应用接口，真实运行需要ASGI服务器。scope描述连接与请求范围，receive接收请求相关事件，send发送响应事件。响应头与正文分开发送，正文可以分块；开始发送响应之后不能再把已发送状态码改回另一种结果。

```python
async def app(scope, receive, send):
    if scope["type"] != "http":
        raise RuntimeError("本例只实现 HTTP")
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [(b"content-type", b"text/plain; charset=utf-8")],
    })
    await send({
        "type": "http.response.body",
        "body": "ready".encode("utf-8"),
        "more_body": False,
    })
```

保存为main.py并安装匹配的服务器后，可用`uvicorn main:app --lifespan off`观察这个仅实现HTTP的教学应用。真实应用还需正确处理lifespan、请求体读取、断开和异常，本例不伪装成完整框架。框架把消息协议包装成Request/Response，仍不能绕过请求生命周期：读取巨大正文前应限制大小，流式send变慢时应让生产侧降速，不能一直把数据加入内存队列。
