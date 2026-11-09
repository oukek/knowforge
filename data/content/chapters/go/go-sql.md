---
{"id":"go-sql","title":"Go 数据访问：连接池、参数绑定、事务与取消","moduleId":"go","prerequisites":["go-http","go-interfaces"],"sources":["go-docs"],"new":true,"language":"go","order":12,"logs":["Go true","true"],"exampleExplanation":"内存仓储找到ID为1的课程Go，error为nil，先输出Go true；ID为2时返回ErrNotFound，errors.Is确认该错误后输出true。本例验证仓储契约，没有实际连接数据库或执行SQL。"}
---
## sql.DB 通常代表连接池
database/sql 的 DB 是可并发使用的数据库访问入口，管理一组连接，而不是每个请求独占的一根连接。连接上限、空闲数量和生命周期决定资源占用与等待；把上限设得巨大不能让数据库凭空增加处理能力，只会把拥塞推进数据库。

Go 标准库提供统一接口，实际连接数据库还需要相应驱动。驱动的占位符与取消支持有差异，MySQL 常见问号参数，PostgreSQL 常见编号参数，不能原封不动跨驱动复制SQL。
## sql.DB、Conn、Tx和Rows各代表什么

sql.DB是并发安全的数据库访问入口，通常管理连接池，不等于已经独占一条连接。Conn表示显式持有的单连接，Tx表示在特定连接上的事务，Rows表示需要继续消费并关闭的结果集。事务中的查询必须经Tx执行，若误用DB方法，可能跑到另一条连接而脱离当前事务。

设置池上限时考虑应用进程数：每进程最多20连接，部署10进程就可能达到200连接，还需留给管理和其它服务。池太小会排队，太大可能压垮数据库。连接生命周期和空闲时间配置用于适配网络与数据库限制，不是越大越稳定。

## 一次查询的错误检查有多个位置

QueryContext可能在发起时失败，Rows.Next逐行推进，Scan按列把结果写入目标变量，遍历结束后还要检查Rows.Err。不能只看Next返回false就认为一定正常耗尽；中途网络错误也会结束读取。QueryRowContext的某些错误在Scan时才暴露，未找到记录应与真正数据库故障分开处理。

事务通常BeginTx后注册兜底Rollback，全部业务步骤成功再Commit，并检查Commit本身的错误。提交失败可能涉及结果不确定，不能一律认定未提交然后重复产生外部副作用。参数占位符由所选驱动决定，不应把SQLite、MySQL、PostgreSQL写法机械互换。

参数化只保护值的语法边界，动态表名和排序字段需白名单，租户与用户授权仍需可信条件。普通ID、索引和事务足以由业务维护关联，不需要数据库外键。大结果集应分页或流式处理，同时确保连接不会被一个慢消费者无限占用。

## 先把数据访问与业务判断分离
下面程序使用一个内存实现演示业务依赖接口，不连接真实数据库。它说明查询错误必须传递，查不到与系统故障需要区分。
```go
package main

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type Store interface{ Title(id int) (string, error) }
type Memory map[int]string

func (m Memory) Title(id int) (string, error) {
	value, ok := m[id]
	if !ok {
		return "", ErrNotFound
	}
	return value, nil
}
func main() {
	var store Store = Memory{1: "Go"}
	title, err := store.Title(1)
	fmt.Println(title, err == nil)
	_, err = store.Title(2)
	fmt.Println(errors.Is(err, ErrNotFound))
}
```
实际实现可以在方法里使用 QueryRowContext(ctx,sql,args...).Scan(...)。参数绑定让值与SQL语法分开；表名或排序方向等标识符需要白名单映射。查询仍必须带可信身份的资源范围，参数化不是授权。
## 事务覆盖哪一段工作
BeginTx 后所有属于该事务的操作通过 tx 执行，不要中途误用 db 让某一步跑到事务外。安排 Rollback 兜底，所有必要操作成功再 Commit，并检查 Commit 的错误。事务隔离级别与锁行为由数据库共同决定，不能只看Go代码判断并发结果。
```flow
一次事务操作
获取事务与预算｜BeginTx(ctx,...)
读取并校验｜在事务需要的隔离与锁下判断
执行相关写入｜所有步骤走同一 tx
提交并检查结果｜提交失败不应返回成功
清理｜未提交路径回滚，释放连接
```
## 连接泄漏与外部副作用
多行查询要关闭 Rows，并检查遍历后的 Rows.Err。忘记关闭可能让连接长期占用，最终所有请求排队。ctx 超时依赖驱动和数据库配合，不能视为已提交操作的撤销。

事务内发邮件或支付无法由数据库回滚撤销。使用 outbox、幂等和重试协调外部动作，避免长时间持锁等网络。集成测试用独立数据库，覆盖唯一冲突、死锁重试、取消和提交结果不确定，不连接生产库做破坏性验证。
