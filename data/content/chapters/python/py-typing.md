---
{"id":"py-typing","title":"Python 类型提示：静态检查、Protocol 与运行时验证","moduleId":"python","prerequisites":["py-functions","py-oop"],"sources":["py-types","py-functions"]}
---
## 注解给工具和读者的信息
`name: str` 表达期望值是字符串，静态检查器可以分析调用是否匹配；Python默认运行时不会因这个注解自动拒绝整数。类型提示与外部数据验证是两层：前者发现代码中的不一致，后者处理网络、文件和用户输入中的真实不可信数据。

list[str]描述元素类型，str | None表达可以缺失，返回None与返回空列表应按业务区分。Any会让很多静态约束失效，适合受控边界，不应成为避免修复类型问题的通用出口。
## 用类型表达值之间的关系

基本注解写在参数、返回值和变量位置。`list[int]` 表达元素都是整数，`dict[str, int]` 表达字符串键到整数值的映射。联合类型 `str | None` 表达两种可能；它不表示“调用时可以不传参数”，是否可省略由默认参数决定。`def find(name: str) -> str | None` 仍要求传入 name。

类型缩小让检查器根据控制流知道后续分支里值的范围。例如先排除 None，再调用字符串方法。这里的检查也实际在运行时执行，而 cast 只改变工具的看法，不会产生同样的保护。

```python
def display_name(value: str | None) -> str:
    if value is None:
        return "匿名"
    return value.strip() or "匿名"

print(display_name(None))
print(display_name(" Lin "))
```

## 泛型、Any 和 object 应该怎样区分

泛型表达输入与输出类型之间的联系，例如一个取首项函数，给它整数列表会得到整数或缺失，给它字符串列表会得到字符串或缺失。如果全部写 Any，检查器就无法保留这种关系。不同 Python 版本支持的泛型语法有差异，项目应统一目标版本后选择写法。

object 表示可能是任何 Python 对象，但在不知道具体能力时不能随意调用专有方法；Any 则让静态检查在相关操作上放宽约束，容易使错误沿调用链传播。边界上拿到未知 JSON，先视为未知并验证，再构造内部类型，比一开始把它标成 Any 后一路传递更稳妥。

TypedDict 可以描述字典预期字段，Protocol 可以描述对象提供的方法，两者仍主要服务于静态分析。它们不会因为网络返回字段不对就自动抛验证错误。需要运行时校验时，使用手写校验或专门验证库，并把缺字段、额外字段、类型转换及数值范围的规则写清楚。

## 用 Protocol 描述行为依赖
```python
from typing import Protocol

class Sender(Protocol):
    def send(self, message: str) -> None: ...

class ConsoleSender:
    def send(self, message: str) -> None:
        print(message)

def notify(sender: Sender, title: str) -> None:
    sender.send(title)

notify(ConsoleSender(), "ready")
```
调用者依赖send能力，具体类不必继承Protocol才能在静态结构判断中匹配。运行时是否执行协议检查、检查哪些能力有额外规则，不能把类型提示当成安全边界。
## 类型缩小与未知数据
拿到JSON后先验证它是预期对象、字段存在、类型和范围符合约定，再转为内部类型。仅使用cast只是告诉检查器相信某类型，不会转换或验证实际对象。可选字段要在使用前处理None，避免一边标注Optional一边假装永不缺失。
```flow
外部数据到内部类型
解析字节｜JSON、CSV 或其它格式
验证结构与范围｜真实运行时检查
构建内部对象｜类型契约明确
静态分析内部调用｜发现不匹配和未处理分支
```
## 工程里的渐进采用
先为公共接口、核心数据结构与复杂返回值加注解，再逐步收紧检查。固定检查器与配置版本，避免团队各自使用完全不同的规则。泛型用于表达输入输出之间的类型关系，不是为了让签名看起来更复杂。

测试仍然需要验证值和副作用，类型正确的负金额、越权ID或过期token都可能是业务错误。把静态检查、运行时校验与自动测试组合起来，才能覆盖不同层次的问题。
