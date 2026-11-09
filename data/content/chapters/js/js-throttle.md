---
{"id":"js-throttle","moduleId":"js","title":"手写节流：首尾语义与时间线","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识手写节流

节流把持续到来的调用限制在一定频率内，适合滚动采样、拖动状态上报等场景。它不同于等待安静窗口的防抖：输入一直发生时，节流仍应按约定持续提供执行机会。所谓“每300ms执行一次”还不完整，必须说明第一下是否立即执行、窗口内最后一次是否补执行。

leading表示窗口开头执行，trailing表示尾部补上最近一次调用。不同库对边界时点和只有一次调用的组合处理可能不同，因此手写前先写时间线和参数归属，再实现计时器。

## 时间戳与尾部计时器如何配合

只用时间戳可实现首部节流：记录上次允许执行的时间，间隔不足时忽略。它没有尾部补偿，停止拖动前最后一个坐标可能没被处理。只用尾部计时器则会延后首次反馈，适合的交互不同。完整组合通常需要记录窗口、最新args和this，以及唯一待执行计时器。

收到新调用时先计算距离允许执行还有多久；可立即执行则清理不再需要的旧计时器并更新窗口，否则保存最新参数并确保最多安排一个尾部任务。尾部执行后应同步更新状态，避免同一个事件被立即路径和计时器路径各执行一次。业务函数内部再次调用包装器也可能发生，因此调用前后的状态清理顺序需要设计。

cancel清除待执行任务并按契约重置窗口，flush立即执行已保存的尾部意图。两者不取消已经运行的函数，更不回滚远端写入。时间计算适合单调时钟，系统墙钟变化不应使间隔突然变成负值。浏览器调度繁忙时计时器会延后，所以它是频率控制而不是硬实时保证。

## 把机制放到一条完整路径中

```flow
首尾节流的工作路径
收到调用｜保存最新参数和this
判断当前窗口｜允许立即执行还是需要等待
维护唯一尾部任务｜避免重复计时与遗漏最后意图
执行或取消后清理｜保持窗口和资源状态一致
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

首个调用立即执行，窗口内只保留最后一次尾调用。

```javascript
function throttle(fn,wait) {
  let last=0,timer=null,args,context;
  function execute(){last=Date.now();timer=null;const a=args,c=context;args=context=undefined;fn.apply(c,a)}
  function wrapped(...next){args=next;context=this;const remaining=wait-(Date.now()-last);if(!last||remaining<=0){if(timer)clearTimeout(timer);execute()}else if(!timer)timer=setTimeout(execute,remaining)}
  wrapped.cancel=()=>{if(timer)clearTimeout(timer);timer=null;last=0;args=context=undefined};
  return wrapped;
}


const output = [];
const report = throttle(value => output.push(value), 25);
report(1); report(2); report(3);
console.log(output);
await new Promise(resolve => setTimeout(resolve, 60));
console.log(output);
report.cancel();
```

leading 立即输出 1；窗口内 2 被 3 替换，尾部只输出 3。计时器延迟是最早执行机会，不承诺所有设备准点。

## 从示例走向实际使用

画出0、100、200、450ms等到达点，分别验证四种leading/trailing组合，再验证恰好边界、取消、flush和重入。输出结果之外还要检查调用次数、参数和接收者。

动画更新可考虑requestAnimationFrame，但它依赖渲染机会而非固定16ms。若业务还要限制在途网络数，应增加并发管理；节流控制发起频率，不能单独保证后端不过载。
