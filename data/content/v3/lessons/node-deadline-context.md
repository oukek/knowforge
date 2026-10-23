## 一次请求到底拥有些什么
请求拥有认证后的主体、requestId、起始时间、截止时间和取消信号。这些数据是调用上下文，不能存入进程级的 currentUser；同一进程会交错处理多个请求。AsyncLocalStorage 把存储绑定到异步执行链，不是给每个 HTTP 请求分配线程，也不会自动让跨消息队列的消费者获得上下文。队列消息应显式携带经过校验的 traceId、tenantId 与 deadline，消费者重新建立可信边界。

把客户端断开、业务超时和下游故障分开：客户端断开后继续查询会浪费连接池容量；业务超时应取消仍在运行的 I/O；下游 503 不应该被统一解释成用户取消。日志至少记录错误类别、耗时、剩余预算、下游状态和重试次数，避免把所有异常都包成 500。
## 预算传播的推导
总预算 800ms，认证消耗 70ms、排队消耗 130ms，数据库阶段最多还剩 600ms。若每一层都重新设置 800ms，三次顺序调用就可能拖到数秒。使用单调时钟计算同进程剩余预算；跨进程传播相对超时并扣除已消耗时间，谨慎处理机器时钟偏差。只有可安全重试的操作才重试，而且等待与下一次尝试也必须放进同一个预算。

取消是协作协议。AbortController.abort() 只是发送信号，下游库必须接收并处理它；CPU 密集循环不能因 signal 被设置就自动让出线程。截止时间还应传给数据库驱动的超时或连接获取阶段，不能仅对 fetch 设置 timeout。
## 服务端参考代码：明确资源归属
以下在 Node 24+ 本地运行；浏览器实验只验证预算传播，不启动服务器。
```javascript
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
createServer((req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('deadline')), 800);
  const disconnected = () => { if (!res.writableFinished) controller.abort(new Error('client_closed')); };
  res.on('close', disconnected);
  context.run({ requestId: crypto.randomUUID(), end: performance.now()+800 }, async () => {
    try {
      const remaining = Math.max(0, context.getStore().end-performance.now());
      if (!remaining) throw new Error('deadline');
      const response = await fetch('http://127.0.0.1:9000/report', {signal: controller.signal});
      if (!response.ok) throw new Error('downstream_'+response.status);
      const text = await response.text();
      if (!res.destroyed) res.end(text);
    } catch (error) {
      if (!res.destroyed) { res.statusCode=controller.signal.aborted?504:502; res.end('request failed'); }
    } finally { clearTimeout(timer); res.off('close', disconnected); }
  });
}).listen(8080);
```
示例省略真实认证和结构化日志，不能把外部任意 requestId 当可信用户身份。成功响应的正常 close 不应被计为取消，因此同时检查 writableFinished。
## 如何做故障实验
让下游分别延迟 50ms、1000ms、返回 503，并在请求中途主动断开客户端。验证正常响应不被计为取消，超时后下游连接被释放，客户端断开不继续发送响应。并发发送两个不同租户请求，在 await 前后记录上下文，确认没有串号。再对数据库连接池制造等待，观察预算是否在尚未发出 SQL 时就已耗尽。
## 工程边界与迁移
请求上下文只携带小型不可变元数据，不能长期挂住整个 req/res。后台任务不应继承已经结束的 HTTP 生命周期，应有独立任务 ID、重试预算和持久状态。遇到延迟升高时先区分排队时间与实际处理时间；无限加大超时只会让资源被占用更久。
