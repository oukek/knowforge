---
{"id":"go-errors-defer","title":"Go 错误处理、defer、panic 与 recover","moduleId":"go","prerequisites":["go-interfaces"],"sources":["go-docs"],"new":true,"language":"go","order":6,"logs":["true","work","cleanup"],"exampleExplanation":"包装错误仍能通过errors.Is找到原因，得到true。defer推迟到函数退出时执行，所以先输出work再输出cleanup；它不代表开启异步任务。"}
---
## error 是可检查的返回值
文件不存在、请求超时、输入不合法是正常运行中可能发生的失败，通常通过 error 返回，让调用者选择重试、提示或终止。error 是接口，错误文本用于说明，不应把任意字符串比较作为稳定业务分类。包装错误时保留原因链，才能用 errors.Is / errors.As 判断已知错误。

panic 表示控制流异常展开，不能替代所有业务错误。recover 只能在合适的 deferred 调用中处理当前 goroutine 的 panic，不能跨 goroutine 神奇接住所有问题，也不应恢复后假装业务写入一定完成。
## error返回值让失败成为函数契约的一部分

Go的error是一个包含Error() string方法的接口。函数可以返回结果与error，成功时通常返回nil错误，失败时返回可诊断的错误值。调用者应先检查err，再决定结果是否可用；忽略错误后继续使用零值，可能把读取失败误当成空数据，造成更隐蔽的业务损坏。

errors.New适合创建简单错误，fmt.Errorf可以加入当前操作上下文。使用%w包装原因后，errors.Is用于判断错误链是否包含某个目标，errors.As用于提取匹配的具体错误类型。不要依赖完整错误字符串做业务分支，因为提示文字和上下文可能改变；错误类型与稳定语义才是契约。

## defer负责退出动作，panic不是普通业务失败

defer注册当前函数返回前要执行的调用，多个defer按后进先出运行。被调用函数和实参在注册时求值，但真正调用推迟到退出时；若用闭包读取变量，则读取时机又由闭包执行决定。长循环里不断defer关闭文件，可能直到整个函数结束才释放，处理每项资源时应建立更小函数范围或明确及时关闭。

panic展开当前goroutine的调用栈并执行相关defer，recover只在合适的延迟调用上下文中捕获当前goroutine的panic。它不捕获另一goroutine的panic，也不应取代正常参数校验和error返回。服务边界可以恢复意外panic并记录诊断，但内部程序错误仍应修复，不能全部吞掉后返回看似成功。

错误处理包括对外说明与内部线索两部分。向用户返回稳定的错误类别和可公开信息，日志保留操作阶段与原因链；不要把SQL、密钥或完整请求正文无差别拼进错误。重试也需考虑幂等性和时间预算，error本身不保证操作尚未产生效果。

## 包装原因并在边界处理
```go
package main

import (
	"errors"
	"fmt"
)

var ErrMissing = errors.New("missing")

func load() error { return fmt.Errorf("load course: %w", ErrMissing) }
func main() {
	err := load()
	fmt.Println(errors.Is(err, ErrMissing))
	func() {
		defer fmt.Println("cleanup")
		fmt.Println("work")
	}()
}
```
%w 包装可追踪的原因，%v 只是格式化。底层补充上下文，上层决定记录与响应，避免每层都记录同一错误造成重复噪声。返回给用户的消息不应泄漏数据库连接串和内部路径。
## defer 何时求值、何时执行
执行到 defer 语句时会求值函数与参数，函数调用延后到当前函数返回时按逆序执行。它不是程序退出钩子，也不是整个进程必定执行的 finally。长循环中反复 defer Close 会让资源一直积累到函数退出，可以提取每次迭代为小函数，让释放边界与任务一致。
```flow
一次资源操作
获取资源并检查错误｜失败时不要使用无效资源
立即安排释放｜让所有返回路径覆盖清理
执行操作｜逐层传递带上下文的 error
函数退出｜按逆序执行 defer
上层边界｜转为用户响应、日志或重试策略
```
## 错误处理中的一致性
事务需要 rollback/commit，文件写入可能在 close 时发现错误，HTTP 响应体需要关闭，流式操作还可能只完成一部分。defer Close 解决资源释放，不自动证明业务操作成功。重要的关闭错误应按 API 契约处理，而不是一概忽略。

测试应包含失败发生在获取前、获取后、处理一半和提交之后。对于副作用无法确定是否完成的超时，使用幂等键和状态查询，而不是单凭 error 非 nil 就认为从未执行。
