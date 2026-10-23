## 为什么流式接口仍可能撑爆内存
把文件分块读取不等于有内存上界。若生产者每秒产出 10MB，消费者每秒仅处理 2MB，忽略背压时积压每秒增加 8MB。highWaterMark 是触发暂停的阈值，不是进程的硬性内存限制；还要计入多个流的缓冲、解码后的字符串、业务队列和对象引用。对象模式按对象数量计水位，一个对象可能包含数十 MB。

write(chunk) 返回 false 表示数据已被接收但缓冲已达到阈值，此时应等待 drain，不能把这块数据再写一遍，也不能继续无界生产。背压是一条从慢消费者向上游传播的节流信号；把所有块先收进数组再调用 pipeline 会破坏这一点。
## 端到端链路与资源清理
读取、解压、解析、变换、写入中的任意阶段失败，都需要让整条链停止。手动 pipe 容易漏掉错误监听和关闭顺序；stream/promises.pipeline 把链路成功/失败汇聚成 Promise，并在失败时销毁相关流。AbortSignal 用于外部取消；但用户实现的变换若不返回或阻塞 CPU，框架不能魔法中断。
## Node 24+ 可运行示例
```javascript
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
let count=0;
const source=Readable.from((async function*(){
  for(let i=0;i<20;i++) yield Buffer.alloc(1024,i);
})());
const sink=new Writable({highWaterMark:2048, write(chunk,encoding,done){
  count+=chunk.length;
  delay(5).then(()=>done(),done);
}});
await pipeline(source,sink,{signal:AbortSignal.timeout(3000)});
console.log(count); // 20480；写入完成以后才输出
```
使用异步生成器作为生产者可以在下游暂停时停止继续生成。真实网络上传还要限制总文件大小和持续时间；慢速攻击即使不撑爆瞬时内存，也可能长时间占用连接。
## 实验和诊断
把消费延迟从 5ms 提高到 100ms，观察 writableLength、RSS 和总耗时。如果 RSS 持续线性增长，查找链路外的数组缓存、未完成 Promise 集合和监听器引用；如果内存稳定但吞吐低，观察 CPU、磁盘或下游限速，而不是只调大水位。中途让 sink 返回错误，确认 source 停止生产且 pipeline reject。
## 场景迁移：SSE 与大模型输出
浏览器读得慢时，HTTP 响应也需要背压。把每个 token 都立刻写入队列会放大事件数量，应做有界合并与节流，保留事件序号。连接断开后取消上游生成，否则服务端仍可能消耗模型 token。对于已持久化的业务事件，可以用 last-event-id 恢复；仅在内存里的 token 不能凭一个编号保证可重放。
