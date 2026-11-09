---
{"id":"py-context","title":"Python 上下文管理器：with、资源所有权与异常清理","moduleId":"python","prerequisites":["py-exceptions","py-iterators"],"sources":["py-types","py-functions"]}
---
## with 把资源生命周期写进结构
打开文件、借用连接或获取锁后，即使中途异常也要释放。普通“打开→操作→关闭”若操作抛错，最后一行可能永远不执行。with通过上下文管理协议，把进入和退出过程围住整个代码块，让清理与控制流绑定。

对象的__enter__返回给as后的变量，__exit__在离开块时接收异常信息。__exit__返回真值可以抑制异常，因此不能无意地返回True；大多数资源管理器清理后应让异常继续传播。
## 把 with 展开成进入、主体与退出

执行 `with manager as resource:` 时，先求值 manager 并调用它的进入方法，进入成功后才执行主体。as 后的 resource 是 __enter__ 的返回值，不一定是 manager 本身。主体正常结束、return、break 或抛异常都会经过退出步骤；如果进入本身就失败，主体尚未开始，资源对象必须自行处理已经取得的部分资源。

下面用 StringIO 代替磁盘文件，展示 class 形式的协议。__exit__ 接收异常类型、异常对象与 traceback；没有异常时对应值为 None。返回 False 表达不抑制异常，清理完成后让上层决定怎样处理失败。

```python
from io import StringIO

class TextResource:
    def __enter__(self):
        self.stream = StringIO("hello")
        return self.stream
    def __exit__(self, kind, error, traceback):
        self.stream.close()
        return False

with TextResource() as stream:
    print(stream.read())
print(stream.closed)
```

## 上下文管理器、try/finally 和装饰器怎样选

try/finally 是最直接的控制结构，适合一次性的收尾逻辑；上下文管理器把可复用的获取与释放协议封装起来，使调用处只关心作用域。装饰器包围整个函数调用，而 with 可以只包围函数内部的一小段操作，例如仅在更新共享状态期间持锁，随后释放锁再做网络请求。

嵌套 with 按进入的反顺序退出，类似先打开外箱再打开内盒，结束时先关内盒再关外箱。这对连接与游标、临时目录与文件等有依赖的资源很重要。退出函数自己也可能抛错，设计时要防止清理异常掩盖原始故障，日志应能保留异常链。

异步上下文使用 __aenter__ 与 __aexit__，允许获取或关闭时等待异步操作；它并不自动为主体开启新线程。选择 async with 的依据是资源协议本身，而不是当前函数恰好写成 async。

## 用 contextmanager 看清进入与退出
```python
from contextlib import contextmanager

@contextmanager
def session():
    print("open")
    try:
        yield {"active": True}
    finally:
        print("close")

try:
    with session() as value:
        print(value["active"])
        raise ValueError("failed")
except ValueError:
    print("handled")
```
yield之前执行进入逻辑，yield提供资源，之后的finally保证正常和异常退出都执行。yield后的代码不是“下一个迭代项”，该协议要求生成器在这个用法中正确提供一次资源。
## 清理不等于成功提交
数据库上下文可能把正常退出定义为提交、异常退出定义为回滚，但具体库各有契约。文件close释放句柄，不保证业务数据已经以所需方式持久化；网络请求取消也不能撤销远端副作用。应把“资源释放”和“业务完成”分别判断。
```flow
上下文中的操作
进入｜获取资源，失败则不进入主体
主体｜使用由上下文提供的对象
正常或异常离开｜退出逻辑得到控制
释放或回滚｜完成必要清理
传播结果｜是否抑制异常必须明确
```
## 多资源与异步资源
多个资源可嵌套with，ExitStack适合运行时决定数量的资源集合，按逆序释放。异步连接和锁用async with对应异步协议，不要在事件循环里用阻塞清理替代异步关闭。

测试获取失败、主体失败、退出失败与提前return。资源谁创建谁负责关闭，或明确将所有权转交；跨函数返回已被with关闭的文件对象是一种常见错误。
