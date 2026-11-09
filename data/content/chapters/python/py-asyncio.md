---
{"id":"py-asyncio","title":"Python asyncio：协程、Task、事件循环与结构化并发","moduleId":"python","prerequisites":["py-functions","py-iterators"],"sources":["py-types","py-functions"]}
---
## 协程与任务为什么要分开
async def 定义协程函数，调用后得到协程对象；仅创建它并不会像普通函数一样执行完整函数体。await 驱动可等待对象并在需要等待时挂起当前协程；Task 将协程交给事件循环调度。事件循环在可运行任务之间安排执行，适合把网络等待时间留给其它工作。

异步不是多核CPU并行。在协程中执行 time.sleep、同步HTTP库或大循环，仍会阻塞事件循环线程。await 也不保证每次都真正让出执行权，例如等待已经完成的对象可能无需长时间挂起。重点是所调用操作是否支持协作等待。
## 用等待过程理解并发，而不是先记关键字

假设下载A需要等待网络，下载B也需要等待网络。如果程序启动A后一直等到结束才启动B，两段等待会串起来；如果先启动两个工作，A等待时事件循环可以推进B，就可能重叠等待时间。重叠的是等待，不是让同一线程同时执行两段Python指令。CPU计算一直不让出控制权时，其它协程仍无法及时运行。

await表示当前协程依赖某个可等待对象的完成。它让这种暂停写得像顺序代码，调用者能按正常返回或异常方式拿到结果。Task则是事件循环管理的执行单元，保存协程状态、结果和取消关系。把协程安排为Task后，任务可能在调用者等待其它事情时继续推进，因此创建者也必须负责收集失败与结束它的生命周期。

## 把一组子任务放进明确作用域

```python
import asyncio

async def fetch_label(value):
    await asyncio.sleep(0)
    return f"item-{value}"

async def collect():
    async with asyncio.TaskGroup() as group:
        first = group.create_task(fetch_label(1))
        second = group.create_task(fetch_label(2))
    return [first.result(), second.result()]

print(await collect())
```

TaskGroup要求Python3.11及以上；离开async with前会等待其管理的任务结束。某个任务发生普通异常时，会按任务组规则取消其它任务并汇总异常，调用者不能把退出作用域误认为所有任务都成功。相比随手create_task后不再管理，明确的父子作用域能减少遗留工作。

真实网络请求还需要客户端连接池、超时和响应关闭。Semaphore只管进入临界工作区的数量，不能代替连接池，也不能防止提前创建百万Task占满内存。先用有限生产者和消费者组织生命周期，再按下游容量调整并发度。

## 对照串行与并发的结构
```python
import asyncio

async def work(value):
    await asyncio.sleep(0)
    return value * value

async def main():
    # gather 安排多个可等待工作，并按输入顺序收集结果。
    results = await asyncio.gather(work(2), work(3), work(4))
    print(results)

# 本地脚本使用 asyncio.run(main())。
# 课内环境已经有事件循环，可以使用顶层 await main()。
await main()
```
连续 `await work(2); await work(3)` 表达第二项要等第一项完成后才开始，通常是串行。并发组合应在任务之间没有依赖时使用。结果按输入顺序不意味着任务也按该顺序完成。
```flow
一个协程的调度
调用 async 函数｜得到协程对象
await 或安排成 Task｜开始推进执行
遇到尚未完成的异步等待｜挂起当前协程
循环运行其它就绪任务｜等待资源完成
恢复并返回或抛错｜结果交回等待者
```
## TaskGroup、Semaphore 与队列各解决什么
TaskGroup 将一组任务生命周期放进作用域，相关失败会触发其规定的取消与异常汇总行为。Semaphore 限制同时进入某段操作的数量，但不会限制已经创建的 Task 总数。对于百万项输入，应采用有界队列与固定消费者，而不是先创建百万协程再在内部等信号量。

连接池也有上限，所以有效并发取决于任务闸门、连接池、下游限流和CPU解析能力。盲目增大并发可能提高排队与超时，并不必然增加吞吐。
## 取消与错误必须收束
捕获取消后应先释放资源，通常继续传播 CancelledError。不要把所有异常吞掉变成空结果，让调用者无法知道失败。超时只是等待预算，不能撤销已提交的外部副作用；支付、发信等需要幂等和状态核对。

测试任务成功、部分失败、等待中取消和消费者提前结束；观察是否遗留 Task、连接或未取走的异常。程序退出前清楚等待所有属于本次工作的任务，才能称为完整的并发流程。
