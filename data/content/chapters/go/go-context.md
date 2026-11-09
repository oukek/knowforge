---
{"id":"go-context","title":"Go context：请求截止时间、取消传播与资源回收","moduleId":"go","prerequisites":["go-channels"],"sources":["go-docs"],"new":true,"language":"go","order":9,"logs":["context canceled"],"exampleExplanation":"cancel使Done变为可观察的关闭信号，随后Err说明取消原因，打印context canceled。context传递取消意图，不会撤销已经完成的外部副作用。"}
---
## 取消表达的是不再需要，不是强制杀死
一个 HTTP 请求可能继续调用数据库和其它服务。如果用户断开或总预算用完，这些子工作通常也应停止等待。context 将取消、截止时间和请求范围的少量值沿调用链传递。它不是操作系统 kill，也不能自动终止完全不检查信号的计算或第三方调用。

通常把 ctx 作为函数第一个参数向下传，调用方拥有取消权，子函数使用派生 context 限制自己的预算。不要把整个应用配置、可选参数或大数据都塞进 context.Value；业务依赖应通过明确参数或结构体表达。
## 一棵取消树如何形成

context通常由入口创建并传到下游函数。WithCancel从父context派生子context并返回cancel函数，WithTimeout或WithDeadline再加时间预算。父取消会向子传播，子取消不会反向取消父或兄弟。Done返回取消时关闭的channel，Err说明是取消还是截止时间到达；它不保存业务结果。

创建派生context后应在不再需要时调用cancel释放相关资源，即使正常成功也如此。一般把context作为函数第一个参数，而不是长期放在业务结构体里复用多个请求。不能把某次请求的已取消context留给下一次请求继续使用。

## 下游必须主动参与取消

HTTP请求、数据库查询等支持context的API会按自身能力观察取消，但一个完全不检查context的循环不会被它强制杀死。自写工作可以在循环或阻塞通信处select Done，收到信号后停止并清理。CPU密集循环应按适当粒度检查，避免每条指令都检查，也避免几分钟都不响应。

一次用户请求若总预算为两秒，认证、数据库和模型调用共同消耗它。下游子预算不能凭空延长父截止时间；重试也从剩余预算支付。区分连接超时、读写超时和整体截止，才能知道时间花在哪一段。

WithValue适合传播请求范围的少量元数据，例如关联ID，不适合把所有可选参数、配置与依赖藏进去。键应避免冲突，值仍需要明确身份来源；context携带userID并不会自动完成授权，业务查询必须使用可信认证结果检查资源归属。

## 观察取消信号
```go
package main

import (
	"context"
	"fmt"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan string, 1)
	go func() {
		<-ctx.Done()
		done <- ctx.Err().Error()
	}()
	cancel()
	fmt.Println(<-done)
}
```
取消会关闭 Done 通道，等待者可以观察它；多个等待者都能收到关闭通知。cancel 应在不用时调用，以释放相关资源，通常创建后立即 defer cancel。对于 WithTimeout，成功提前返回也仍需取消，不能只等待计时器自然结束。
## 截止时间怎样分给下游
```flow
请求总预算
入口建立截止时间｜例如用户操作最多等待一段时间
调用业务服务｜沿用请求 context
访问数据库或 HTTP｜将 context 交给支持取消的 API
预算到期或客户端断开｜传播取消信号
清理并返回｜判断结果是否已提交，不能盲目重复副作用
```
若上游只剩100ms，下游不能重新获得独立10秒预算，否则总请求虽已失败，后台还在占资源。派生预算应受父预算约束。重试也消耗同一总预算，不能每次都把时钟归零。
## 取消不等于撤销
数据库提交或外部支付可能在取消前已完成，调用方却没有收到响应。错误返回不能证明业务未执行；需要幂等键、状态查询和必要补偿。后台必须完成的工作应明确进入持久任务系统，不要悄悄从请求 context 换成 Background 来逃避生命周期。

测试在排队、执行与返回前取消的结果，确认 goroutine 和连接得到释放。对CPU循环可在合适粒度检查信号；检查过频也有成本，关键是可解释的响应延迟和正确清理。
