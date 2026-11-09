---
{"id":"py-control-flow","title":"Python 条件、循环、推导式与输入处理","moduleId":"python","prerequisites":["py-syntax"],"sources":["py-types","py-functions"],"new":true,"language":"python","order":-9,"logs":["[(1, 92), (2, 73)]","165"],"example":"scores=[58,92,73,40]\npassed=[]\nfor index,score in enumerate(scores):\n    if score>=60:\n        passed.append((index,score))\nprint(passed)\nprint(sum(score for score in scores if score>=60))","exampleExplanation":"enumerate提供从0开始的位置；分数92与73满足大于等于60，保留位置1与2，随后生成器表达式把合格分数交给sum，合计165。"}
---
## 分支选择路径，循环重复工作
if/elif/else 根据布尔条件选择代码块；for 依次从可迭代对象取元素；while 在条件仍成立时继续。for 不是只能遍历数字范围，字符串、列表、字典和生成器都可以按各自协议提供元素。range 表示整数序列范围，结束值不包含在结果里。

break 提前结束最近一层循环，continue 跳过本轮剩余部分。循环后的 else 在没有 break 正常结束时执行，不是“循环条件为假就一直执行”的另一分支。嵌套循环中要明确作用于哪一层。
## 条件怎样组合，代码块怎样结束

一个 if 后面可以接若干 elif 和至多一个 else；按顺序找到第一个真值条件后，只执行对应分支，其余分支跳过。独立写两个 if 则是两次判断，两个代码块可能都执行。比如优惠档位通常是互斥选择，通知规则则可能需要多个条件同时生效，结构应由业务关系决定。

比较可以串联：`0 <= score <= 100` 表达合法分数范围。`and` 要两边都满足，`or` 表达至少一边满足，`not` 取反。短路可以保护后续操作：`value is not None and value > 0` 在缺失时不会继续比较。不要把 `score == 90 or 100` 当成“90或100”；后面的100本身为真，应使用 `score in (90, 100)`。

## for 与 while 各有自己的推进方式

for 每轮向迭代器取下一项，耗尽时结束；while 每轮重新检查条件，需要程序自己改变相关状态。忘记推进变量是 while 无限循环的常见原因。range(start, stop, step) 表示按步长推进的整数序列，stop 不包含在内，range(3) 依次产生0、1、2，而不是1、2、3。

```python
remaining = 7
chunks = []
while remaining > 0:
    size = min(3, remaining)
    chunks.append(size)
    remaining -= size
print(chunks)

for value in [4, 8, 12]:
    if value % 5 == 0:
        print("找到", value)
        break
else:
    print("没有五的倍数")
```

while 的不变量是 remaining 表示尚未处理的数量，每轮严格减少且不小于0；这同时解释循环做什么以及为什么会结束。for 的 else 只在未被 break 中断时执行，所以适合表达“搜索完整集合仍未找到”。遇到需要跳过一个坏记录而继续其它记录的情况，用 continue；遇到整个目标已经达成，用 break。它们只影响所在的最近一层循环，不能替代函数 return。

## 先用普通循环写清数据处理
```python
scores = [58, 92, 73, 40]
passed = []
for index, score in enumerate(scores):
    if score >= 60:
        passed.append((index, score))
print(passed)
print(sum(score for score in scores if score >= 60))
```
enumerate 同时提供位置与元素，避免手动维护计数器。第二条打印使用生成器表达式，把符合条件的分数逐项交给 sum，不必先构造完整中间列表。这里的筛选规则是业务条件，应明确边界60是否包含。
## 推导式何时清楚，何时过度
列表推导式 `[x*x for x in values if x>0]` 适合简洁的映射与过滤。加入多层循环、复杂条件和副作用后，应改回普通循环或提取函数。字典推导式遇到重复键会保留后面的值，不能用它无声丢弃本应报告的数据冲突。
```flow
处理输入集合
确认输入范围和元素类型｜空值、缺字段、异常数据
遍历与筛选｜明确保留条件
转换或聚合｜单位、顺序、重复项规则
输出结果｜列表、字典或逐项消费的迭代器
```
## 遍历期间修改容器的风险
对列表一边遍历一边删除可能跳过元素；字典在迭代期间改变大小可能报错。需要过滤时生成新容器，或在明确安全的索引策略下修改。遍历巨大数据还要避免先 list(...) 全量读入，让内存占用失控。

测试空集合、只有一个元素、全部满足、全部不满足以及非法数据。正确性应来自明确不变量，例如“passed 始终只包含已处理且合格的元素”，不只是看一次打印结果似乎合理。
