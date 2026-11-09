---
{"id":"perf-weaknetwork","moduleId":"performance","title":"弱网：超时、重试、退避与降级","prerequisites":["net-navigation","js-event-loop"],"sources":["vitals"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识弱网

弱网不只是带宽低，还可能有高延迟、丢包、连接切换和短时断网。一个请求失败后，客户端有时无法判断服务端是否已经执行成功，这使重试成为业务协议问题，而不只是再调用一次 fetch。

用户在地铁里提交答案，响应丢失后再次点击。如果接口没有幂等设计，可能重复计费或重复记录；如果完全不允许重试，用户又无法恢复操作。

## 超时、退避与降级各自承担的职责

超时限制等待多久，重试决定哪些失败值得再尝试，退避决定下一次尝试何时发生。指数退避逐渐拉长间隔，随机抖动减少大量客户端同时重试。还应遵守服务端的重试提示，并设置总时间预算，避免每次尝试都重新获得完整超时。

不是所有错误都应重试。参数错误、权限不足通常需要用户或程序修改请求；临时网络故障和部分服务不可用可能适合重试。写请求必须有幂等键或其他去重机制。取消与过期任务不应继续后台重试，否则用户已经换了页面，旧任务仍消耗资源。

降级是在当前条件下提供较小但真实可用的能力，例如显示已缓存内容并注明更新时间、降低图片规格或允许保存本地草稿。不能把服务失败伪装成空数据或保存成功。离线提交应明确显示待同步状态，待服务器确认后才转为已完成。

## 把机制放到一条完整路径中

```flow
弱网请求恢复
首次请求｜建立幂等身份与总预算
失败分类｜判断是否可恢复与可重试
等待退避｜加入抖动并响应取消
结果呈现｜确认成功或提供明确降级
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

只对允许恢复的错误重试，并保留尝试次数。

```javascript
async function retryTask(task,{maxAttempts,delayMs=0,shouldRetry=()=>true}) {
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw new RangeError('maxAttempts');
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await task(attempt)}catch(error){if(attempt===maxAttempts||!shouldRetry(error,attempt))throw error;await new Promise(r=>setTimeout(r,delayMs))}
  }
}


let calls=0;
const result=await retryTask(attempt=>{
  calls++;
  if(attempt<3) throw new Error('暂时失败');
  return '成功';
},{maxAttempts:3,delayMs:5,shouldRetry:()=>true});
console.log(result,calls);
```

两次失败后第三次成功，最大尝试数包含首次调用。真实请求还需幂等、随机抖动、总时限与取消；不是所有错误都适合重试。

## 从示例走向实际使用

用网络限速、断连和响应丢失模拟真实故障，检查是否存在重试风暴、重复提交与永久加载。重试按钮要显示当前状态，并允许用户取消。

课内函数展示有限尝试与错误分类入口；生产实现还需抖动、截止时间和中断信号。不要因为示例使用固定短延时，就在真实服务中无间隔密集重试。
