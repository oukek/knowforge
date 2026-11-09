---
{"id":"js-rate-limit","moduleId":"js","title":"防抖与节流：从连续事件到可取消的函数封装","prerequisites":["js-closure","js-event-loop"],"sources":["ecma","html-loop"]}
---
## 为什么输入一次文字，却可能执行很多次工作

用户把“北京”输入搜索框，输入法、逐字修改和删除都可能产生连续事件。如果每收到一次事件就请求接口，短时间会创建很多实际上已经过时的查询。滚动时也会不断产生事件，若每次都进行昂贵计算，主线程就可能来不及处理下一帧。这里要控制的是“昂贵工作什么时候执行”，不是禁止浏览器继续收到事件。

防抖（debounce）把一段密集调用合并：每次新调用都重新开始等待，等连续一段时间没有新调用，再执行最后一次。像等对方说完一句话再回答，关注的是安静窗口。节流（throttle）则允许持续调用期间周期性执行，约束执行频率；像每隔一段时间报告一次位置，即使输入一直没有停，也不会一直沉默。

两者不能互换。搜索通常关心最后输入，适合尾部防抖；持续拖动时希望不断显示最新位置，可能需要节流或按动画帧合并。支付、防重复下单等业务正确性不能靠这两种前端技巧保证，服务端仍要有幂等与授权。

## 用具体时间线比较，而不是背两个名字

假设等待窗口是300ms，调用发生在0、100、200、450、800ms。以下采用“只在尾部执行的防抖”和“只在窗口开头执行的节流”，先把选项固定，才能讨论行为。

| 到达的调用 | 尾部防抖怎样处理 | 首部节流怎样处理 |
| --- | --- | --- |
| 0ms | 计划300ms执行 | 立即执行，开启窗口 |
| 100ms | 取消旧计划，改到400ms | 距上次不足300ms，略过 |
| 200ms | 改到500ms | 仍略过 |
| 450ms | 改到750ms | 已超过300ms，执行 |
| 800ms | 上次约750ms已执行，新计划1100ms | 距上次350ms，执行 |

因此防抖大致执行在750、1100ms，首部节流大致执行在0、450、800ms。实际计时器可能因线程繁忙晚于计划，不会保证精确实时。若需求要求节流窗口结束时补上最新值，就需要trailing选项；只保留首部的实现会丢掉窗口内最后一次调用。

```flow
收到一次新调用后怎样选择
希望等输入暂时停下｜使用防抖，重置安静窗口
希望持续过程中仍更新｜使用节流或合适的动画帧调度
需要立即反馈第一下｜定义 leading 行为
需要保留最后一次意图｜定义 trailing、flush 或持久化策略
组件或任务不再存在｜取消待执行工作，另行处理已发出的请求
```

## 从闭包写出一个尾部防抖函数

包装函数需要跨多次调用保存计时器、最新参数和调用时的this，这正是闭包保存环境的用途。每次调用清掉旧计时器，再保存新的调用信息；真正执行时先清空内部状态，再调用业务函数，避免业务函数内部再次调用包装器时被旧状态覆盖。

```javascript
function debounce(fn, wait) {
  let timer = null;
  let args = null;
  let receiver;
  function invoke() {
    const currentArgs = args;
    const currentReceiver = receiver;
    timer = null;
    args = null;
    receiver = undefined;
    return fn.apply(currentReceiver, currentArgs);
  }
  function wrapped(...nextArgs) {
    if (timer !== null) clearTimeout(timer);
    args = nextArgs;
    receiver = this;
    timer = setTimeout(invoke, wait);
  }
  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    args = null;
    receiver = undefined;
  };
  wrapped.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    return invoke();
  };
  return wrapped;
}
```

本例约定wait是有限且非负的毫秒数，采用trailing-only，不实现leading或maxWait，也不把每次调用包装成独立Promise。wrapped立即返回时，真正业务尚未执行，不能期待它同步返回未来查询结果；flush则执行当前待处理调用并返回那次fn的返回值。若fn返回Promise，调用方仍需处理它的失败，计时器不会自动代管所有异步错误。

普通函数用于保留调用时this，不能随意把wrapped改成箭头函数后仍宣称支持动态this。cancel清除尚未执行的计划，不能撤销已经执行的函数；如果fn已发网络请求，需要单独的AbortController和结果有效性判断。

## 写一个行为明确的首部节流

下面不使用尾部计时器，而是记录上一次允许执行的时间。首次调用立即执行，之后只有间隔达到wait才接受下一次。now参数提供单调时间来源，也让测试能够直接控制时间，无需真实等待。

```javascript
function throttleLeading(fn, wait, now = () => performance.now()) {
  let previous = -Infinity;
  function wrapped(...args) {
    const time = now();
    if (time - previous < wait) return;
    previous = time;
    return fn.apply(this, args);
  }
  wrapped.cancel = () => { previous = -Infinity; };
  return wrapped;
}
```

这个cancel重置窗口，使下一次调用可立即执行；它没有待取消的尾部任务。真正需要leading与trailing组合时，要保存窗口内最新参数，安排尾部执行，并明确单次调用是否会重复执行首尾。不要给接口提供几个选项名字，却没有写清各组合的时间行为。

节流也不等于限制同时进行的请求数量。如果请求耗时两秒而每300ms发一个，仍可能有多个请求在途；需要限制并发时使用队列或信号量，需要保证顺序时设计串行执行或版本核对。

## 搜索、滚动与自动保存如何落地

搜索防抖只减少发起次数，旧请求仍可能在新请求后返回。应为每次有效搜索关联版本，或在输入变化时使旧响应失效，并尽可能取消旧请求。浏览器取消等待不保证服务器没有执行，写入操作尤其需要幂等。

滚动更新若只是改变画面，可以用requestAnimationFrame合并到合适的渲染机会；它不是固定16ms的通用节流计时器，刷新率和页面可见性会改变安排。回调里仍需避免大量同步计算和交替读写布局，调度方式不能使昂贵工作免费。

自动保存应先建立可靠草稿，再用防抖控制远端频率。页面关闭时尝试flush或发送小请求只能作为补充，不能保证网络一定完成。长时间持续编辑时普通防抖可能一直不触发，maxWait用于限制最长等待；离开页面、切换文档与版本冲突则需独立处理。

## 怎样测试封装真的符合契约

测试用可控时钟推进到边界前、边界上和边界后，分别检查是否执行、用了哪次参数、this是否保留。还要覆盖取消后不执行、flush只执行一次、执行中再次调用以及持续输入。真正的业务集成测试再验证组件卸载清理、搜索乱序和失败提示。

把“防抖会少执行一些”当测试目标过于模糊。需要写成明确契约：例如最后一次输入后安静300ms才提交、连续输入最长两秒也至少保存一次、旧文档的保存结果不能覆盖新文档。选择算法前先写出这些规则，代码才有可以验证的标准。
