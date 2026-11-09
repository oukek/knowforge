## 为什么异步操作需要 Promise

假设你点“查看订单”，网络请求可能稍后成功，也可能断网失败。调用请求函数时，结果尚未到达，不能像 `const sum = 1 + 2` 一样立刻拿到订单。Promise 提供一个对象，让调用者登记“成功后怎么处理”和“失败后怎么处理”。**它代表一次操作的最终结果，不是结果本身，也不是新线程。**

先认识两个角色：生产结果的一方调用 `resolve` 或 `reject`；消费结果的一方使用 `then`、`catch` 或 `await`。把这两方分开，就不必让每一层函数都额外接收成功与失败回调。多数业务已有 Promise API，可以直接调用；只有封装传统回调接口时才需要自己 `new Promise`。

## 三种状态逐个说明

| 状态 state | 中文含义 | 有没有最终结果 | 对应处理 |
| --- | --- | --- | --- |
| `pending` | 等待中，尚未成功也尚未失败 | 暂无 | 已注册的处理器等待结果 |
| `fulfilled` | 已成功完成 | 保存成功值 value，可以是 `undefined` | 调用成功处理器 `onFulfilled(value)` |
| `rejected` | 已失败 | 保存失败原因 reason，通常用 Error | 调用失败处理器 `onRejected(reason)` |

合法转移只有 `pending → fulfilled` 或 `pending → rejected`。成功和失败统称 **settled（已定型）**，settled 不是第四种状态。已经 fulfilled 的同一个 Promise 不能再变为 rejected；失败后要重试，应发起新操作并创建新 Promise，而不是把旧 Promise 改回 pending。

浏览器开发者工具可能显示内部状态，但标准 Promise 没有公共的 `p.status` 或 `p.state` 属性供业务同步读取。`Promise.allSettled` 返回的结果记录才带 `status: 'fulfilled'` 或 `status: 'rejected'`。不能把结果记录与 Promise 实例混为一谈。

## 从创建到成功：逐行跟踪

```javascript
const p = new Promise((resolve, reject) => {
  console.log('开始办理');
  resolve('订单 42');
  console.log('仍会执行');
  reject(new Error('太晚了'));
});
p.then(value => console.log('收到', value));
console.log('继续做别的事');
```

1. `new Promise` 先创建 pending 状态的对象，立即调用传入的函数。这个函数叫 **executor（执行器）**，不是异步回调，因此马上打印“开始办理”。
2. `resolve('订单 42')` 接收普通值，使 p 成功，成功值为这个字符串。
3. `resolve` **不是 return**，执行器继续打印“仍会执行”。后来的 reject 不能再改变 p。
4. `then` 登记成功处理器。即使 p 已成功，处理器也不会立即插进当前代码运行，而是安排为微任务。
5. 同步打印“继续做别的事”，之后才打印“收到 订单 42”。

因此输出顺序是“开始办理 → 仍会执行 → 继续做别的事 → 收到 订单 42”。状态定型与处理器执行是两个不同时间点。下面的课内编辑器还有错误恢复示例；可以把上面这段复制进去运行。

## 失败如何出现，如何被接住

显式调用 `reject(error)` 会拒绝 Promise；执行器中未捕获的同步 `throw` 也会拒绝它。`catch(onRejected)` 相当于 `then(undefined, onRejected)`，它不是在同步调用栈外面包一层普通 try/catch，而是在链上登记失败处理器。

```javascript
const value = await Promise.reject(new Error('断网'))
  .catch(error => {
    console.log(error.message);
    return '本地缓存';
  });
console.log(value);
```

先输出“断网”，再输出“本地缓存”。最初的 Promise 仍是 rejected；是 **catch 返回的新 Promise** 因为处理器返回普通值而 fulfilled。这解释了“失败后恢复”为什么没有违反状态不可逆。

