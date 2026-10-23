## 会话、连接与事务不是同一个概念
连接是与数据库通信的资源；事务定义一组语句的原子提交；ORM Session 还可能维护 identity map 和待写对象。请求结束关闭 Session 并不自动证明所有业务操作使用同一个事务，多个仓储函数各自 commit 可能把本应原子的操作拆开。Unit of Work 让应用服务明确决定何时提交，而不是把提交藏在每个 repository.save 中。

事务原子性不等于没有并发冲突。先 SELECT 库存大于零、再 UPDATE 库存减一，两个事务可能都读到相同值。使用条件更新并检查影响行数，或明确锁定所需记录；防止重复业务还需要唯一约束。隔离级别越高通常竞争也越强，应围绕业务不变量选择，而非只背隔离级别名称。
## 可直接运行的失败实验
```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def unit_of_work(connection):
    connection.execute('BEGIN')
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise

connection = sqlite3.connect(':memory:')
connection.execute('CREATE TABLE stock(sku TEXT PRIMARY KEY, quantity INTEGER)')
connection.execute("INSERT INTO stock VALUES('book', 1)")
connection.commit()
try:
    with unit_of_work(connection) as tx:
        changed = tx.execute('UPDATE stock SET quantity=quantity-1 WHERE sku=? AND quantity>0', ('book',)).rowcount
        if changed != 1: raise ValueError('out of stock')
        raise RuntimeError('simulate order insert failure')
except RuntimeError:
    pass
print(connection.execute('SELECT quantity FROM stock').fetchone()[0])
```
输出仍是 1，表示库存扣减随订单失败一起回滚。这里使用 SQLite 内存库验证提交边界，不代表 MySQL、PostgreSQL 的锁语义完全相同。SQL 参数化防止值被当作 SQL 片段，表名/排序字段仍需白名单处理。
## 在真实服务中接入
请求进入时获取会话，应用服务开启工作单元，仓储只执行查询和变更，应用服务成功后提交，finally 释放。遇到死锁可重试整个短事务，但不要重复事务外已经发送的邮件或支付。事务里避免长时间模型调用、文件上传或等待人工确认；应先提交持久任务状态，再异步推进。
## 验证思路
不仅测试成功插入，还要在第二次写入前抛异常，确认第一次写入被撤回；并发抢同一库存，确认成功次数不超过库存；重复业务键并发创建，确认唯一约束生效。集成测试必须使用目标数据库验证其隔离与错误码，不能用 SQLite 测试替代所有生产数据库行为。
## 常见迁移陷阱
后台 worker 不能复用已关闭的请求 Session；异步 ORM 不意味着任意线程都能共享同一个会话。事务 rollback 后内存对象可能仍留着修改值，继续响应前要重新读取可信状态。把数据库异常映射为业务冲突时要保留内部日志与 traceId，避免错误地把唯一冲突都叫作用户重复。
