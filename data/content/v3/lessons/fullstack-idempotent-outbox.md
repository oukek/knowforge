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