`new Promise` 的同步异常捕获不能跨越定时器：执行器安排 `setTimeout(() => { throw error })` 后已经返回，定时器里的异常需要在那个回调中捕获并调用 reject。不要写 `new Promise(async (...) => ...)`：async 执行器会返回额外 Promise，其拒绝并不会自动接入外层 Promise 的拒绝通道。

## then 为什么能链起来

每次 `then` 都产生新的 Promise，后续处理的是新结果。对 `const q = p.then(handler)`，可用下面的表判断 q：

| handler 的行为 | q 的结果 |
| --- | --- |
| 返回普通值 `7` | 成功，值为 7 |
| 没有 return | 成功，值为 undefined |
| 抛出异常 | 失败，原因为该异常 |
| 返回 Promise 或 thenable | 采用其最终结果 |
| 未提供匹配当前状态的处理器 | 透传 p 的成功值或失败原因 |

例如 `Promise.resolve(2).then(x => x * 3).then(x => x + 1)` 最后得到 7。把中间处理器改成 `{ x * 3 }`，没有 return，下一步就会算 `undefined + 1`，得到 NaN。这是链式业务中经常发生的“忘了 return”。

`p.then(success, failure)` 的 failure 处理的是 p 的拒绝，不会处理同一次 then 的 success 内部抛错。若需要接住 success 的异常，应在返回的新 Promise 后接 `.catch(failure)`。

## resolve 不总意味着已经 fulfilled

如果传给 resolve 的是尚未完成的 Promise，外层将跟随它：外层的命运已经锁定，但内部状态仍可能 pending。**resolved（结果已由解析过程确定或锁定）与 fulfilled（已成功）不是同义词。**

```javascript
let finish;
const inner = new Promise(resolve => { finish = resolve; });
const outer = new Promise((resolve, reject) => {
  resolve(inner);
  reject(new Error('不再生效'));
});
outer.then(value => console.log(value));
finish(8);
```

外层不会因为随后的 reject 失败，而会在 inner 成功后输出 8。如果 inner 拒绝，outer 也拒绝。thenable 指具有可调用 `then` 的对象；标准解析会尝试采用它的结果，并处理读取 then 抛错、重复调用、自解析等边界。入门阶段先理解“返回另一项异步任务就等待它”，再学习完整解析算法。

## finally、取消与 HTTP 状态不要混淆

`finally` 用于关闭 loading、释放资源等收尾，不接收成功值或失败原因。它返回普通值通常不替换原结果；若它抛错或返回拒绝的 Promise，才会让后续转为失败。原本成功 7，`finally(() => 99)` 后仍是 7。

Promise 没有内置的通用 `cancel()`。取消 fetch 通常向实际操作传 AbortSignal；取消订阅、取消底层工作和停止在界面展示结果是不同职责。

HTTP 404 是响应状态码，不等于 Promise 的 rejected 状态。fetch 收到可用的 404 响应通常仍 fulfilled；业务需检查 `response.ok` 并决定是否抛错。网络失败、取消等才可能直接让 fetch 拒绝。否则“接口报 404 却没进 catch”会被误判为 Promise 出了问题。

## 先思考，再核对

**问题 1：** `Promise.reject('错').catch(() => 0).then(x => x + 1)` 最后是什么状态、什么值？

解析：最初拒绝，catch 返回 0 让新 Promise 成功，再经过加 1，最终 fulfilled，值为 1。最初那一份 Promise 没被修改。

**问题 2：** `Promise.resolve(1).then(() => { throw Error('错') }, () => 2)` 会成功为 2 吗？

解析：不会。同一个 then 的失败处理器不是成功处理器的 catch；返回的新 Promise rejected。之后再接 catch 才能处理。

**问题 3：** 某请求的 Promise pending 十分钟，是不是一定会自动超时？

解析：不会。Promise 不自动提供超时。需要对底层请求设截止时间、协作取消并做清理；单纯 race 一个超时 Promise 只改变外层等待结果，不会自动停止原请求。
