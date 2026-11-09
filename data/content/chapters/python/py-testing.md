---
{"id":"py-testing","title":"Python 测试：断言、夹具、替身与边界案例","moduleId":"python","prerequisites":["py-exceptions","py-context"],"sources":["py-types","py-functions"]}
---
## 测试是行为说明，不只是覆盖行数
测试输入、动作和可观察结果表达一个契约。覆盖率说明哪些代码被执行，不说明断言是否有效。一个测试把函数输出再按同样算法算一遍，可能与实现一起犯错；更好的预期来自简单独立推导、业务规则或已知小样本。

纯逻辑优先用无外部依赖的单元测试，数据库、HTTP和文件边界需要合适集成测试。测试数据应隔离，不能为了方便连接生产库或真实收费模型。
## 一个有效测试要先确定观察哪种行为

单元测试聚焦一个小边界，例如函数返回值、抛出的异常或对象状态变化；集成测试验证两个真实部分能否合作，例如驱动能否按预期提交事务。端到端测试从用户入口穿过多个系统层，覆盖路径更完整，但更慢且故障定位更困难。三者覆盖的风险不同，不能只堆一种测试数量。

Arrange、Act、Assert是常见组织方式：先安排输入和依赖，再执行一个动作，最后断言契约。测试名应说明触发条件和预期结果。断言不应仅确认“没有抛错”；例如删除操作还应检查目标确实消失、其它记录未被删除，权限错误则应检查数据保持不变。

## 用依赖注入控制外部边界

```python
def send_summary(title, sender):
    if not title.strip():
        raise ValueError("标题不能为空")
    sender.send({"title": title})

class RecordingSender:
    def __init__(self):
        self.messages = []
    def send(self, message):
        self.messages.append(message)

sender = RecordingSender()
send_summary("Python", sender)
assert sender.messages == [{"title": "Python"}]
print("passed")
```

这里的测试替身记录消息，没有发真实网络请求；业务函数通过参数得到依赖，因此无需修改全局对象。随后还应给sender加入失败行为，确认上层如何报告错误或重试。替身只能证明应用与这个替身契约一致，真实服务字段、鉴权和网络行为仍需单独集成验证。

夹具负责准备与清理环境，例如临时目录和独立测试数据。测试之间不应共享上一个测试留下的可变对象，更不能依靠执行顺序才成功。异步测试用Event或明确任务结果协调时序，固定sleep只是在猜机器足够快，容易在CI上偶发失败。

## 一个完整的 unittest 示例
```python
import unittest

def divide(a, b):
    if b == 0:
        raise ValueError("除数不能为零")
    return a / b

class DivideTests(unittest.TestCase):
    def test_result(self):
        self.assertEqual(divide(6, 3), 2)
    def test_zero(self):
        with self.assertRaises(ValueError):
            divide(1, 0)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(DivideTests)
result = unittest.TestResult()
suite.run(result)
print(result.testsRun, result.wasSuccessful())
```
错误路径断言异常类型，而不是仅打印报错。涉及浮点时根据契约使用容差，不能对所有结果统一强制四舍五入掩盖问题。
## 夹具与替身的责任
临时目录、独立数据库和可清理资源适合作夹具。mock用于替换网络、时钟等边界，但应模拟真实可出现的失败和返回结构。patch应作用于被测代码实际查找名字的位置，否则看似替换了函数却没有影响调用。
```flow
测试结构
安排输入与隔离环境｜不依赖测试执行顺序
执行一个明确动作｜控制时间和外部响应
断言用户可见结果｜值、异常、状态或持久化效果
清理资源｜即使断言失败也执行
```
## 异步与并发测试
不要靠固定sleep猜任务完成，使用事件、队列或任务结果等待。验证取消时资源释放、旧响应不覆盖新状态、任务失败可观察。随机测试需记录种子和失败输入，方便复现。

把空输入、边界、重复操作与部分失败列成案例，再根据真实缺陷补回归。测试数量不是质量指标，关键是不同风险是否得到独立有效的验证。
