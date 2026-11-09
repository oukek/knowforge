---
{"id":"design-chat","moduleId":"design","title":"系统设计：实时聊天与消息状态机","prerequisites":["rest-resources","rest-idempotency"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识系统设计

实时聊天系统要管理的不只是消息文本，还包括发送过程、服务端确认、排序、重连和多设备同步。用户点击发送后，本地可以立即显示一条“发送中”消息，但这不等于服务器已经持久保存，更不等于对方已经阅读。

将发送中、服务器已接受、已送达和已读区分开，界面才能准确表达事实，失败重试也不会制造多条看起来相同的消息。

## 身份、序号与状态机

客户端发送前生成稳定 clientMessageId，重试沿用同一个 ID；服务端按会话与发送者作用域去重，并返回 serverMessageId。客户端用确认结果更新原来的本地消息，而不是再追加一条。若响应丢失但服务端已保存，重试仍应得到同一业务结果。

消息顺序不应仅依赖客户端时钟。服务端可为会话维护单调序号，客户端据此去重、排序与发现缺口。WebSocket 提供连接内的数据传输，但连接断开后仍需应用层同步协议，例如携带最后已确认序号拉取遗漏消息。

状态转换要有方向和依据：服务端接受来自持久化确认，送达来自接收端确认，已读来自相应阅读事件。撤回、编辑和删除可以表示为带版本的事件，避免旧同步结果覆盖新状态。大规模群聊的顺序、扇出与已读范围需要按业务要求取舍，不必承诺全局所有消息一个总顺序。

## 把机制放到一条完整路径中

```flow
聊天消息生命周期
本地创建｜生成稳定ID并显示发送中
服务接收｜鉴权去重持久化分配序号
确认合并｜更新原消息而非重复追加
重连同步｜按序号补缺并推进送达状态
```

## 配套代码：ACK 与乐观消息归并

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

临时消息在服务端确认后更新同一项，不再插入一条重复消息。

```javascript
const messages=new Map();
messages.set('client-1',{clientId:'client-1',status:'sending',text:'你好'});
function acknowledge(clientId,serverId,seq) {
  const previous=messages.get(clientId);
  messages.set(clientId,{...previous,serverId,seq,status:'accepted'});
}
acknowledge('client-1','server-9',8);
acknowledge('client-1','server-9',8);
console.log(messages.size);
console.log(messages.get('client-1').status);
```

重复 ACK 更新同一条逻辑消息，界面不重复插入。accepted 只代表定义的接收状态，不自动等于已投递或已读；真实协议还要幂等、补拉和序号。

## 从示例走向实际使用

测试发送后立即断网、确认重复到达、两端同时发送、重连补历史和本地时间错误。界面要保留重试入口，但每次重试不能生成新业务身份。

课内 Map 演示重复确认只更新同一消息。真实系统需要服务端持久去重、鉴权与历史查询，不能把本地去重当成完整可靠消息协议。
