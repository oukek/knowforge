---
{"id":"py-functions","title":"Python 函数：参数绑定、返回值、默认值与调用契约","moduleId":"python","prerequisites":["py-objects"],"sources":["py-types","py-functions"]}
---
## 函数把一段行为命名并定义输入输出
def 创建函数对象，调用时把实参按规则绑定到形参，再执行函数体。return 给调用者结果；print 只是输出文本，不会替调用者保存返回值。函数执行到末尾没有 return 时返回 None，这与返回空列表或0不是同一语义。

位置参数按位置绑定，关键字参数按名称绑定。默认值在定义时求值，所以默认列表可能被所有调用共享。参数设计要让调用者容易理解，不能依赖阅读函数内部才能知道单位与允许范围。
## 参数的写法表达怎样的调用契约

定义时写的是形参，调用时传的是实参。位置参数按顺序绑定，关键字参数按名字绑定。`*args` 收集多余位置参数为元组，`**kwargs` 收集多余关键字参数为字典，它们不是必须使用的魔法名字，只是通行约定。普通业务函数应先使用明确参数，只有需要转发或开放扩展时才引入任意参数集合。

签名里的 `/` 将左边参数限制为仅位置传递，单独的 `*` 将右边参数限制为仅关键字传递。关键选项用关键字可避免调用处出现 `send(data, True, False, 3)` 这类难读表达。默认值在执行 def 时求值一次，所以默认空列表会被多次调用共享；需要每次调用一份新容器时使用 None 后在函数内部创建。

```python
def add_tag(tag, tags=None, *, unique=True):
    if tags is None:
        tags = []
    if not unique or tag not in tags:
        tags.append(tag)
    return tags

print(add_tag("python"))
print(add_tag("go"))
```

## 返回值、调用栈与函数作为数据

return 结束当前函数并交回值；没有显式 return 或只写 return，结果都是 None。`return a, b` 实际返回一个元组，调用方可解包。函数内调用其它函数时，程序暂时进入新的调用帧，内层返回后回到调用位置继续；递归则让同一函数多次建立调用帧，需要终止条件，也受调用深度和内存限制。

函数本身也是对象，可以赋给变量、放进容器或作为参数传递。`sorted(records, key=...)` 需要的是可调用对象，不是提前计算一次后的结果。高阶函数、回调和装饰器都建立在这个事实之上，但保持参数与返回契约清晰比写成一行 lambda 更重要。

```python
def transform(values, operation):
    return [operation(value) for value in values]

def square(value):
    return value * value

print(transform([2, 3], square))
```

设计函数时把纯计算与副作用分开：返回折扣金额的函数容易测试；直接读取全局配置、改数据库并打印金额的函数会引入多个隐藏依赖。必要依赖可以作为参数传入，让调用者知道这次工作需要什么。

## 写清参数和结果
```python
def add_tag(tag, tags=None, *, normalize=True):
    if tags is None:
        tags = []
    value = tag.strip().lower() if normalize else tag
    return [*tags, value]

print(add_tag(" Python "))
print(add_tag("Go"))
print(add_tag("Vue", ["web"], normalize=False))
```
None 哨兵避免共享默认容器；星号后的 normalize 要按关键字传递，调用意图更明显。返回新列表使函数不修改调用者传来的 tags，但列表里的复杂元素仍可能共享，契约应说明复制层次。
## 可变参数与位置限定
*args 收集多余位置参数为元组，**kwargs 收集关键字参数为字典。转发参数时仍需避免重复给同一形参赋值。签名中的 `/` 可以限定之前的形参只按位置传，`*` 限定之后按关键字传；这些符号是在表达接口约束，而不是任意增加复杂度。
```flow
一次函数调用
计算实参表达式｜先得到实际对象
根据签名绑定形参｜检查缺失、重复与多余参数
执行函数体｜局部名字与外部对象遵循绑定规则
return 或异常｜明确成功结果与失败通道
调用者继续｜决定使用结果、捕获错误或传播
```
## 纯函数与副作用如何分工
输入相同得到相同结果且不修改外部状态的计算更容易测试。文件写入、网络请求和数据库更新应通过清楚的接口隔离，错误不应被吞成一个含糊的空值。类型注解帮助读者和静态工具，但默认不会在运行时自动拒绝错误类型。

为函数准备正常输入、空输入、错误类型、边界和重复调用测试。重复调用尤其能暴露默认参数共享与隐藏状态；用一个第一次调用成功的例子无法证明接口稳定。
