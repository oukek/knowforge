---
{"id":"ai-sse-parser","moduleId":"ai","title":"流式解码、SSE 分帧与异常结束","prerequisites":["ai-application-anatomy","js-promise"],"sources":["sse","fetch"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识流式解码、SSE 分帧与异常结束

SSE 是按文本行组织的事件流，多个 data 行组成事件数据，空行结束一个事件。它使用 UTF-8，但底层网络可以在任意字节位置切块。因此解析需要先增量解码字节，再处理行与事件，不能把网络块直接当事件。

例如“你好”的某个字节序列可能被拆开，data: 也可能被拆成 da 与 ta:。正确解析结果不应取决于网络怎样分块。

## 三层缓冲与结束语义

字节解码器保留未完成的多字节字符，行解析器保留尚未遇到换行的文本，事件解析器收集 data、event 与 id 等字段。CR、LF 与 CRLF 需要正确处理，注释行不作为业务数据。多条 data 行按协议组合，而不是简单相邻字符串拼接。

事件完整后再解析其中 JSON，并区分未知事件、业务错误与协议错误。id 用于恢复位置，但服务端必须实现相应重放能力；客户端记住 ID 不会自动让服务器保存历史。retry 等协议字段与应用重试预算也要按实现范围明确。

流结束不等于业务成功。未由事件分隔完成的残余内容不能随意当完整事件提交，任务还应有明确完成事件或可查询终态。若正文被截断、JSON 不完整或序号有缺口，应显示可恢复的异常状态，避免把半段回答保存成完整答案。

## 把机制放到一条完整路径中

```flow
SSE 解析
增量解码｜字节恢复为完整 UTF-8 字符
行边界处理｜保留跨块残余并识别换行
事件组装｜收集字段遇空行派发
业务验证｜校验JSON序号与明确终态
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

逐字符喂入 SSE 解析器，验证跨块 CRLF、多行 data 与 id。

```javascript
function createSSEParser(onEvent) {
  let line='',data=[],event='',id='',skipLF=false;
  function consume(s){
    if(s===''){if(data.length)onEvent({event:event||'message',data:data.join('\n'),id});data=[];event='';return}
    if(s[0]===':')return;
    const i=s.indexOf(':'),key=i<0?s:s.slice(0,i);
    let value=i<0?'':s.slice(i+1);if(value[0]===' ')value=value.slice(1);
    if(key==='data')data.push(value);else if(key==='event')event=value;else if(key==='id'&&!value.includes('\0'))id=value;
  }
  return {
    push(text){for(const c of text){if(skipLF){skipLF=false;if(c==='\n')continue}if(c==='\r'){consume(line);line='';skipLF=true}else if(c==='\n'){consume(line);line=''}else line+=c}},
    end(){line='';data=[];event='';skipLF=false}
  };
}


const events=[];
const parser=createSSEParser(event=>events.push(event));
for(const char of 'id: 7\r\ndata: 你\r\ndata: 好\r\n\r\n') parser.push(char);
console.log(events.length);
console.log(events[0].id);
console.log(events[0].data.split('\n'));
```

解析器先组行再组事件，网络块边界不参与派发。此实验假设字节已正确 UTF-8 解码，完整链路还要限制缓冲大小并处理 retry/BOM 等契约。

## 从示例走向实际使用

把同一 SSE 文本按每个字符、随机字节边界和整块输入，比较事件结果一致。测试多行 data、注释、CRLF、重复 ID 与残缺结尾。

课内解析器接收已解码文本，实际 fetch 链路前面还需流式 TextDecoder。它是应用所需字段的教学实现，不能未经扩展就声称覆盖全部 EventSource 行为。
