## 惰性不等于资源自动安全
生成器每次 yield 暂停，局部变量和打开的资源继续存在。把 yield 的结果又收集成 list，或在生成器里先读取整个文件，仍会占用大量内存。资源归属要明确：谁创建文件/游标，谁保证消费完成或提前关闭时释放；不能依赖垃圾回收何时运行。

数据库驱动即使返回迭代接口，也可能已经缓冲全部结果，需要核对驱动的服务端游标/批量读取选项。API 的 yield 响应与数据库事务生命周期也不同，长时间持有事务可能阻碍清理或占住连接池。设计快照、批次与一致性边界，而不是只加一个 yield。
## 一个真实文件管道
```python
import csv
from contextlib import closing

def read_rows(path):
    with open(path, newline='', encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            yield {'id':row['id'], 'title':row['title'].strip()}

with closing(read_rows('articles.csv')) as rows:
    for index,row in enumerate(rows):
        print(row)
        if index == 9:
            break
```
closing 保证提前 break 后显式关闭生成器，触发内部 with 的退出。输入文件的列、编码和最大行长仍需验证，生成器不自动防止单行巨大数据。对异步生成器使用与接口匹配的 aclose/异步上下文管理，而不是同步 close。
## 内存上界怎么估算
设每批 b 行、每行平均 s 字节、并发批次数 c，光业务缓冲约 b×s×c，还要加 Python 对象开销、解码字符串、驱动缓冲和网络层。不要把文件大小简单除以批次数当 RSS。tracemalloc 反映 Python 跟踪的分配，不覆盖全部原生库和系统缓冲；RSS 与峰值测量要一起看。
## 慢消费者和异常传播
下游写入变慢时限制在途批次数，不能无界 asyncio.create_task。超时/取消时关闭生成器、游标和响应流；流式响应头已发出后，错误不能再任意改成新的 HTTP 状态，应明确中断/终止事件并保留任务状态。已提交的数据批次若要重试，使用主键和版本实现可重放，不把整个导出任务重新扣费。
## 验收清单与反例
以空文件、坏行、超长行、消费到第三条 break、下游失败和客户端断开测试。增加文件规模，RSS 应趋于受控平台而不是随行数线性增长；同时确认输出完整性和顺序。较小样本的低峰值不能证明真正使用流式驱动，需要观察查询行为与连接占用。
