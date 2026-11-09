---
{"id":"js-concurrency","moduleId":"js","title":"带并发限制的异步调度器","prerequisites":["js-promise-combinators"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识带并发限制的异步调度器

并发调度器在有很多任务时，只允许有限数量同时进行。它与Promise.all不同：all负责汇总结果，调度器负责何时真正调用任务。输入必须是能够晚些启动的函数，例如() => fetch(url)；若先执行fetch再把Promise交进队列，网络早已开始，并发限制就来不及生效。

并发数不是请求次数。限制为3表示任意时刻最多3项在途，三项完成后可以继续下一批；每秒最多3次则是速率限制。耗时较长时，速率限制与并发上限需要同时考虑。

## 队列、活动计数和结果位置怎样配合

调度器保存下一个待启动索引、当前活动数量、已完成数量和按输入索引分配的结果槽。只要还有任务且活动数低于上限，就取一个任务启动；任务成功或失败后都必须释放活动槽，再决定是否继续启动下一项。同步抛错也应被转换到统一失败路径，否则计数可能永远不归零。

结果按索引写回，保证慢任务不会把输出顺序打乱，但完成事件仍可实时通知界面。错误策略需要提前选择：遇首错拒绝并停止新启动、继续收集全部结果，或返回明确部分结果。已经启动的任务是否取消取决于任务接口是否支持，返回拒绝不代表后台工作已经停止。

输入若是无限或巨大流，只限制活动数量仍不够；把所有待执行任务先存进数组仍可能占满内存。需要有界等待队列，让生产者在队列满时等待或被拒绝，这叫背压。整体时间预算还应包含排队时间，避免任务等了很久后又获得一份完整执行超时。

## 证明并发池没有越过上限

任务必须以函数形式延迟启动；若传入 tasks.map(fetchTask()) 的结果，所有请求在进入池之前就已发出。维护 active、nextIndex 和按输入分配的结果槽位，不变量是 active<=limit 且每个索引只被领取一次。同步 throw 与异步 reject 都计入同一任务结束路径，释放名额必须在 finally 或等价路径发生。

## 取消、失败与公平性不是同一个开关

fail-fast 只规定何时报告失败，不代表已运行任务停止。排队任务可以直接不启动，运行中的任务则需协作取消；必要时等待清理完成再报告结束。多租户共用全局池时，还要限制单租户占用与队列长度，避免一个大批次饿死其他用户。测试峰值并发、按输入返回、空任务、非法 limit、同步异常和中途取消。

## 把机制放到一条完整路径中

```flow
有界任务调度
提交任务函数｜此时尚未执行业务
等待空闲活动槽｜队列容量与总预算参与准入
启动并记录输入索引｜并发完成不改变结果归属
成功或失败都释放槽｜收集结果并按策略继续或取消
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

修改任务数和并发上限，观察最大活跃数与返回顺序。

```javascript
async function settlePool(tasks, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit');
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try { results[index] = {status:'fulfilled', value:await tasks[index]()}; }
      catch (reason) { results[index] = {status:'rejected', reason}; }
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));
  return results;
}


let active = 0, peak = 0;
const tasks = [0, 1, 2, 3].map(value => async () => {
  active++;
  peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, 10));
  active--;
  return value;
});
const results = await settlePool(tasks, 2);
console.log(peak);
console.log(results.map(item => item.value));
```

两个 worker 同时工作，最大活跃数为 2；结果写回领取任务时的索引，完成时机不改变输入顺序。传入函数才能真正延迟启动。

## 从示例走向实际使用

连接池、上游限流和CPU解析能力会共同限制有效并发。逐步提高并发并记录吞吐、队列等待与尾延迟，发现资源排队后应调整瓶颈，而不是继续加数字。

验证零任务、并发数非法、同步异常、异步拒绝、调用方取消与全部完成。为每项任务保留稳定ID和状态，才能在用户界面解释正在排队还是已经执行；不能靠一个全局转圈覆盖所有阶段。
