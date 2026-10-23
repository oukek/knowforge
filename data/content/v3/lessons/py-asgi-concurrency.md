## async def 为什么仍然会卡住全部请求
事件循环只在协程实际挂起时调度其他任务。async def 内调用 time.sleep、同步 requests 或巨大的 CPU 循环，不会自动变成非阻塞。ASGI 处理异步请求生命周期，但不替业务函数改写 I/O。FastAPI 的普通 def 端点可被放进线程池；你在 async def 内直接调用同步函数则不同，不能混为一谈。

线程适合把阻塞 I/O 移出事件循环，但有工作线程上限，线程里已开始的外部调用也不能因 await 者取消就保证中断。CPU 密集工作通常需要独立进程或专用任务服务，并同时考虑序列化和进程启动成本。Python 的 GIL 行为取决于解释器构建与扩展模块，不应把“用了线程”一概解释成所有任务并行或完全不并行。
## 有界并发与结构化生命周期
假设每个请求并行访问三个后端，入口 100 并发并不等于只有 100 个下游操作。TaskGroup 把子任务归入一个作用域，异常时取消同组尚未完成的任务；Semaphore 控制执行数量，连接池控制实际连接，二者约束不同。还要限制等待队列和等待时长，否则只是把拥堵藏进内存。
## 本地服务参考
```python
import asyncio
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException

@asynccontextmanager
async def lifespan(app):
    app.state.client = httpx.AsyncClient(timeout=1.5,
        limits=httpx.Limits(max_connections=20))
    app.state.limit = asyncio.Semaphore(10)
    yield
    await app.state.client.aclose()

app = FastAPI(lifespan=lifespan)

@app.get('/report')
async def report():
    try:
        async with asyncio.timeout(2):
            async with app.state.limit:
                response = await app.state.client.get('http://127.0.0.1:9000/data')
                response.raise_for_status()
                return response.json()
    except TimeoutError:
        raise HTTPException(504, 'budget exceeded')
```
在本地虚拟环境安装 fastapi、httpx、uvicorn 后启动；浏览器不安装这些第三方包。共享 client 在应用生命周期创建和关闭，不应每个请求都创建一个连接池。示例总超时涵盖等待信号量，防止排队时间不计入预算。
## 从日志定位吞吐崩塌
先测事件循环延迟、线程池等待、连接池等待和下游耗时。若所有请求一起停顿，优先找同步阻塞；若事件循环正常而请求等连接，检查连接泄漏或池容量；若内存随负载涨，检查排队是否有界。把限制从 10 调到 100 前，先确认数据库和下游是否承受得住。
## 取消与数据一致性
不要吞掉 CancelledError 后继续业务提交；捕获异常清理资源后通常应重新抛出。取消不能回滚已经提交的远端效果，付款、发消息等副作用仍需幂等键。对客户端断开后的长任务，选择明确取消或转为持久后台任务，不要让一个脱离监管的 asyncio.create_task 随请求消失。
