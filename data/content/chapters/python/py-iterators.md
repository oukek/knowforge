---
{"id":"py-iterators","title":"Python 迭代协议、生成器与惰性数据处理","moduleId":"python","prerequisites":["py-control-flow","py-functions"],"sources":["py-types","py-functions"]}
---
## 可迭代对象与迭代器的区别
可迭代对象能提供迭代器，迭代器保存当前遍历进度并通过next产生下一项，结束时抛StopIteration。列表可多次创建独立迭代器；某个已经消费的生成器通常不能回到起点。for语句替我们执行获取迭代器、取下一项和结束处理。

惰性表示需要时才计算或读取下一项，不等于永远没有缓存。某个步骤如果先list(...)全量收集，前面生成器的内存优势也会丢失。资源和异常出现时间也会从创建时推迟到消费时。
## 可迭代对象与迭代器不是同一个概念

可迭代对象能够提供迭代器，例如列表每次 iter(list) 可以创建一份独立的遍历位置。迭代器则持有当前进度，调用 next() 取得下一项，耗尽时抛 StopIteration。for 循环替我们调用这套协议，并把正常耗尽当作循环结束。一个生成器对象通常本身就是迭代器，消耗后不会自动重新开始。

```python
values = ["a", "b"]
iterator = iter(values)
print(next(iterator))
print(list(iterator))
print(list(iterator))
print(list(values))
```

读取 a 后，该迭代器剩下 b；再次完整消费后为空。但 values 列表没有因此丢失元素。这说明“数据容器”和“遍历游标”需要分开理解。把迭代器传给两个消费者时，两者会共享进度，可能互相取走对方预期的数据。

## yield 保存的执行现场包含什么

包含 yield 的函数调用后得到生成器对象，函数体直到开始迭代才推进。运行到 yield 时把一个值交给消费者，同时保留局部变量、当前位置以及相关引用；下次 next 从暂停处继续。return 在生成器中表示结束，不是再产出一项。

```python
def take_positive(values):
    for value in values:
        if value > 0:
            yield value

stream = take_positive([-1, 2, 0, 3])
print(next(stream))
print(list(stream))
```

惰性意味着工作推迟到消费时，因此异常也可能在消费阶段才出现，而不是创建生成器时出现。它减少中间结果占用，但不会使原来已完整加载到内存的列表自动消失，也不保证生成器内部没有缓存大量数据。调试时不要随手 list(stream) 打印后再把同一 stream 交给业务逻辑，因为打印已经消耗它。

资源生命周期同样跟随实际消费：生成器捕获一个文件对象后，必须保证消费时文件仍然打开。需要提前停止的读取流程，应设计 close 或上下文管理边界。先理解同步的 iter/next/yield，再学习异步迭代的 __aiter__/__anext__，两者的核心区别在于取得下一项是否可能等待。

## 用 yield 写一个逐项管道
```python
def squares(values):
    for value in values:
        yield value * value

stream = squares([2, 3, 4])
print(next(stream))
print(list(stream))
print(list(stream))
```
第一次next执行到yield返回4并暂停；之后list继续从暂停点推进，得到9和16；再次消费已经结束的stream为空。生成器函数调用时先得到生成器对象，不是立即执行完内部循环。
```flow
惰性管道
输入迭代器｜按需提供原始项
过滤器｜丢弃不需要的项
转换生成器｜只处理当前项
消费者｜决定取多少、何时停止
关闭与清理｜提前停止也要释放外部资源
```
## 文件与网络让生命周期更重要
若生成器内部打开文件并yield，调用者只取前几项就放弃，文件释放时机必须明确。用上下文管理器让资源所有者围住消费过程，或明确提供close机制，避免依赖垃圾回收何时发生。

生成器中的异常会在next或for消费时抛出，不一定在创建stream的语句发生。日志和错误处理应围绕实际消费位置。异步迭代还有独立协议，async for等待异步下一项，不应与普通生成器混用。
## 怎样判断是否适合生成器
大数据、逐条转换、消费者可提前停止时通常适合；需要随机访问、反复遍历或排序全局结果时，可能必须物化或分批处理。测试空输入、只消费一项、完整消费、处理中失败和提前关闭，比只验证list(generator)更能覆盖真实用途。
