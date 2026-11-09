---
{"id":"node-loop","moduleId":"node","title":"Node 事件循环、libuv 与 nextTick","prerequisites":["js-promise","js-async-await"],"sources":["node-loop"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Node 事件循环、libuv 与 nextTick

Node.js 用 JavaScript 编写服务端程序。一个常见 Node 进程中，许多请求的 JavaScript 回调由同一条主线程执行；网络等待等工作则由运行时与操作系统协调。所谓非阻塞，是等待 I/O 时可以处理别的事情，不是任意一段 JavaScript 都会自动并行。

例如请求 A 等数据库返回时，可以接收请求 B；但 A 的回调若连续计算两秒，B 的 JavaScript 处理也会被延后。理解事件循环，需要同时看“谁在执行计算”和“就绪回调何时轮到”。

## 从就绪事件到 JavaScript 回调

libuv 帮助 Node 管理事件循环以及部分异步工作。网络 I/O 通常通过操作系统的就绪通知处理，某些文件、加密等操作会使用线程池；不能概括为每个异步请求都独占一个线程。事件循环按不同阶段处理相应回调，定时器阈值只表示最早有机会运行的时间，不保证精确到点执行。

Promise 的反应回调与 process.nextTick 不应被画成普通 I/O 阶段。它们有各自的调度规则，连续递归安排这些回调可能延迟 I/O 的机会。nextTick 与 Promise 的相对表现还受到执行上下文影响，例如顶层 ES 模块与 CommonJS 示例不可混作一条无条件口诀。

setTimeout 与 setImmediate 的顺序也依赖调度位置和运行时条件。解释程序时先标明代码在哪个回调或模块上下文执行，再推导队列；不要从一次运行结果反推所有版本都保证相同顺序。线上更有价值的指标是事件循环延迟、CPU 与请求排队，而不仅是背阶段名称。

## 将线程模型和排队模型分开

JavaScript 回调主要在事件循环线程执行，部分 fs、crypto 等操作可能使用 libuv 线程池，网络 I/O 由操作系统机制协作；不能据此把每次 await 都说成进入线程池。一个 CPU 循环会延迟其他请求的回调，增加数据库连接数无法解决。先把总耗时分解为入口排队、事件循环等待、连接池等待与真正下游执行。

## 从开发机正常到生产尾延迟

构造一条 CPU 重端点和一条轻端点同时压测，记录事件循环延迟与轻端点 P95。再使用有界 Worker 池，比较传输数据量和队列等待；每次请求创建新线程的启动成本可能反而更大。检查任务取消、进程优雅退出与线程异常恢复，不把“多核利用率更高”单独作为成功指标。

## 把机制放到一条完整路径中

```flow
一次异步请求
发起操作｜主线程完成有限准备工作
外部等待｜系统或工作线程处理 I/O
事件就绪｜回调等待适当调度机会
执行回调｜主线程处理结果并继续推进
```

## 配套代码：nextTick 与 Promise 的队列模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

Worker 没有 Node process；显式队列只解释常见 CJS 回调边界下的优先级，不能用作所有 ESM 的真实顺序。

```javascript
const nextTickQueue=[],microtasks=[];
nextTickQueue.push(()=>console.log('nextTick 模型'));
microtasks.push(()=>console.log('Promise 模型'));
console.log('同步');
while(nextTickQueue.length) nextTickQueue.shift()();
while(microtasks.length) microtasks.shift()();
console.log(typeof process);
```

此模型故意手动清队列，Worker 本身不提供 process.nextTick。真实 Node 的阶段和 ESM 顶层顺序受上下文与版本影响，需用 Node 最小示例验证。

## 从示例走向实际使用

让主线程保持短任务：输入限制、分页处理和避免超大 JSON 同步解析可以控制单次工作量。真正密集的 CPU 工作可评估 worker 线程或独立服务，但要计入传输与排队成本。

课内队列是帮助识别同步与延后执行的教学模型，不是 libuv 源码实现。需要判断真实 Node 顺序时，在目标版本与相同模块类型下运行，并说明哪些是保证、哪些只是观测。
