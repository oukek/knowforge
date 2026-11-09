---
{"id":"mysql-mvcc-isolation","moduleId":"design","title":"隔离级别与 MVCC：读视图、当前读和写偏差","prerequisites":["mysql-engine-recovery","rest-transactions"],"sources":["ie-mysql-read","mysql-undo","ie-mysql-isolation","tutorial-mysql-snapshot","tutorial-mysql-locking"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识隔离级别与 MVCC

事务隔离级别描述并发事务之间允许观察到什么变化。读未提交、读已提交、可重复读和串行化逐步提供不同约束，但不能只背名称就断言某个业务一定安全。库存、排班与余额的正确性还取决于具体读写方式和约束。

MVCC 是多版本并发控制，让读取可以依据某个可见性视图选择历史版本，而不必总与写入互相阻塞。它不是为每个事务复制整张数据库。

## 读视图、版本链与当前读

InnoDB 使用记录版本信息和 undo 等机制支持历史可见性。读视图依据事务状态判断某个版本是否可见，不是简单比较一个全局提交时间数字。教学中的时间线模型有助理解新旧版本，但不能替代真实活跃事务集合与可见性规则。

在常见的可重复读一致性读取中，同一事务后续普通快照读复用首次相应读取建立的视图；读已提交则每次一致性读取建立较新的视图。事务仍能看到自己的修改，因此不能把快照理解成对所有操作都完全冻结的照片。开始事务与首次建立一致性视图也不是无条件同一时刻。

SELECT FOR UPDATE 等锁定读和 UPDATE、DELETE 的行为不同于普通快照查询，它们需要协调当前记录与锁。间隙锁、临键锁与索引访问范围会影响并发插入和等待，但并不意味着所有业务写偏差自动消失。防超卖可用带条件的原子更新并检查影响行数，或在正确锁定范围内执行事务。

## 四个级别解决的不是所有业务不变量

读未提交允许脏读；读已提交避免脏读但相邻读取可变化；可重复读为一致性读提供稳定快照；串行化提供更强隔离但可能增加阻塞。SQL 标准异常分类与具体引擎实现需分开谈。脏读是读到未提交结果，不可重复读常指同一行变化，幻读常指同条件范围的集合变化，不能只看“读两次数字不同”就下结论。

## RR 如何复用快照

InnoDB 更新记录时保留事务标识与旧版本链，一致性读依据 Read View 判定版本是否可见，不可见时沿 undo 链寻找旧版本。RR 通常在事务中第一次一致性读建立视图并复用；RC 每条一致性读取得新视图。START TRANSACTION WITH CONSISTENT SNAPSHOT 可显式建立相应快照，不能简化成“BEGIN 的时间就是所有 RR 快照时间”。事务还能读到自己的写入。

## 快照读和当前读必须区分

普通一致性 SELECT 读版本；SELECT ... FOR UPDATE / FOR SHARE 与 UPDATE/DELETE 等走相应锁定或当前数据语义。RR 下对范围的锁定读通常依靠记录锁、间隙锁、next-key lock 保护相应范围，具体锁取决于索引、唯一等值还是范围访问。MVCC 本身不是把整张表复制一份，也不是所有读都不加锁。

例如 A 快照读看不到 B 新插入的行，A 的 UPDATE 却可能影响 B 已提交的记录，随后 A 又能看见自己的更新。这不意味着 RR 快照随机失效，而是混用了不同读语义。面试时应明确事务时序、索引与语句类型。

## 可以照着执行的双会话实验

```sql
-- A：先设 RR，然后开始事务并第一次读取
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;
SELECT balance FROM accounts WHERE id=1;
-- B：UPDATE accounts SET balance=80 WHERE id=1; COMMIT;
-- A：普通 SELECT 仍见旧版本；锁定读可能等待并读到新的已提交版本
SELECT balance FROM accounts WHERE id=1 FOR UPDATE;
COMMIT;
```
实验要控制 autocommit、会话级配置与事务开始顺序。锁定读会改变并发行为，不能在一个连接里交错两组 SQL 假装是两个事务。

## 防止超卖不能只背隔离级别

扣库存可用 UPDATE stock SET qty=qty-1 WHERE id=? AND qty>0，检查受影响行数；订单与扣减置于同一事务，再保证请求幂等。跨多行约束可能出现写偏差，例如两位值班医生都读取“还有两人在岗”，各自退出造成无人值班。需要锁定共同的约束记录、适当串行化或重构数据约束，RR 不等于全局串行执行。

## 可运行版本可见性模型

示例仅用已提交版本号模拟稳定视图和新视图，展示 RR 与 RC 的差别；真实 Read View 还涉及活跃事务集合、自身事务与上下界。学习后应能给出两条独立链路：版本可见性解释普通读取，锁范围解释并发写入与范围保护。长事务的代价也要结合 undo 清理与缓存分析。

## 把机制放到一条完整路径中

```flow
版本可见性
建立事务｜确定隔离级别与读取类型
取得视图｜按规则记录可见性边界
选择版本｜沿历史信息找到可见记录
处理写入｜使用锁条件与事务维护业务不变量
```

## 配套代码：隔离级别与 MVCC：读视图、当前读和写偏差

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

使用本地 JavaScript 模型验证关键不变量；不调用真实数据库、模型或生产服务。实验简化之处与真实系统步骤见正文。

```javascript
const versions = [{commit:1,value:100},{commit:3,value:80}];
function read(view) { return versions.filter(v=>v.commit<=view).at(-1).value; }
const rrView = 1;
console.log(read(rrView));
console.log(read(rrView));
console.log(read(3));
console.log(versions.at(-1).value);
```

本段程序用于把状态、条件和数据之间的关系写清；真实实现仍需上文介绍的资源、权限与失败协议。

## 从示例走向实际使用

用两个独立会话按步骤交替执行，而不是把 SQL 全塞进同一连接。记录隔离级别、autocommit、首次读取时刻与提交顺序，再解释观察结果。

下面保留双会话实验与业务不变量分析。遇到“可重复读能不能防幻读”追问时，先明确普通快照读、锁定读还是混合读写，以及具体查询与索引。

## 关联面试原题

以下为用户提供的朋友面试记录，保留原问法；公司与面试日期未提供，不作推断。链接进入独立题库中的参考答案、评分要点和后续追问。

- [事务的几个隔离级别，可重复读是怎么实现的？](/practice/friend-mysql-mvcc-isolation-1)
