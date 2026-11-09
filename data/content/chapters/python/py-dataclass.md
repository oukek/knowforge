---
{"id":"py-dataclass","title":"Python dataclass：数据类、默认工厂、比较与冻结边界","moduleId":"python","prerequisites":["py-oop"],"sources":["py-types","py-functions"]}
---
## dataclass 减少重复样板，不改变对象模型
一个数据类经常需要初始化参数、打印表示和按字段比较。dataclass根据字段注解生成这些常见方法，减少重复代码；生成后的对象仍是普通Python类实例，不会自动变成数据库记录或运行时数据校验器。

字段顺序、默认值、是否参与比较等都是契约的一部分。类型注解说明期望类型，但创建对象时传错类型通常不会自动报错。需要接收外部输入时，依然应使用明确验证步骤。
## 普通类的哪些部分被自动生成

对标注了字段的类使用 @dataclass，默认会生成接收字段的 __init__、便于观察的 __repr__ 和基于参与比较字段的 __eq__。这相当于减少重复样板，不等于省去业务设计。字段是否必填、默认值是否共享、哪些内容参与相等比较，都要按用途决定。

例如事件记录的 payload 相同，但 event_id 不同，是否应视为同一事件？答案取决于业务标识，不能机械接受所有字段比较。`field(compare=False)` 可排除某些字段；排序、哈希和冻结选项有相互约束，作为字典键前需要确认对象的稳定性。

## 默认工厂与冻结对象的具体边界

```python
from dataclasses import dataclass, field, replace

@dataclass(frozen=True)
class Settings:
    name: str
    labels: list[str] = field(default_factory=list)

original = Settings("dev")
updated = replace(original, name="prod")
original.labels.append("shared")
print(original.name, updated.name)
print(updated.labels)
```

default_factory 在每次需要默认字段时调用，因此不同的全新 Settings 实例默认拥有各自列表。replace 创建一个新实例，但未替换的字段值会被传递过去，示例中的 labels 仍共享。frozen 限制常规字段重新赋值，不会递归冻结列表，所以仍能 append。真正需要不可变配置时，字段也要使用适合的不可变结构，例如元组，并控制其成员。

__post_init__ 可以在生成的初始化后执行派生计算或校验，但不是必须把所有规则都塞进去。网络输入的解析和错误报告往往需要单独的验证边界；dataclass 注解本身不会把 "3" 自动变成整数3。asdict 也不是对外接口的全部设计，序列化字段、敏感信息和版本兼容仍需显式控制。

## 为每个实例创建自己的容器
```python
from dataclasses import dataclass, field

@dataclass
class Course:
    title: str
    tags: list[str] = field(default_factory=list)

first = Course("Python")
second = Course("Go")
first.tags.append("language")
print(first.tags)
print(second.tags)
```
default_factory保存创建函数，每次需要默认值时调用，因此不是所有实例共享一份列表。默认工厂必须是无参可调用对象，复杂初始化可以用独立函数或__post_init__，同时保持校验与副作用边界清楚。
## frozen 不等于深度不可变
frozen限制字段重新赋值，但字段引用的可变对象仍可能被修改。冻结对象里保存list，不会自动让append失效。需要真正稳定的值对象时应选择不可变字段结构，并谨慎考虑哈希和比较语义。
```flow
数据类创建
字段声明｜类型提示、默认值与比较设置
生成常见方法｜初始化、表示、相等等
实例构造｜默认工厂为本实例创建值
业务校验｜检查范围与跨字段约束
后续使用｜冻结与嵌套对象可变性分别判断
```
## 序列化与业务身份
dataclass的值相等不必等于数据库里的同一条记录；身份可能由业务ID定义。asdict会递归处理数据，但不能随意把含敏感字段的整个对象直接返回API。日期、金额和自定义类型仍需明确传输格式。

测试多个实例默认值独立、非法字段、比较结果与冻结嵌套修改。dataclass适合结构清楚的数据载体，不应让它同时承担连接管理、网络请求与复杂状态机的全部职责。
