---
{"id":"node-workers","moduleId":"node","title":"进程、worker_threads 与 cluster","prerequisites":["js-promise","js-async-await"],"sources":["node-loop","node-stream"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识进程、worker_threads 与 cluster

并发是多个任务在一段时间内交错推进，并行是多个任务在同一时刻实际执行。Node 可以高效并发等待许多 I/O，但一个主线程上的密集 JavaScript 计算仍会阻塞其他回调。worker_threads 为 CPU 密集计算提供额外 JavaScript 执行线程。

进程拥有更独立的运行资源与故障边界；worker 线程运行在同一进程内，但有自己的 JavaScript 执行环境。cluster 常用于组织多个 Node 进程服务请求，它不等于把一个函数自动拆成并行算法。

## 任务分配必须计入通信和排队

把计算交给 worker 需要发送输入并取得结果。数据复制、序列化和消息调度都有成本，小任务可能还不如主线程直接计算。可转移缓冲能够减少某些复制，但转移后的所有权会改变；共享内存则需要同步规则，不能以为多个线程写同一数组天然安全。

为每个请求临时创建一个 worker 会产生启动成本，也可能在高并发下耗尽资源。常见做法是固定或有界线程池，使用有限任务队列，并设置排队超时、取消和过载拒绝。线程数不应只随请求数增长，还要考虑 CPU 核心、任务内存与容器配额。

独立进程适合更强的故障隔离或不同运行依赖，但通信成本和部署管理也更高。选择依据是任务性质与边界：I/O 等待一般先使用异步接口；CPU 密集任务评估线程池；需要独立扩缩容或更强隔离时评估单独服务。

## 把机制放到一条完整路径中

```flow
CPU 任务池
提交任务｜验证输入与任务大小
有界排队｜控制等待数量和时间
工作执行｜线程或进程完成计算
结果回传｜关联请求并释放资源
```

## 配套代码：CPU 任务分配给有界工作池

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

这里只模拟任务分区，不创建真实 Node worker_threads 或展示并行性能。

```javascript
function partition(tasks, workers) {
  const queues=Array.from({length:workers},()=>[]);
  tasks.forEach((task,index)=>queues[index%workers].push(task));
  return queues;
}
console.log(partition([1,2,3,4,5],2));
console.log(partition([1,2,3],1));
```

任务被分到固定数量工作者；真实 CPU 并行还需启动线程、传输数据、等待结果与处理超时。把普通任务放数组并不自动产生并行，负载不均时还要动态调度。

## 从示例走向实际使用

先测某个任务的纯计算时间、输入输出大小和并发数量，再比较串行、线程池与独立服务。吞吐提升同时检查尾延迟和内存，避免只是把阻塞转移到无限队列。

课内按轮次分配数组只展示调度结果，不会真正创建线程。真实实现还需任务 ID、失败回传、worker 崩溃恢复和退出时停止接单。
