---
{"id":"js-promise-handwrite","moduleId":"js","title":"教学 Promise：最小状态机与规范差距","prerequisites":["js-promise","js-event-loop"],"sources":["mdn-js","ecma","tutorial-promise"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识教学 Promise

手写Promise不是把setTimeout包装成对象，而是在实现一个一次性结果状态机。需要保存pending、fulfilled、rejected状态，最终值或原因，以及等待结果的处理器队列。状态定型后不能反转，多个订阅者都应得到同一个最终结果，但每次then还必须返回一份新的Promise。

学习目标可以分层：先实现状态与订阅，再实现异步调度，再实现链式返回和thenable解析。每层有明确契约，才能知道一个简化实现到底少了什么。

## 状态转换、反应队列和解析过程

executor应同步执行，内部同步异常转成拒绝；then处理器在约定的异步调度中执行，即使原Promise早已成功也不能直接插入当前调用栈。成功与失败处理器分别读取结果，未提供处理器时需要透传相应状态。

处理器返回普通值使新Promise成功，抛错使新Promise失败，返回Promise或thenable则要采用其结果。解析过程必须防止Promise解析为自身，读取then属性也可能抛错；一个不规范thenable可能同时调用成功和失败回调，必须只接受首次有效决议。仅用instanceof本地Promise判断会漏掉跨realm和其它thenable。

resolve被传入尚未完成的Promise时，会锁定跟随关系，但外层内部状态可能仍pending。若代码只靠state===pending控制首次调用，后来的reject可能错误覆盖已锁定的解析，这需要单独的决议保护。finally、组合器、迭代器异常和未处理拒绝追踪则属于更大规范范围，不能默认教学版已经覆盖。

## 把机制放到一条完整路径中

```flow
一次then链处理
原Promise定型｜保存唯一最终值或原因
安排对应处理器｜不在注册时同步执行
解释处理器结果｜普通值、异常或thenable
解析新Promise｜防自解析与重复决议
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

最小 deferred 状态机：微任务订阅和单向状态变化。

```javascript
function createDeferred() {
  let state='pending',value,list=[];
  function flush(){if(state==='pending')return;const tasks=list;list=[];for(const run of tasks)queueMicrotask(run)}
  function settle(next,x){if(state!=='pending')return;state=next;value=x;flush()}
  const promise={then(onFulfilled,onRejected){return new Promise((resolve,reject)=>{list.push(()=>{const cb=state==='fulfilled'?onFulfilled:onRejected;if(typeof cb!=='function'){(state==='fulfilled'?resolve:reject)(value);return}try{resolve(cb(value))}catch(e){reject(e)}});flush()})}};
  return {promise,resolve:x=>settle('fulfilled',x),reject:e=>settle('rejected',e)};
}


const deferred = createDeferred();
const value = deferred.promise.then(number => {
  console.log('then', number);
  return number + 1;
});
deferred.resolve(4);
deferred.resolve(99);
console.log('同步');
console.log(await value);
```

resolve 第一次后状态固定，第二次不生效；then 通过微任务执行，返回的新原生 Promise 采用回调结果。这不是完整 Promise/A+ 实现。

## 从示例走向实际使用

测试必须针对状态机不变量：多次resolve/reject、先订阅后完成、先完成后订阅、链式抛错、自解析和恶意thenable。使用确定的微任务安排检验顺序，不能只检查最终打印了哪个数。

生产优先使用原生Promise。面试提交时明确哪些行为按标准实现、哪些省略，并解释省略会影响什么，而不是以通过两三个样例声称完整兼容。
