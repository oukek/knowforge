---
{"id":"py-cancellation","title":"Python 异步取消与超时：传播、清理和结果不确定","moduleId":"python","prerequisites":["py-asyncio","py-context"],"sources":["py-types","py-functions"]}
---
## 取消是协作信号，不是事务回滚
Task.cancel请求在协程的合适位置注入取消，协程可以通过finally清理资源。它不会强制终止任意CPU循环，也不能撤销已经在数据库或远端完成的操作。将“调用方不再等待”与“业务肯定未执行”画等号，会导致重试时重复扣费等问题。

超时也包含两层：等待预算和底层操作停止能力。asyncio中的等待超时机制会按各自API规则取消或转换异常，但同步线程里的阻塞调用可能仍继续执行，必须了解库是否支持取消。
## Task 的状态和取消请求不是同一个值

任务可能尚未完成，也可能正常返回、抛异常或被取消。调用cancel()是在请求取消，不等于这一行之后目标已经停止；应继续await目标，让它完成清理并观察最终结果。协程在可取消等待点收到CancelledError后可以进入finally，若一直执行不含等待的CPU循环，则不能期待立即响应。

取消传播沿等待关系发生：上层等待某个下层任务时被取消，通常也会影响被等待者，但具体行为还受shield等机制改变。资源管理应按所有权决定由谁取消和回收，避免两个调用者共享一个任务时，任何一方超时都随意终止另一方仍需要的工作。

## 把一段工作放入统一的时间范围

```python
import asyncio

async def bounded_operation():
    try:
        async with asyncio.timeout(0.01):
            await asyncio.Event().wait()
    except TimeoutError:
        return "超过等待预算"

print(await bounded_operation())
```

asyncio.timeout作用于代码块，并在其退出边界将由该超时引起的取消转换成TimeoutError。它适合让多次await共享预算，而不是每一步都重新获得完整时长。真实请求也可以在入口计算截止时刻，每次下游调用使用剩余时间；截止时刻的计算应使用适合测量间隔的单调时钟。

外部操作是否执行成功仍需要协议证据。例如数据库已经提交、响应包尚未到达时发生超时，客户端看到失败但数据可能已经改变。处理办法是稳定操作ID、幂等约束和结果查询，而不是延长超时或无条件重复写入。取消机制负责收束本地工作，业务协议负责解释不确定的远端结果。

## 观察清理与取消传播
```python
import asyncio

async def worker(started):
    try:
        started.set()
        await asyncio.Event().wait()
    finally:
        print("cleanup")

async def main():
    started = asyncio.Event()
    task = asyncio.create_task(worker(started))
    await started.wait()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        print("cancelled")

await main()
```
先等待started确保任务已进入作用域，再取消，避免用sleep猜时序。清理输出之后取消被等待者观察到。真实项目不应无条件吞掉CancelledError然后继续正常返回，这会破坏上层任务的退出预期。
## 总预算与重试如何配合
请求入口应确定总截止时间，下游每次尝试受剩余预算约束。重试前先判断错误是否暂时、操作是否幂等以及预算是否足够。每次重新设置完整超时可能让三次重试把用户等待放大三倍以上。
```flow
取消沿调用链传播
用户离开或总预算耗尽｜上层请求取消
任务观察信号｜停止排队或等待
清理本地资源｜连接、文件、订阅与子任务
判断副作用状态｜可能已完成，必要时查询
向上报告｜保留取消语义和可核对标识
```
## shield 与后台任务不是逃生口
shield可以在特定场景保护被等待任务不随外层取消，但外层仍可能收到取消，内部任务也必须有人保留引用、收集结果并管理结束。不能用它让所有耗时任务绕过预算。必须可靠完成的工作进入持久队列，而不是留在请求进程中祈祷不退出。

测试取消发生在开始前、持有资源时、提交后及结果返回前。每个阶段的业务语义不同，清理成功与操作未执行不能互相替代。
