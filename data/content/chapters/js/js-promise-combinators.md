---
{"id":"js-promise-combinators","moduleId":"js","title":"all / race / allSettled / any","prerequisites":["js-promise"],"sources":["mdn-js","ecma","tutorial-promise"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识all / race / allSettled / any

多个异步工作需要一个聚合结果时，先决定成功条件：必须全部成功、收齐每项成败、最先结束，还是最先成功。all、allSettled、race、any分别表达不同条件，它们不是速度快慢不同的四种写法，也不会自动管理取消、重试或并发额度。

传入的通常是可迭代对象，普通值也会按Promise规则处理。数组顺序是聚合结果的关联顺序，不一定是工作完成顺序。识别每个结果属于哪个输入，对批量接口和局部失败恢复尤其重要。

## 四种完成条件与空集合

all在全部成功后按输入顺序返回结果，一项拒绝使聚合Promise拒绝；其它工作仍可能继续。allSettled等待每项都定型，返回带status以及value或reason的结果记录，适合需要报告部分失败的批处理。race采用最先定型的一项，无论成功还是失败；any采用最先成功的一项，全部拒绝时产生AggregateError。

空输入也有契约：all和allSettled得到空结果，any没有任何成功候选而拒绝，race没有候选定型因而保持等待。即使结果已经可确定，注册的then处理仍遵守Promise调度规则，不能把已完成当同步回调。

用race给请求加超时只改变调用方先观察到哪个结果，原请求未必停止。需要同时传递AbortSignal，且明确是否重试及远端副作用状态。用any向多个服务发请求可能提高成功机会，也会增加成本和资源竞争；获胜后对其它候选的取消必须单独设计。

## 组合器改变完成条件，不改变任务启动时刻

构造 Promise 时执行器已经同步运行；把一组已经发出的请求交给 Promise.all 不会重新调度它们。all 的结果顺序按输入顺序而不是完成顺序，第一个拒绝让组合 Promise 拒绝，但其他任务不会自动取消。race 返回最先 settled 的结果，包括拒绝；any 需要最先 fulfilled，全部拒绝才产生 AggregateError。空输入、同步 throw 和非 Promise 值要分别说明。

## 从慢快例子迁移到生产请求

示例中慢请求先列出，结果仍为慢、快，是结果槽位与输入位置绑定，并不是请求串行。增加一个快速失败分支，分别运行 all、allSettled、any、race，记录它们何时返回及剩余任务是否还在耗资源。并发限制需要延迟函数队列，取消需要传递 AbortSignal，deadline 必须覆盖整组等待；这些能力不是更换组合器就自动出现。

## 把机制放到一条完整路径中

```flow
选择聚合契约
全部必须成功｜all保留输入结果顺序
逐项报告成功失败｜allSettled生成结果记录
最先结束或最先成功｜分别使用race或any
管理剩余工作｜取消、重试和成本由应用负责
```

## 配套代码：结果顺序与失败聚合

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

all 保留输入顺序，allSettled 保留每项状态，any 选择首个成功。

```javascript
const slow = new Promise(resolve => setTimeout(() => resolve('慢'), 15));
console.log(await Promise.all([slow, Promise.resolve('快')]));
const settled = await Promise.allSettled([1, Promise.reject('错误')]);
console.log(settled.map(item => item.status));
console.log(await Promise.any([Promise.reject('坏'), Promise.resolve('可用')]));
```

all 的结果按输入排列，与谁先结束不同；allSettled 不因单项拒绝而丢弃其他结果，any 忽略失败直到出现成功或全部失败。

## 从示例走向实际使用

批量保存若每项可独立成功，可收集allSettled并用稳定ID展示失败项，再有针对性重试。若业务必须原子提交多个数据库写入，应使用事务或业务协议，不能用all把多个HTTP成功就称为原子性。

限制并发要传入可延迟启动的任务函数，而不是先创建几千个已经开始执行的Promise再聚合。测试结果顺序、早期拒绝、空输入与取消后的资源回收，尤其避免把错误处理器的恢复值误当作原任务确实成功。
