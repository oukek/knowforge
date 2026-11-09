---
{"id":"js-async-await","moduleId":"js","title":"async / await 与错误传播","prerequisites":["js-promise"],"sources":["mdn-js","ecma","tutorial-promise"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识async / await 与错误传播

async函数让异步过程可以按接近顺序代码的方式表达，但它仍返回Promise。普通return值成为成功结果，函数内部未处理的异常成为拒绝结果；调用方拿到的是未来结果的对象，而非立即得到最终数据。async函数开始后会同步执行到需要挂起的位置，不是整个函数体立刻被送到后台线程。

await用于等待一个值按Promise规则得到结果：成功则继续执行后面的语句，失败则在await位置表现为抛错。它挂起当前异步函数的后续流程，不阻塞整个JavaScript线程；同一函数里的长同步循环仍会占用线程。

## 顺序依赖、并发启动与错误边界

先await请求A，再创建请求B，表示B必须等A完成后才开始；先创建两个Promise再一起等待，才可能重叠执行。是否并发首先由业务依赖决定，例如拿到用户ID后才能查询其订单。Promise.all只组合已经交给它的工作，不会把任意同步计算自动变成并行。

try/catch必须覆盖实际观察失败的位置。try里return某个稍后拒绝的Promise，当前函数可能已经离开try；需要在本层捕获拒绝时应在合适位置await。finally负责收尾，但其中return或抛错可能覆盖此前结果，应谨慎使用。forEach不会等待async回调，串行处理可用for...of配合await，并发处理可先map再受控聚合。

异步还引入结果时序问题：搜索A比B先开始却后返回，不能让A覆盖当前B的页面。取消旧请求和检查请求版本是不同层的保护。AbortSignal只在被调用API参与协议时有效，不能撤销已完成写入，也不能让任意CPU循环立即退出。

## 把机制放到一条完整路径中

```flow
async函数的一次执行
调用函数｜返回Promise并开始执行同步部分
遇到await｜等待值按Promise规则解析
成功或拒绝｜继续语句或在await处抛错
return或未处理异常｜决定外层Promise结果
```

## 配套代码：await 普通值也会暂停续体

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

比较 await 前后与外层同步代码的先后顺序。

```javascript
async function task() {
  console.log('函数开始');
  await 1;
  console.log('await 之后');
}
const pending = task();
console.log('外层同步');
await pending;
```

async 函数在第一个 await 前同步运行。即使等待普通值，后续逻辑也在异步续体中恢复；await 不会阻塞外层同步代码。

## 从示例走向实际使用

用明确的loading、success、error和cancelled状态描述界面，避免只以结果是否为空猜测请求进度。捕获后决定恢复、上报或继续抛出，不要把所有失败转换成空数组，使“没有数据”和“无法获取数据”混在一起。

服务端与页面都要限制同时任务数，并给整条操作确定预算。测试同步抛错、等待中拒绝、取消、乱序响应及finally清理；这些验证比在每个函数前机械加async更能说明你理解异步。
