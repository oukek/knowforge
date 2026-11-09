---
{"id":"node-stream-pressure","moduleId":"node","title":"流式处理：背压、内存上界与失败传播","prerequisites":["js-promise","js-async-await"],"sources":["node-stream"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识流式处理

流式处理把一个大结果拆成逐步到达的小块。它能提前展示部分结果，也能减少一次性内存占用，但只有整个链路都尊重下游速度时，内存才有机会保持稳定。某一层无限缓存，就会破坏前面所有流式设计。

例如 AI 服务持续输出文字，网关转发给一个慢速手机。若网关只管读取上游并把内容放入数组，手机越慢数组越大；“接口使用了流”并没有消除积压。

## 用速率与缓冲推导内存风险

在没有限流、丢弃或暂停的情况下，积压增长速度近似等于生产速率减消费速率。生产每秒十块、消费每秒两块，三秒后会额外积压二十四块。若每块大小不固定，仅限制块数仍不足以准确控制内存。

背压必须跨越读取、转换、业务处理和发送各层。异步迭代逐块 await 消费可以形成自然节奏，但如果循环里启动任务后不等待，把 Promise 全部收集起来，仍会恢复成无界并发。转换器内部队列与日志缓冲也要计入预算。

失败传播与速度控制同样重要。客户端断开后，应停止不再需要的上游读取并清理相关资源；上游中断后，应标记结果不完整，而不是把已经展示的前缀当成功。对可恢复业务，可保存带序号的事件和任务状态，让重连与重新执行明确区分。

## 为什么流式接口仍可能撑爆内存

把文件分块读取不等于有内存上界。若生产者每秒产出 10MB，消费者每秒仅处理 2MB，忽略背压时积压每秒增加 8MB。highWaterMark 是触发暂停的阈值，不是进程的硬性内存限制；还要计入多个流的缓冲、解码后的字符串、业务队列和对象引用。对象模式按对象数量计水位，一个对象可能包含数十 MB。

write(chunk) 返回 false 表示数据已被接收但缓冲已达到阈值，此时应等待 drain，不能把这块数据再写一遍，也不能继续无界生产。背压是一条从慢消费者向上游传播的节流信号；把所有块先收进数组再调用 pipeline 会破坏这一点。

## 端到端链路与资源清理

读取、解压、解析、变换、写入中的任意阶段失败，都需要让整条链停止。手动 pipe 容易漏掉错误监听和关闭顺序；stream/promises.pipeline 把链路成功/失败汇聚成 Promise，并在失败时销毁相关流。AbortSignal 用于外部取消；但用户实现的变换若不返回或阻塞 CPU，框架不能魔法中断。

## Node 24+ 可运行示例

```javascript
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
let count=0;
const source=Readable.from((async function*(){
  for(let i=0;i<20;i++) yield Buffer.alloc(1024,i);
})());
const sink=new Writable({highWaterMark:2048, write(chunk,encoding,done){
  count+=chunk.length;
  delay(5).then(()=>done(),done);
}});
await pipeline(source,sink,{signal:AbortSignal.timeout(3000)});
console.log(count); // 20480；写入完成以后才输出
```
使用异步生成器作为生产者可以在下游暂停时停止继续生成。真实网络上传还要限制总文件大小和持续时间；慢速攻击即使不撑爆瞬时内存，也可能长时间占用连接。

## 实验和诊断

把消费延迟从 5ms 提高到 100ms，观察 writableLength、RSS 和总耗时。如果 RSS 持续线性增长，查找链路外的数组缓存、未完成 Promise 集合和监听器引用；如果内存稳定但吞吐低，观察 CPU、磁盘或下游限速，而不是只调大水位。中途让 sink 返回错误，确认 source 停止生产且 pipeline reject。

## 场景迁移：SSE 与大模型输出

浏览器读得慢时，HTTP 响应也需要背压。把每个 token 都立刻写入队列会放大事件数量，应做有界合并与节流，保留事件序号。连接断开后取消上游生成，否则服务端仍可能消耗模型 token。对于已持久化的业务事件，可以用 last-event-id 恢复；仅在内存里的 token 不能凭一个编号保证可重放。

## 把机制放到一条完整路径中

```flow
端到端背压
上游生产｜按需读取而非无限预取
中间转换｜限制缓冲与并行任务
下游消费｜把速度压力反馈给前方
失败停止｜断开时贯穿清理整条链
```

## 配套代码：流式处理：背压、内存上界与失败传播

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```javascript
const produced = 10,
  consumed = 2;
console.log([1, 2, 3].map((seconds) => (produced - consumed) * seconds));
function drain(buffer, incoming, capacity) {
  const accepted = Math.min(incoming, capacity - buffer);
  return { buffer: buffer + accepted, paused: incoming > accepted };
}
console.log(drain(6, 5, 8));
```

这是缓冲增长与限流的教学模型，不是 Node Stream 的替代实现。第一行说明无背压时按时间增长的积压；第二行显示容量有限时必须暂停生产，而不是无限加数组。真实 write(false) 仍然接收了该块，不能按模型的 accepted 再重写。

## 从示例走向实际使用

用受控慢消费者验证内存上界，再注入源错误、目标错误与主动取消。观察的不只是吞吐，还包括是否残留连接、任务、临时文件和重复副作用。

进阶示例使用真实 Node 流接口；课内小实验仅演算积压。两者应结合阅读：数学模型解释为什么会涨，真实接口展示如何把暂停和清理接到整条链上。
