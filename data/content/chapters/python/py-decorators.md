---
{"id":"py-decorators","title":"Python 装饰器：函数包装、参数转发和异步边界","moduleId":"python","prerequisites":["py-functions","py-scope"],"sources":["py-types","py-functions"]}
---
## 装饰器在函数定义时发生什么
函数在Python里也是对象，可以作为参数传递和返回。装饰器接收一个函数并返回替代对象，`@decorate` 相当于在定义后执行 `function=decorate(function)`。调用者之后调用的通常是包装函数，而不是绕过包装直接进入原函数。

计时、权限、缓存与重试常用装饰器，但它不能随意改变函数的返回值、异常与同步/异步契约。多个装饰器按嵌套顺序组合，顺序会影响行为，例如缓存是否绕过权限检查必须特别小心。
## 装饰器语法究竟执行了哪一步

`@decorate` 写在函数定义前，概念上相当于先创建原函数，再执行 `function = decorate(function)`。decorate 接收一个可调用对象并返回替代对象；通常返回包装函数，用来在调用前后执行额外逻辑。装饰发生在函数定义执行时，而包装器的业务逻辑发生在以后每次调用时，这两个时点必须分清。

若装饰器还接收参数，例如 `@repeat(2)`，则 repeat(2) 先返回真正的装饰器，再由它接收原函数。多层装饰器从靠近 def 的一层开始包裹；调用时最外层最先进入。认证、缓存和计时的排列会改变语义，不能认为换个顺序只影响日志外观。

## 一个保留元信息的完整包装器

```python
from functools import wraps

def trace(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        print("enter", function.__name__)
        try:
            return function(*args, **kwargs)
        finally:
            print("leave", function.__name__)
    return wrapped

@trace
def double(value):
    """计算两倍值。"""
    return value * 2

print(double(4))
print(double.__name__)
```

wrapped 接收并转发参数，也必须返回原函数结果，否则被装饰函数会无意返回 None。finally 使退出记录在异常时也执行；异常仍向上传播。wraps 复制常见元信息并设置 __wrapped__，让帮助文档、测试和一些反射工具仍能识别原函数，但不会自动修复所有签名或异步语义。

异步函数需要能 await 原调用的异步包装器。普通包装器若只拿到协程对象就结束计时，测到的只是创建协程的时间。生成器也要分清创建与迭代阶段。装饰器应保留原有成功、失败和取消契约，而不是为了复用几行逻辑悄悄改变调用模型。

## 写一个保持返回值和元信息的包装
```python
from functools import wraps

def trace(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        print("begin", fn.__name__)
        return fn(*args, **kwargs)
    return wrapped

@trace
def add(a, b=1):
    return a + b

print(add(2, b=3))
print(add.__name__)
```
*args/**kwargs 转发调用参数，return 保留原结果，wraps复制常用元信息并保留包装关系。忘记return会让调用者得到None，即使原函数内部计算完全正确。wraps不是类型安全或签名运行时校验的替代。
## 缓存和重试会改变语义
缓存要定义键、生命周期、容量和失效，用户身份或租户若未进入键，可能泄露数据。重试要限制可重试错误、总预算与次数；有副作用的操作需幂等，不能看见异常就自动多执行一次。
```flow
装饰器调用关系
定义原函数｜建立原始行为契约
装饰器接收函数｜返回包装对象
调用包装对象｜前置检查或计时
调用原函数并传递结果｜保留异常与返回值语义
执行必要收尾｜即使失败也按契约清理
```
## 异步函数不能用同步模型猜测
同步包装器直接调用async函数只拿到协程对象，计时可能仅测到创建对象的时间。异步包装器应在async def中await原调用，并正确传播取消。判断一个装饰器是否正确，须测试普通结果、抛错、参数绑定、方法接收者和异步取消，而不是仅看日志是否多了一行。
