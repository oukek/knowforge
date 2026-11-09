---
{"id":"go-http","title":"Go HTTP 服务：Handler、中间件、JSON 与超时","moduleId":"go","prerequisites":["go-context","go-sync-memory"],"sources":["go-docs"],"new":true,"language":"go","order":11,"logs":["200","ok"],"exampleExplanation":"httptest构造GET请求并记录Handler响应，Handler设置200状态并写入ok，所以打印200和ok。示例没有监听公网端口，也未模拟真实TLS和代理行为。"}
---
## net/http 如何组织一个请求
HTTP 服务器接受连接、解析请求并调用 Handler。Handler 接收 ResponseWriter 和 Request，前者写响应，后者提供方法、URL、请求头、正文与 context。中间件本质上是把一个 Handler 包装成另一个 Handler，可在前后做日志、认证、恢复和计时。

服务会并发处理请求，包级 map 或全局变量因此需要同步与用户隔离。每个请求的身份应来自服务端认证结果，不能信任客户端传来的 userId 或 tenantId。框架路由简化匹配，不会自动完成业务授权。
## ResponseWriter与Request的生命周期

Handler读取Request中的方法、URL、Header、Body和Context，并通过ResponseWriter写出状态、头与正文。Header应在写入响应开始前设置；第一次Write若尚未指定状态，通常会隐式开始成功响应。此后才发现错误，再调用http.Error并不能撤销已经发送的内容，所以解码和关键校验应尽量在提交响应前完成。

Request.Body是流，需要限制读取大小并处理读取错误。JSON解析成功后仍要确认字段和范围，不能把客户端传来的用户ID当身份。返回状态码表达协议层结果，正文提供业务字段；日志则保留排查所需的关联ID，避免把内部堆栈和密钥直接发给客户端。

## 中间件是按层包装的Handler

中间件接受下一个Handler，返回一个新的Handler，先做某些工作，调用next，再做收尾。认证、授权、恢复panic和日志的排列会影响行为，例如日志应能记录认证拒绝，恢复层应覆盖需要保护的调用范围。并非所有中间件都能在next返回后修改响应，因为正文可能已经发出。

Go服务会并发调用Handler。局部变量通常属于本次调用，但引用全局map、缓存或指针仍会共享；会话与租户上下文应按请求范围传递。中间件设置context值不是自动授权，具体业务仍需检查资源归属。

客户端使用Client发送请求时，非2xx状态通常不会自动成为Go error，需要检查StatusCode并按上游协议解析；传输成功与业务成功是不同层次。响应体必须关闭，流式消费要有大小与时间预算。复用Client/Transport有助于连接池复用，但连接与空闲参数需要匹配真实负载。

## 不开端口也能测试 Handler
```go
package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
)

func health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, "ok")
}
func main() {
	response := httptest.NewRecorder()
	health(response, httptest.NewRequest(http.MethodGet, "/health", nil))
	fmt.Println(response.Code)
	fmt.Println(response.Body.String())
}
```
真实运行时把 Handler 注册到 ServeMux，再配置 http.Server。显式设置适合业务的读头、读写与空闲超时；流式响应的预算与普通JSON请求不同，不能照搬一个全局短超时导致流中断。
## 读取 JSON 与写响应的边界
先限制请求体大小，再解码并验证字段；未知字段、重复提交、分页上限与字符串长度都要有规则。写响应正文前设置状态码与头，一旦响应已经开始发送，不能可靠地再把它改成另一份完整错误响应。
```flow
请求处理链
接收与协议解析｜连接和读写时间限制
认证与请求标识｜建立可信身份和日志关联
解码与校验｜限制大小、格式、字段和范围
业务授权与操作｜事务、幂等、外部调用预算
编码响应与记录｜状态码、内容类型、耗时，不泄露敏感数据
```
## 关闭与客户端连接复用
服务关闭时先停止接新请求，再在预算内等待进行中的请求结束，超时后按策略终止。调用外部 HTTP 时复用合理配置的 Client/Transport，并关闭响应体；每次请求都重建连接配置会浪费资源。

测试方法不匹配、非法JSON、超大请求体、未授权、超时与并发访问。httptest 验证业务 Handler 很方便，但连接级超时、代理行为和真实TLS还需要集成测试。
