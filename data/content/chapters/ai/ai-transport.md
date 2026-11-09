---
{"id":"ai-transport","moduleId":"ai","title":"SSE、EventSource 与 WebSocket 选型","prerequisites":["ai-application-anatomy","js-promise"],"sources":["sse","fetch"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识SSE、EventSource 与 WebSocket 选型

AI 任务需要把执行状态与逐步生成的内容送到前端。轮询让客户端定期询问，SSE 让服务器沿 HTTP 响应单向推送，WebSocket 支持双向消息。选择应基于交互方向、恢复需求和部署环境，而不是认为实时就必须使用 socket。

主观题评阅通常是提交一次任务、服务器持续报告阶段与结果，单向事件流就可能足够；实时语音等持续双向交互则有不同要求。

## 传输能力与业务协议分开

原生 EventSource 管理 SSE 连接和重连，但接口定制能力有限，例如不能像 fetch 一样任意设置方法和请求头。使用 fetch 读取响应流更灵活，却需要自己处理解码、分帧和重连。WebSocket 建立双向通道后，同样需要鉴权、心跳、消息结构与恢复协议。

网络读取到的 chunk 不是一条完整业务消息。一个事件可能跨多个块，多条事件也可能合并到一块。前端应先按协议解析完整事件，再更新任务状态，不能对每个块直接 JSON.parse。

代理缓冲、空闲超时和连接数量会影响流式体验。服务端需要及时发送阶段或心跳，部署层允许逐步转发；客户端则区分连接暂断与任务失败。无论哪种传输，持久任务状态都是恢复依据，不能把一次连接当成任务唯一真相。

## 把机制放到一条完整路径中

```flow
实时任务传输
定义事件｜状态内容与终态使用明确协议
选择通道｜轮询SSE或双向WebSocket
部署验证｜检查缓冲超时与认证方式
断线恢复｜按持久任务和事件序号继续
```

## 配套代码：文本流字节分块不保留事件边界

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

同一段 SSE 文本可以被拆成任意字符串块，不能将块直接视作消息。

```javascript
const event='data: A\n\ndata: B\n\n';
const chunks=[event.slice(0,3),event.slice(3,12),event.slice(12)];
console.log(chunks.length);
console.log(chunks.join('')===event);
console.log(event.split('\n\n').filter(Boolean));
```

三个传输块仍只包含两个事件。最后一行仅用于完整已知 LF 文本的对照，不是生产解析器；真实流还要跨块解码、多行 data 与 CRLF/CR 状态。

## 从示例走向实际使用

先定义 queued、running、delta、completed 和 failed 等业务事件，再选传输。用真实反向代理验证首事件时间、长时间空闲与重连，避免本地流式正常而线上全部攒到最后返回。

课内字符串切块展示传输边界与事件边界独立。下一课进一步实现 SSE 分帧。
