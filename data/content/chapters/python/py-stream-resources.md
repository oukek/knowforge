---
{"id":"py-stream-resources","title":"Python 流式处理：迭代、背压与资源所有权","moduleId":"python","prerequisites":["py-iterators","py-context","py-cancellation"],"sources":["py-types","py-functions"]}
---
## 流式不是把数据切小后全部存起来
流式处理让生产、转换和消费按有限缓冲逐步进行。优势是减少峰值内存并较早产出结果，但如果中间步骤把所有块append到列表，最后再join，仍可能变成全量缓存。是否真正有界，要看每一层保存了多少未消费数据。

背压表示消费者速度影响生产者推进。生成器天然由消费者拉取下一项，但内部异步预取、队列和网络库可能额外缓冲，仍要设置容量与超时。
## 拉取、推送和缓冲分别决定谁能推进

同步生成器是典型拉取模型：消费者调用next，生产者才推进到下一个yield。网络回调常是推送模型：数据到达就通知应用，若消费者慢，需要中间缓冲或暂停读取。两者都可以组成流式系统，但是否有界要看每个缓冲区是否有限，不能只看函数是否用了yield。

假设每块64KiB、队列最多8块，单个队列保存的数据量大约受512KiB限制，另需计入正在处理的块、解析状态和库内部缓存。若每块大小不受限，即使队列只有8项也可能占用巨大内存。因此容量设计通常同时限制项数、单项大小和总字节数。

## 解码、分帧与业务解析是不同层次

网络chunk可能把一个UTF-8字符切开，也可能包含半个JSON对象或多个完整事件。第一层增量解码维护字节到文本的状态；第二层按行、长度前缀或协议分隔符识别完整消息；第三层才解析消息字段并验证业务。把每个chunk直接json.loads会把正常网络分块误报为格式错误。

读取SSE等文本事件时，还应限制一条迟迟没有结束标记的事件能积累多少内容，并在连接结束时判断残余内容是否完整。恢复下载或重试消费则要定义恢复单位：字节偏移、记录游标与业务事件ID各解决不同问题。只有知道已经确认消费到哪里，才能避免重放时重复副作用或跳过记录。

流式响应提前发出状态码后，后续失败不能再把已经发送的200改成500。应按协议发送错误事件、结束连接，并在服务日志记录关联ID；客户端也要识别“正常结束”和“中途断开”。这类协议完成点比“分块输出能省内存”更重要。

## 一个逐行转换管道
```python
from io import StringIO

def nonempty_lines(stream):
    for line in stream:
        text = line.strip()
        if text:
            yield text.upper()

with StringIO("one\n\ntwo\n") as source:
    for value in nonempty_lines(source):
        print(value)
```
资源由外层with拥有，消费过程在资源有效期内完成。若函数在with内直接return生成器，却在with结束后才迭代，底层文件可能已经关闭；返回一个惰性对象并没有延长所有外部资源的生命周期。
## 提前终止和异常怎么办
客户端只需要前几项、下载断开、解析到非法数据，都可能让消费提前停止。生产者应观察取消，关闭连接和文件，停止后台预取任务。yield并不自动保证每一种放弃方式都立即执行清理，应设计明确的拥有者和close/async context边界。
```flow
有界流式管道
读取有限一块｜文件、网络或游标
增量解析｜保留必要的跨块状态
转换并输出｜不积累全部历史
消费者推进｜慢时让生产等待
结束或取消｜关闭上游资源并清理缓冲
```
## 跨块协议与可恢复性
UTF-8字符、JSON记录或SSE事件可能跨chunk，不能把一次read返回当完整业务消息。使用增量解析和长度上限，避免永远没有终止符的数据无限占内存。失败重试需要游标、幂等或重新开始规则，不能随意从字节中间恢复复杂格式。

测试空流、极小分块、跨字符边界、慢消费者、提前取消与上游失败。观察峰值内存和打开资源数量，才能验证“流式”是真实行为而不是函数名称。

## 异步队列如何把慢消费传回上游

有界asyncio.Queue的put会在队列满时等待，这使生产速度受消费速度约束。下面只演示单生产者和单消费者正常结束的情况，使用唯一哨兵表示没有更多输入。

```python
import asyncio

async def pipeline():
    queue = asyncio.Queue(maxsize=2)
    end = object()
    async def producer():
        for value in range(4):
            await queue.put(value)
        await queue.put(end)
    async def consumer():
        total = 0
        while True:
            value = await queue.get()
            if value is end:
                return total
            total += value
    producer_task = asyncio.create_task(producer())
    try:
        total = await consumer()
        await producer_task
        return total
    finally:
        if not producer_task.done():
            producer_task.cancel()
            await asyncio.gather(producer_task, return_exceptions=True)
```

消费者失败时finally取消仍可能堵在put上的生产者，避免函数退出后遗留Task。但若生产者也可能失败，上例还需要统一任务组或显式错误信号，防止消费者永远等待不存在的下一项。多个消费者则需要相应结束协议；一个哨兵不一定能通知所有人。代码的正常路径很短，生命周期设计必须覆盖双向失败，这才是流式工程真正困难的部分。
