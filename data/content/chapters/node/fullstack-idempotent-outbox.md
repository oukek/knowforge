---
{"id":"fullstack-idempotent-outbox","moduleId":"node","title":"全栈写入一致性：幂等键、事务与 Outbox","prerequisites":["js-promise","js-async-await"],"sources":["sql-transaction","node-context"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识全栈写入一致性

一次业务操作经常需要同时写数据库和发送消息，例如保存订单后通知发货。数据库提交与消息发送属于不同系统，普通本地事务无法让两者天然一起成功。进程恰好在两步之间崩溃，就会出现数据有了但通知没发，或通知发了但数据没提交。

Outbox 把“需要发送什么消息”先作为数据库记录，与业务数据放在同一个事务里提交。之后独立发送器读取待发记录并投递，从而把跨系统的不确定性变成可重试的持久状态。

## 事务解决原子提交，幂等解决重复执行

请求幂等处理客户端重试，Outbox 处理业务提交后消息最终被发送，这两者不是同一个机制。事务中可同时写入业务行、幂等结果和待发事件，任一步失败则整体回滚。成功后即使 HTTP 响应丢失，重试仍可取得原结果；即使发送器重启，事件仍在待发队列中。

发送器可能在消息已送达但“已发送”标记尚未保存时崩溃，因此重新运行可能再次投递。Outbox 通常需要消费者按事件 ID 去重，并以业务唯一性约束保护副作用。不能仅凭生产端有 Outbox 就声称跨系统严格只执行一次。

事件应包含稳定标识、版本和足以解释业务变化的数据，避免消费者稍后读取已经变化的行却误当成事件发生时的状态。顺序要求也需明确：同一订单的状态事件可能要保持顺序，不相关订单则可以并行。发送失败要记录重试时间与错误类别，不能永远无间隔重试。

## 从三个不同的失败开始

客户端超时不代表服务器没提交；用户再次点击可能是同一业务意图的重试。两个实例同时看到“没有这个键”也不代表都可以插入。数据库提交成功但发消息失败，则是数据库与消息系统之间的双写缺口。它们分别需要稳定幂等键、数据库唯一约束和事务内 Outbox，不能用一个进程内 Map 同时解决。

幂等键的作用域至少包含租户、操作类型和键值。还应保存规范化请求的摘要；同一个键携带不同金额不能静默返回第一次的订单。摘要计算需定义字段顺序、缺省值和数值表示，不能随意对原始 JSON 文本做哈希后宣称业务等价。

## 数据模型与提交顺序

```sql
CREATE TABLE requests (
 tenant_id BIGINT NOT NULL, op VARCHAR(32) NOT NULL,
 idem_key VARCHAR(100) NOT NULL, body_hash CHAR(64) NOT NULL,
 order_id BIGINT, PRIMARY KEY(tenant_id,op,idem_key)
);
-- orders 和 outbox 与 requests 使用同一个支持事务的数据库。
START TRANSACTION;
-- 尝试声明唯一请求键；冲突时读取并比较摘要/已有结果。
-- 写 orders，写 outbox(event_id, order_id, type, payload)，更新请求结果。
COMMIT;
```
不能先检查再无保护插入。唯一约束决定并发赢家，失败实例应按驱动语义回滚或重新读取，而不是在已经错误的事务中继续假设成功。对长期进行中的请求要有可恢复状态，不能让 processing 永久占位。

## Outbox 解决什么、不解决什么

业务记录和“应发送事件”一起提交，消除了提交后完全不知道该通知什么的窗口。发布器领取未发送记录，发送后标记成功；若发送成功但标记前崩溃，消息会再次投递，因此消费端仍需使用 event_id 去重。端到端承诺是至少一次投递加幂等效果，不是凭 Outbox 就获得跨系统 exactly-once。

处理顺序也需设计：同一订单的 created、paid、cancelled 若被不同 worker 并行发布，接收方应使用业务版本或按聚合键分区，不能按到达时间猜最新状态。

## 参考伪代码与测试路径

```javascript
// db.transaction 是应用数据库封装；以下不是特定驱动的通用 API。
await db.transaction(async tx => {
  const claim=await claimRequest(tx,tenant,'create-order',key,bodyHash);
  if(claim.completed) return claim.result;
  const order=await insertOrder(tx,input);
  await insertOutbox(tx,{id:eventId,orderId:order.id,type:'order.created'});
  await completeRequest(tx,claim,order);
});
```
测试需要注入三个崩溃点：数据库 commit 前、commit 后响应前、消息发布后标记前。并发提交同键同体和同键异体，确认前者一个订单、后者明确冲突。重试时返回第一次的业务结果，而不是再次扣库存。

## 跨语言全栈边界

Vue 负责在一次业务意图内复用键，Node/Python 服务端负责认证、规范化和约束；更换浏览器或客户端不能绕过服务端规则。数据库作为事实来源，Redis 锁可降低争用但不能代替唯一约束；锁会过期、实例会重启，业务效果必须仍可判断。

## 把机制放到一条完整路径中

```flow
业务与消息一致性
接收请求｜识别幂等键和参数摘要
本地事务｜一起保存业务结果与事件
异步投递｜发送器重试未完成事件
消费去重｜按事件身份保护副作用
```

## 配套代码：全栈写入一致性：幂等键、事务与 Outbox

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

浏览器内的确定性实验，用于验证关键不变量。真实服务/SDK 完整示例见正文；不会连接模型或外部服务。

```javascript
const requests = new Map(),
  orders = [],
  outbox = [];
function create(tenant, key, body) {
  const scope = tenant + ":" + key,
    hash = JSON.stringify(body);
  if (requests.has(scope)) {
    const prior = requests.get(scope);
    if (prior.hash !== hash) throw Error("conflict");
    return prior.id;
  }
  const id = orders.length + 1;
  orders.push({ id, ...body });
  outbox.push({ id: "event-" + id, orderId: id });
  requests.set(scope, { hash, id });
  return id;
}
console.log([
  create("a", "k", { amount: 10 }),
  create("a", "k", { amount: 10 }),
]);
console.log({ orders: orders.length, events: outbox.length });
try {
  create("a", "k", { amount: 20 });
} catch (e) {
  console.log(e.message);
}
```

Map 仅演示相同意图与冲突判断，不具备多实例事务语义。第二次调用复用订单 1，事件也只创建一次；同键不同金额被拒绝。生产实现必须把声明幂等键、写订单和写 outbox 放进数据库事务并使用唯一约束。 本实验用 JSON.stringify 作简化比较，属性顺序可能影响结果；真实接口应按约定规范化字段、缺省值与数值后计算摘要。

## 从示例走向实际使用

使用数据库事务与唯一索引落实不变量，不需要数据库外键才能建立这套协议；关联校验和生命周期由业务层维护。幂等键应包含租户或用户作用域，防止不同调用者碰撞。

故障实验分别在事务前、提交后、消息送达后和标记前中断。每个断点都应有可解释的恢复结果，且消费侧不重复产生业务影响。
