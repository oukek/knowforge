---
{"id":"py-unit-of-work","title":"Python Unit of Work：业务事务与仓储边界","moduleId":"python","prerequisites":["py-sql","py-context"],"sources":["py-types","py-functions"]}
---
## 一次业务操作通常包含多次数据访问
创建订单可能同时写订单、明细和待发送事件。这些变化应按业务一致性要求共同提交或回滚。Repository封装访问某类数据的方式，Unit of Work管理一次业务操作的事务范围；它们不是简单把每条SQL包进一个同名函数。

若每个仓储方法都自行commit，上层无法再把多个方法组合成一个原子操作。事务所有权应在业务用例层明确，仓储使用同一会话，不随意另开连接绕过事务。
## 用例、仓储和事务三者怎样配合

用例表达一次业务意图，例如“给某位用户创建学习计划”；仓储负责读取或保存某类业务对象；事务保证选定数据库操作共同提交。若仓储每次save都立即commit，用例后续失败时，前面操作已经无法一起回滚。Unit of Work把这些数据操作连接到同一个会话与事务拥有者。

调用顺序可以是：入口验证身份→用例建立UoW→读取用户和计划状态→检查业务条件→写计划与相关记录→统一提交。普通ID和索引表达关联，业务层在事务内校验存在性、归属及生命周期。这个结构不要求使用ORM，也不要求数据库外键；重点是事务边界和依赖方向清楚。

## 事务内读取并不自动消除并发冲突

两个请求可能同时读到同一个旧版本并各自修改。根据业务可以使用条件更新、乐观版本号或恰当锁定读取；选择取决于冲突概率、隔离级别与等待成本。乐观版本更新通常在WHERE里同时检查ID和旧版本，影响行数为0时报告冲突，而不是静默覆盖另一请求。

事务应尽量只包含维护本地一致性必需的操作。把慢AI调用放在数据库事务内会长时间占用连接和可能持有锁，扩大故障影响；通常先获取必要外部结果，或把业务拆成显式状态机，再以短事务提交状态。需要与外部动作协调时使用outbox、幂等和核对，而不是把本地事务称为跨系统原子性。

测试替身可以验证用例是否调用了正确仓储，但只有真实数据库测试才能验证隔离、锁等待和回滚。两类测试各自保留，避免用内存字典的简单行为代替数据库事实。

## 用内存数据库观察回滚
```python
import sqlite3
connection = sqlite3.connect(":memory:")
try:
    connection.execute("CREATE TABLE items(id INTEGER PRIMARY KEY)")
    try:
        with connection:
            connection.execute("INSERT INTO items VALUES (1)")
            connection.execute("INSERT INTO items VALUES (1)")
    except sqlite3.IntegrityError:
        pass
    print(connection.execute("SELECT COUNT(*) FROM items").fetchone()[0])
finally:
    connection.close()
```
第二次写入违反唯一约束，事务中的第一次也回滚，所以数量为0。示例展示事务边界，不要求项目改用SQLite。MySQL驱动、隔离级别和上下文管理行为应分别确认。
## 外部动作不能假装属于同一数据库事务
订单提交后发消息若失败，不能简单回滚已经提交的数据库。可以在同一事务写outbox记录，再由独立任务投递；投递端按稳定事件ID去重并记录状态。数据库事务、消息投递和消费者处理是不同完成点。
```flow
用例事务
建立 UoW｜获取会话并开始事务
调用多个仓储｜共同使用当前事务
记录必要 outbox｜与业务数据共同持久化
提交｜明确本地一致性已完成
异步投递与核对｜外部副作用另行重试和去重
```
## 隔离与重试的设计
业务关联使用普通ID和索引，在应用层检查归属与生命周期，必要写入放事务；不依赖数据库外键或级联完成业务。遇到死锁等可重试故障，应重试完整且可安全重复的用例，不是只重放最后一条SQL。

测试中途失败、并发更新、提交失败与外部投递重复。仓储替身能测试业务分支，真实数据库集成测试才能覆盖锁、唯一约束与事务隔离行为。

## 用上下文管理器明确事务拥有者

下面的边界要求进入时连接没有其它未完成事务。仓储方法接收同一个连接，不在内部commit；用例正常结束后统一提交，任何异常都回滚再传播。真实驱动可能已经提供等效上下文，应优先理解并使用库的契约，避免嵌套BEGIN造成冲突。

```python
from contextlib import contextmanager

@contextmanager
def unit_of_work(connection):
    connection.execute("BEGIN")
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
```

捕获BaseException在这里仅用于确保取消或中断也经过回滚，随后必须原样抛出，不能把它当普通业务失败吞掉。还要考虑rollback本身失败时怎样保留原始异常和关闭不可继续使用的连接。

如果在提交后才把事件加入内存列表，进程恰好退出就会丢失投递意图；所以outbox要与业务记录在同一事务持久化。消费者则处理“可能多次收到”，通过事件ID或业务幂等键确保不重复产生效果。这个流程比一句“事务保证一致性”多了几个完成点，故障测试应逐个覆盖。
