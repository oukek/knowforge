---
{"id":"py-sql","title":"Python 数据库访问：参数化、事务、连接与结果游标","moduleId":"python","prerequisites":["py-context","py-serialization"],"sources":["py-types","py-functions"]}
---
## 数据库连接有自己的生命周期
连接表示与数据库会话交互的资源，游标或结果对象负责执行和读取。连接池复用连接降低建立成本，但连接数过大会压垮数据库，过小又会让请求排队。事务绑定在具体会话上，不是应用里随便写几条SQL就天然成为一组原子操作。

标准接口和具体驱动的参数占位符、事务默认行为、线程安全与取消能力各有差异。代码必须按所用驱动文档编写，不能把SQLite示例直接当MySQL部署方案。
## execute、fetch 和 commit 分别做什么

execute把一条命令和参数交给数据库，SELECT通常产生可继续读取的结果；fetchone取一行，fetchmany取有限批，fetchall把剩余结果全部载入内存。没有结果时的返回形式与行对象结构由驱动契约决定。把游标当普通列表直接传出事务范围，可能在消费时遇到连接已经关闭。

commit结束并提交当前事务，rollback放弃未提交变化。自动提交模式、事务开启时机与上下文管理器行为因驱动而异，必须明确。连接池借出的连接可能承载会话状态，归还前需要清理未完成事务，不能让下一位使用者继承错误的会话设置。

## 一次业务修改为什么要围住多个 SQL

```python
import sqlite3
connection = sqlite3.connect(":memory:")
try:
    connection.execute("CREATE TABLE stock(id INTEGER PRIMARY KEY, count INTEGER)")
    with connection:
        connection.execute("INSERT INTO stock VALUES (?, ?)", (1, 3))
    with connection:
        cursor = connection.execute(
            "UPDATE stock SET count=count-? WHERE id=? AND count>=?",
            (2, 1, 2))
        if cursor.rowcount != 1:
            raise ValueError("库存不足或商品不存在")
    print(connection.execute("SELECT count FROM stock WHERE id=1").fetchone()[0])
finally:
    connection.close()
```

示例把检查和扣减放进同一条条件更新，避免在应用里先读3再写1的窗口中丢失其它并发变化。具体数据库的锁与隔离语义仍要验证；这并不意味着所有库存系统用一条SQL就解决了订单幂等、支付和补偿。

参数化把值交给驱动编码，不等于授权。查询订单时还要带可信用户或租户条件。关联字段使用普通ID和索引，并在业务事务中校验归属与生命周期；无需依赖外键或级联来表达整个业务流程。

## 用内存数据库理解参数与事务
```python
import sqlite3
connection = sqlite3.connect(":memory:")
try:
    connection.execute("CREATE TABLE notes(id INTEGER PRIMARY KEY, title TEXT)")
    with connection:
        connection.execute("INSERT INTO notes VALUES (?, ?)", (1, "Python"))
    row = connection.execute("SELECT title FROM notes WHERE id=?", (1,)).fetchone()
    print(row[0])
finally:
    connection.close()
```
示例仅用本地内存SQLite验证通用思路，不修改项目生产数据库。参数值与SQL语法分开，字符串中的特殊字符由驱动处理。表名与排序字段通常不能简单当普通值绑定，需白名单映射。
## 事务保证什么，不保证什么
事务把相关数据库写入放在一致性边界里，提交成功才对外报告相应成功。异常时回滚，注意某些上下文管理器不负责关闭连接。隔离级别决定并发读取和写入可观察行为，避免把“用了with”当作了解数据库锁语义。
```flow
数据操作流程
获取连接与预算｜限制等待，建立正确会话
开始事务｜明确原子操作范围
参数化查询与授权条件｜值安全与用户权限都要检查
提交或回滚｜检查失败与结果不确定
释放连接｜游标与流式结果及时关闭
```
## 分页、流式读取与租户授权
一次fetchall巨大结果会占用大量内存，分页或流式消费更适合大数据。查询必须带可信身份对应的资源条件，参数绑定不防止越权。应用不依赖外键约束时，业务层通过普通ID、索引和事务维护关联生命周期。

测试唯一冲突、回滚、连接耗尽、查询超时和重复写入。外部发信等副作用不能随数据库事务自动回滚，应通过outbox和幂等协调。
