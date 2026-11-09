---
{"id":"py-regex","title":"Python 正则表达式：模式、匹配范围、分组与复杂度","moduleId":"python","prerequisites":["py-unicode"],"sources":["py-types","py-functions"]}
---
## 正则是在字符串里描述局部模式
字符类描述允许字符，量词描述重复次数，分组组织子模式。search寻找某处匹配，match从开头尝试，fullmatch要求整个字符串符合。验证完整字段时仅用search可能接受带额外垃圾的输入；选择API与写模式同样重要。

Python原始字符串如r"\d+"减少字符串层面对反斜杠的解释，但不关闭正则自身语法。点号、星号等若要当普通文本匹配，需要escape；把用户词直接拼进模式会改变匹配含义。
## 从最小的模式读起

普通字母通常匹配自身，`[abc]` 匹配其中一个字符，`[^abc]` 表示不在其中；`[0-9]` 表达ASCII数字范围。`\d` 等预定义类的Unicode行为取决于模式与标志，因此账号若只允许ASCII，应明确写范围。点号默认匹配大多数单字符，但通常不含换行；启用DOTALL会改变这个规则。

量词跟在前面的一个原子或分组之后：`?` 为零或一次，`*` 为零或多次，`+` 为一或多次，`{2,4}` 为二至四次。`(ab)+` 重复整个ab，`ab+` 只重复b。括号还会捕获内容，不需要捕获时可用 `(?:...)`；`a|b` 表达分支，复杂组合要用括号明确范围。

## 同一个模式为什么需要不同匹配入口

```python
import re
pattern = re.compile(r"[0-9]{2}")
text = "x12y"
print(pattern.search(text).group())
print(pattern.match(text) is None)
print(pattern.fullmatch(text) is None)
print(re.findall(r"[A-Za-z]+", "one 12 two"))
```

search可在任意位置找到12，match必须从开头尝试，fullmatch还要求整个输入都被覆盖。findall收集匹配结果，finditer逐个提供Match对象，后者更方便读取位置与分组，也避免立刻建立完整结果列表。sub负责替换，若替换逻辑依赖匹配内容可传入函数。

原始字符串只处理Python字符串这一层，正则引擎仍解释其中的反斜杠。动态搜索一个用户给的字面词时，使用re.escape把特殊字符转成字面含义；否则用户输入的点号或星号会变成模式操作符。学会每个符号表达什么之后，再考虑压缩模式长度，可读性比一条极复杂的表达式更重要。

## 一个有边界的解析例子
```python
import re
pattern = re.compile(r"(?P<name>[A-Za-z_][A-Za-z_0-9]*)=(?P<value>[0-9]+)")
match = pattern.fullmatch("count=12")
if match:
    print(match.group("name"))
    print(int(match.group("value")))
print(pattern.fullmatch("count=12 extra") is None)
```
具名分组让字段意图清楚。这个例子明确只允许ASCII标识符和非负十进制整数，不假装覆盖所有配置语言。正则匹配成功后仍需检查数值范围与业务约束。
## 贪婪、非贪婪与解析边界
量词默认尽可能扩展，非贪婪改为尽可能短，但两者都需要满足整个模式。把HTML用一个`<.*>`或`<.*?>`处理无法可靠理解嵌套、属性、实体和错误文档；结构化格式优先使用相应解析器。
```flow
选择解析方式
明确输入语法｜固定字段还是嵌套结构
简单局部模式｜可用有界正则
复杂HTML、JSON等｜使用专门解析器
提取后验证｜字段类型、范围与完整性
```
## 性能与安全限制
某些重叠量词与回溯组合在特定输入上会急剧变慢。限制输入长度、减少模糊分支、避免重复嵌套量词，并用恶劣输入测试。编译模式可复用，但不能修复本身具有灾难性回溯的规则。

测试空串、边界字符、末尾换行、Unicode与超长不匹配输入。不要只用一个成功样本判断模式正确，也不要以正则替代完整的数据校验、授权和语法解析。
