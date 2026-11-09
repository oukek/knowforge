---
{"id":"go-channels","title":"Go channel 与 select：通信、阻塞、关闭和取消","moduleId":"go","prerequisites":["go-goroutines"],"sources":["go-docs"],"new":true,"language":"go","order":8,"logs":["9"],"exampleExplanation":"生产者发送2、3、4后关闭channel。接收方range持续取值，直到已关闭且缓冲耗尽，再打印累计值9。缓冲容量为2限制排队，不会丢弃第三个值。"}
---
## channel 传值，也建立同步关系
channel 可以让 goroutine 发送与接收指定类型的值。无缓冲 channel 的一次发送需要与接收相遇；有缓冲 channel 在容量未满时可以暂存，容量满了发送仍会等待。缓冲容量不等于允许无限积压，channel 也不是消息队列持久化系统。

发送与接收提供语言内存模型规定的同步关系，但不能由“用了 channel”推断所有共享对象都安全。发送一个指针后双方仍同时改指向对象，照样可能发生数据竞争。需要明确所有权是否随消息转移。
## 无缓冲和有缓冲channel怎样改变等待

`make(chan T)`创建无缓冲channel，发送和接收需要配对，发送方通常等到有接收者接走值。`make(chan T, n)`增加容量为n的缓冲，未满时发送可以先放入队列，满时仍会等待。缓冲将双方短时速度差异转成队列占用，不会使慢消费者消失，也不能保证无限吞吐。

发送写作`ch <- value`，接收写作`value := <-ch`。`value, ok := <-ch`中的ok为false表示channel已关闭且没有剩余值；若数据类型的零值本身有效，不能只看value判断结束。range ch持续读取，直到关闭且缓冲耗尽。

## 关闭是结束协议，不是通用资源释放

close告诉接收方未来不会再有值，通常由确定所有发送都结束的一方负责。接收方不应为了“不想收了”随意close，否则仍在发送的任务会panic；它应通过context或独立信号通知停止。已关闭channel不能再次close，也不能再发送；从nil channel收发会一直阻塞，可在select设计中有意识使用，但不应由未初始化错误意外触发。

select从可推进的通信中选择一个；若多个分支都就绪，不承诺优先选择代码写在最前面的取消分支。加入default会使无就绪分支时立即返回，因此循环里无等待地select default可能变成忙等。超时和取消应表达清楚的控制流，而不是随手添加default“防卡死”。

channel适合交接数据与所有权，Mutex适合保护共享状态，两者没有绝对高低。若只是保护一个共享缓存，强行所有读写都经单个channel可能让实现更难；若是流水线传递任务，channel则能同时表达数据流和背压。

## 完整的生产与消费
```go
package main

import "fmt"

func main() {
	values := make(chan int, 2)
	go func() {
		defer close(values)
		for _, value := range []int{2, 3, 4} {
			values <- value
		}
	}()
	total := 0
	for value := range values {
		total += value
	}
	fmt.Println(total)
}
```
发送方知道不会再产生数据，因此负责关闭；range 消费到 channel 关闭且缓冲数据取尽后结束。向已关闭 channel 发送会 panic，重复 close 也会 panic。接收者不能仅因“不想看了”就关闭还可能被发送的 channel，应通过取消协议通知生产者退出。
## select 如何选择就绪操作
select 等待多个 channel 操作，有多个就绪时不会承诺按源码从上到下优先。default 在没有其它操作可立即执行时运行，放在无等待的无限循环里可能空转消耗 CPU。nil channel 的收发会阻塞，可用于有意禁用某个分支，但忘记初始化时就成了死等。
```flow
带取消的通信
生产者准备值｜计算或读取下一条
select 发送或观察取消｜避免只等一个永远没有接收者的操作
消费者接收｜处理数据或报告退出
生产者结束并关闭｜只有明确负责结束的一方关闭
消费者排空并返回｜任务生命周期收束
```
## 如何选择 channel 与锁
channel 适合任务分发、流式传递和所有权协调；锁适合保护共享结构的短临界区。两者可以组合，不必把所有 map 操作都包成复杂消息协议。选型依据是数据流和不变量，不是“Go 推荐 channel 所以锁都不好”。

测试关闭前后、缓冲满、消费者提前退出和取消。不要靠定时 sleep 让测试侥幸通过，也不要通过 recover 吞掉 send on closed channel 来掩盖生命周期设计错误。
