## 从请求生命周期拆出任务生命周期
任务被接受不等于任务已成功。入口验证、授权并持久化任务后返回 task_id；worker 负责领取、执行、续租和完成；前端展示排队、运行、等待审批、完成或失败。不能只用一个内存 Promise 把任务“放后台”，进程退出后调用者将无法判断它是否完成。

领取需要原子性。数据库实现可在短事务内按可用时间选择并锁定记录，再写 owner、lease_until 和递增 token；支持 SKIP LOCKED 的数据库可以避免多个领取者相互等待，但具体隔离、索引与锁行为仍需用目标数据库测试。外部耗时工作应在领取事务之外执行，避免长事务锁住队列。
## 租约过期并不意味着旧 worker 已经停止
worker A 暂停超过租约，B 重新领取后开始执行；A 恢复时如果仍可写 completed，可能覆盖 B 的新结果。续租和完成都要比较 owner 与 fencing_token。Token 必须单调且由受信存储分配，接收副作用的系统如果支持也应拒绝旧 token。仅在队列状态表做比较不能阻止已经发出的第三方付款，因此业务幂等仍不可少。
## 重试调度而不是原地死循环
错误要分成不可重试输入/授权失败、瞬时网络故障和结果不确定的副作用。记录 attempt、next_run_at 和错误类别，退避加抖动，设置最大次数与总 deadline。永久失败进入人工处理或死信区域，不能立即重新入队造成热循环。任务重试次数乘以每次工具扇出，才接近真实下游压力。
## 参考执行器步骤
```text
1. 短事务领取：status=queued 且 next_run_at<=now，写 owner/lease/token。
2. 在事务外执行业务；传递 task_id、operation_id 与剩余预算。
3. 定期续租：仅更新 owner/token 仍匹配的记录。
4. 完成回写：条件更新 task_id+owner+token，并核对影响行数。
5. 失败分类：重试、终止或结果查询；记录可诊断但不泄密的错误。
```
这些步骤应由实际数据库/队列实现原子操作，不能照搬为“SELECT 后任意 UPDATE”。Exactly-once 不应从“同一时刻看起来只有一个 worker”推断出来。
## 优雅退出与验收
停止接收新请求、停止领取新任务，给运行任务有限清理时间，不能无限等；未完成任务依租约恢复，已完成业务按稳定键重放结果。分别测试 worker 在领取后、外部成功后、回写前被杀，测试暂停后旧 owner 恢复。观测队列年龄、重试率、死信数、租约丢失与重复效果，而不仅是 worker 进程是否活着。

## MySQL 条件写入示意
下面是假设已有 jobs 表的 MySQL 8.x SQL 片段；问号代表驱动绑定参数，不是直接复制到控制台的完整建表脚本。表需要 id、status、owner、fencing_token、lease_until、next_run_at 等字段。
```sql
START TRANSACTION;
SELECT id FROM jobs
WHERE next_run_at <= NOW(6)
  AND (status = 'queued' OR
       (status = 'running' AND lease_until <= NOW(6)))
ORDER BY next_run_at, id
LIMIT 1 FOR UPDATE SKIP LOCKED;
-- 选择为空则结束本次领取；否则在同一连接/事务中更新选中的 id。
UPDATE jobs SET status='running', owner=?,
  fencing_token=fencing_token+1,
  lease_until=DATE_ADD(NOW(6), INTERVAL 30 SECOND)
WHERE id=?;
SELECT fencing_token FROM jobs WHERE id=?;
COMMIT;
-- 事务外执行工作，完成时只允许当前租约持有者改变状态。
UPDATE jobs SET status='done'
WHERE id=? AND owner=? AND fencing_token=?
  AND status='running' AND lease_until > NOW(6);
```
最后一条影响行数为 0 时不能宣称任务已完成：可能租约过期、被别人重领、已经取消或重复回写。续租同样必须带 owner/token 和有效期条件，不能复活过期租约。时间使用数据库时钟降低各 worker 时钟差异，但仍要处理数据库故障、长暂停和执行超出预期。

队列表的索引、隔离级别和 OR 条件会影响扫描与锁范围，需用 EXPLAIN 和真实并发压测检验；SKIP LOCKED 主要用于队列式竞争，不是所有业务一致性读取的替代品。这个 SQL 解决的是任务领取与状态竞争，不能让外部副作用天然变成 exactly-once。
