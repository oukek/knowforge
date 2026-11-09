---
{"id":"ai-context","moduleId":"ai","title":"上下文窗口、摘要与历史管理","prerequisites":["ai-application-anatomy","js-promise"],"sources":["sse","fetch"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识上下文窗口、摘要与历史管理

长对话管理决定每轮模型看见哪些内容。界面历史是用户记录，模型上下文是一次推理的输入，两者不必完全相同。为了控制窗口与成本，应用可能保留最近轮次、摘要旧内容或检索相关片段。

裁剪不能只按数组长度删除开头，因为最早消息里可能有任务约束，而中间还有工具调用与结果需要配对。

## 按语义单元管理历史

把一轮用户输入、模型回应和相关工具往返视为可理解单元，裁剪时保持协议合法。系统规则与当前任务状态单独保存，不能依赖它们恰好出现在最近几条聊天里。预算计算包含消息结构、工具定义与输出预留，而不只用户正文。

摘要记录稳定事实、已作决定、未完成步骤与来源，不把推测变成事实。用户修改要求后，旧摘要需要更新或标记失效；否则模型可能同时收到新要求与旧总结。对需要精确原文的内容，如代码和金额，摘要不能无损替代。

历史存储应按用户和任务关联，支持查询与删除。发送给模型的范围比存储范围更小，调试时可以记录选择策略与版本，而不是无限复制敏感内容。上下文不足应表现为明确可恢复状态，不要假装模型已经看过未发送材料。

## 把机制放到一条完整路径中

```flow
历史到本轮输入
保存原记录｜按用户任务保留完整历史
提取状态｜保留当前约束决定与待办
选择上下文｜按轮次摘要与检索控制预算
验证协议｜检查工具配对与信息缺失
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

按完整轮次保留最新后缀，并先预留系统预算。

```javascript
function trimHistory(messages,budget) {
  const system=messages[0]?.role==='system'?[messages[0]]:[];
  let used=system[0]?.tokens||0;
  if(used>budget)throw new RangeError('budget');
  const groups=[];
  for(const m of messages.slice(system.length)){if(m.role==='user')groups.push([]);if(!groups.length)throw new TypeError('orphan assistant');groups[groups.length-1].push(m)}
  const selected=[];
  for(let i=groups.length-1;i>=0;i--){const cost=groups[i].reduce((s,m)=>s+m.tokens,0);if(used+cost>budget)break;used+=cost;selected.unshift(groups[i])}
  return [...system,...selected.flat()];
}


const history=[
 {role:'system',tokens:2,id:'system'},
 {role:'user',tokens:3,id:'old-user'},
 {role:'assistant',tokens:3,id:'old-answer'},
 {role:'user',tokens:2,id:'new-user'},
 {role:'assistant',tokens:2,id:'new-answer'}
];
console.log(trimHistory(history,7).map(message=>message.id));
console.log(trimHistory(history,2).map(message=>message.id));
```

预算 7 扣除系统 2 后只装下最新完整轮次 4；预算 2 只剩系统。真实上下文还需准确 tokenizer 和工具调用/结果配对，不能任意切断消息结构。

## 从示例走向实际使用

设计一个含最初约束、工具结果和后续修正的长对话，逐步减小预算，检查保留内容是否仍足以执行当前任务。

课内 trimHistory 只覆盖 system 与成组 user/assistant 的简化场景，不包含完整工具协议。真实系统应在同样思想上实现专用消息分组与状态保存。
