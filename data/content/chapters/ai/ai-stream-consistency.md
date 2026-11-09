---
{"id":"ai-stream-consistency","moduleId":"ai","title":"AI 流式一致性：重连、去重、版本与完成状态","prerequisites":["ai-application-anatomy","js-promise"],"sources":["agents-state","oa-schema"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识AI 流式一致性

流式一致性要保证用户看到的内容属于正确任务、没有重复或缺口，并且完成状态真实。网络可以重连、事件可以重放，用户也可能重新生成。因此单纯把每段字符串追加到界面，不足以维护可靠结果。

例如旧生成 g1 的最后一个片段在新生成 g2 开始后到达，若没有版本检查，它就会混入新答案。重复重放某个增量则会让文字出现两次。

## 任务版本、事件序号与终态

为每次生成分配 generation，每个事件在该生成内有单调序号。客户端先检查生成身份，再检查序号：已应用且内容相同的事件可忽略，未来序号有缺口则需要补齐，同序号不同内容应视为协议冲突。不能仅按文本内容去重，因为答案本来就可能重复同一个词。

后端保存可恢复事件或足够快照，重连携带最后位置。事件留存过期时返回完整快照与新基线，而不是从任意片段继续。任务最终状态与最终正文应一致，完成事件之后不能再接受普通增量，除非协议显式定义修订版本。

连接关闭可能是正常结束，也可能是代理或网络故障，因此需要明确终态事件或状态查询。费用记录与用户历史应引用同一任务结果版本，避免界面显示成功而后端仍认为运行中。多次上游尝试产生的内容应按策略隔离，不把两个不同答案直接拼接。

## 流连接不等于业务运行

一个回答任务可能经历多次 HTTP 连接，一次连接也可能包含文本、工具和完成事件。应分清 conversation_id、run_id、generation_id 与 event_seq。用户重新生成后，旧连接迟到的内容不能继续写入新答案；界面只有一个 loading 布尔值无法表达这些关系。

网络结束只代表传输结束，不一定意味着任务完成。只有协议约定的终态事件或权威任务查询结果才能把答案标记 completed。断线、取消和超时应保留区别，避免刷新后把半段草稿显示成正式回答。

## 为可恢复事件定义不变量

在同一次 generation 内使用单调递增序号，事件内容不可变；重连可以重复发送已确认事件，客户端按身份和序号去重。如果同序号内容不同，应报告冲突，不能当普通重放忽略。服务端保留事件日志或可重建快照，并说明可恢复窗口。

| 情况 | 客户端行为 | 服务端配合 |
|---|---|---|
| 相同事件重投递 | 幂等忽略 | ID 与内容稳定 |
| 序号出现缺口 | 暂停合并并请求补发/快照 | 保留日志或提供快照 |
| 旧 generation 迟到 | 拒绝更新当前答案 | 每个事件带运行身份 |
| 日志已过期 | 按快照游标重建 | 明确快照版本与边界 |

SSE 的 event id 可以承载恢复游标，但自动重连本身不能替应用实现这些语义。

## 增量、快照与完成状态

delta 必须只追加一次，snapshot 是某个序号后的完整状态，两者不能不加区分地相加。应用快照后只接收游标之后的增量；快照与事件应来自一致边界，否则会丢字或重字。答案状态还应跟随同一版本更新。

```js
if (event.generation !== state.generation) return state;
if (event.seq > state.seq + 1) throw new Error('gap: recover first');
```

这个守卫只是 reducer 的一部分；真实系统还需要验证重复事件内容、支持多种 item、持久化游标以及受控恢复，不宜用一个字符串变量覆盖所有结果。

## 取消与重新生成的竞态

用户停止后应发取消请求，并立即阻止旧 generation 改 UI。后端取消可能来不及阻止已完成的模型或工具调用，成本和业务状态要按实际结果记录。重新生成创建新身份，不复用旧事件序号空间，避免旧 done 关闭新 loading。

多个标签页同步时，不要靠本地到达顺序决定最终答案。服务端任务状态是权威事实，客户端草稿和编辑应有独立版本。保存进度也不能把当前尚未完成的输出写成另一台设备的已完成答案。

## 验收应故意制造坏网络

按不同字节边界拆 SSE 包，模拟连接在首事件前、半个 UTF-8 字符、完整 delta 后和 done 前断开。重放、乱序、缺口、旧运行迟到、取消后返回与日志过期分别测试。检查答案字符无重复、终态一致、旧运行不污染新运行。

记录恢复次数、缺口率、首 token 时间和完成率。若无法提供精确续传，应在 UI 明确重新获取完整结果，而不是假装增量从未丢失。用户体验的可靠性来自明确状态和恢复协议，不只是加一个 reconnect。

## 把机制放到一条完整路径中

```flow
流式一致性
验证身份｜事件必须属于当前生成
验证序号｜去重检查缺口与内容冲突
应用增量｜只在合法运行状态更新正文
确认完成｜持久终态快照与账本保持一致
```

## 配套代码：AI 流式一致性：重连、去重、版本与完成状态

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。



```javascript
function apply(state, e) {
  if (e.generation !== state.generation) return state;
  const fingerprint = JSON.stringify([e.kind, e.text ?? ""]);
  if (e.seq <= state.seq) {
    if (state.seen[e.seq] !== fingerprint) throw Error("event conflict");
    return state;
  }
  if (e.seq !== state.seq + 1) throw Error("event gap");
  if (state.status !== "running") throw Error("already terminal");
  if (!["delta", "done"].includes(e.kind)) throw Error("unknown event");
  return {
    ...state,
    seq: e.seq,
    text: state.text + (e.kind === "delta" ? e.text : ""),
    status: e.kind === "done" ? "done" : "running",
    seen: { ...state.seen, [e.seq]: fingerprint },
  };
}
let state = { generation: "g2", seq: 0, text: "", status: "running", seen: {} };
const event = (seq, kind, text, generation = "g2") => ({
  seq,
  kind,
  text,
  generation,
});
state = apply(state, event(1, "delta", "你"));
state = apply(state, event(1, "delta", "你"));
try {
  apply(state, event(3, "delta", "!"));
} catch (e) {
  console.log(e.message);
}
state = apply(state, event(2, "delta", "好"));
state = apply(state, event(3, "done"));
state = apply(state, event(4, "delta", "旧", "g1"));
console.log({ text: state.text, seq: state.seq, status: state.status });
```

缺口出现时 reducer 不修改状态；同事件重放去重，旧 generation 忽略，只有 done 事件将状态转为完成。可修改重复内容验证冲突。

## 从示例走向实际使用

用重复、乱序、缺失、冲突与旧 generation 事件驱动状态机，检查每种情况的确定行为。恢复测试应在真实代理与页面刷新下执行。

课内 apply 函数展示严格序号与终态检查，后续实现需要控制 seen 记录的容量，并根据快照协议安全裁剪历史。
