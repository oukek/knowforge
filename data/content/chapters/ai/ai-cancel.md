---
{"id":"ai-cancel","moduleId":"ai","title":"停止生成、恢复与流式状态机","prerequisites":["ai-application-anatomy","js-promise"],"sources":["sse","fetch"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识停止生成、恢复与流式状态机

停止生成包含界面、连接、后端任务和上游调用多个层次。前端停止追加文字，只是停止展示；关闭浏览器请求，也不保证后端或上游已经停止工作。产品应明确取消请求何时被接受、何时真正完成。

用户连续发起两次生成时，还会出现旧请求晚到的问题。即使旧连接正在关闭，已经排队的回调仍可能执行，因此需要任务版本保护。

## 取消意图与结果有效性

每次生成分配独立 generation 或 taskId，所有增量与完成事件都带相应身份。前端只接受当前任务的事件，避免旧结果覆盖新内容。AbortController 用来通知支持取消的网络操作，但身份检查仍不可省略，因为取消与响应可能竞争。

后端将取消意图记录到任务状态，并传播给当前上游与工具。某些操作不能立即中止，或已经产生副作用，此时应等待确认、停止后续步骤或进行补偿，不能立即伪报 cancelled。取消后的计费与部分结果保留需要清楚契约。

恢复也分两种：重连观察同一任务，与重新执行一个新任务。前者应读取已有事件或快照，后者可能产生新的输出与费用。界面按钮文案与后端接口应让这两种行为可区分，避免用户以为“重试连接”却又调用了一次模型。

## 把机制放到一条完整路径中

```flow
生成取消
发出意图｜用户请求停止当前任务
传播中断｜前后端通知相关执行资源
过滤旧事件｜按任务与生成版本检查有效性
确认终态｜记录实际停止完成及费用结果
```

## 配套代码：取消后忽略上一轮晚到结果

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

generationId 防止旧结果落到新会话；真实终止后端计算还需要取消传播。

```javascript
let generation=0,text='';
const old=++generation;
function append(id,chunk) { if(id===generation) text+=chunk; }
append(old,'A');
generation++;
append(old,'旧结果');
append(generation,'B');
console.log(text);
const controller=new AbortController();controller.abort();
console.log(controller.signal.aborted);
```

序号校验屏蔽旧 chunk，AbortSignal 标记客户端取消。aborted 为 true 不证明供应商计算或计费已结束，网关需传播取消或确认服务端终止。

## 从示例走向实际使用

测试停止后立刻重开、旧终态晚到、网络断开但任务继续，以及取消与完成同时发生。状态机应只接受合法转换，结果与使用量记录一致。

课内 generation 检查展示旧增量被忽略；真实取消还需后端持久状态与上游协作，不能只实现一个前端布尔开关。
