---
{"id":"py-exceptions","title":"Python 异常：传播、捕获、finally 与错误分类","moduleId":"python","prerequisites":["py-functions"],"sources":["py-types","py-functions"]}
---
## 异常是一条独立的失败通道
函数无法完成约定工作时可以raise异常，控制流向外寻找匹配的except。异常对象携带类型、消息与回溯，类型用于区分失败类别。返回None并不能自动表达所有失败，因为None也可能是合法结果；接口需要明确什么时候返回、什么时候抛错。

捕获异常不是把错误消失掉，而是在当前层能够采取有意义措施时处理它。不能处理时可以补充上下文后继续抛出。最外层负责用户响应或任务状态，底层负责准确报告原因。
## 异常怎样离开当前调用位置

raise 创建或抛出异常后，当前函数正常路径立即停止，解释器沿调用栈寻找匹配的 except。若某层没有处理器，就继续向外传播；沿途的 finally 仍要执行。如果直到最外层也未处理，程序或当前任务以失败结束，并提供 traceback 帮助定位经过的调用链。

try 应尽量只包住预期可能失败的操作。except 捕获具体异常类；else 在 try 正常结束时执行，适合放依赖成功的后续操作；finally 负责无论成功失败都要做的收尾。把过多代码塞进一个宽泛 except Exception 会让不同来源的编程错误都被误当成某一种业务失败。

```python
def parse_count(text):
    try:
        value = int(text)
    except ValueError as error:
        raise ValueError("数量必须是整数") from error
    if value < 0:
        raise ValueError("数量不能为负数")
    return value

for text in ["3", "bad", "-1"]:
    try:
        result = parse_count(text)
    except ValueError as error:
        print(str(error))
    else:
        print("有效数量", result)
```

## 异常翻译应该保留诊断线索

底层可能抛连接错误，上层需要向用户表达“保存失败”。可以在明确边界转换异常类型，同时用 `raise ... from error` 保存原因；不要把 traceback 丢掉，只留下无法定位的一句字符串。裸 raise 在 except 中重新抛出当前异常，适合记录必要上下文后继续传播。

Exception 覆盖多数普通应用异常，但取消、中断等还涉及 BaseException 的其它分支。捕获 BaseException 通常只用于必须清理后再抛出的边界，不应把退出信号吞成正常返回。finally 中 return 也可能覆盖原返回值或异常，应避免用这种方式控制业务结果。

异常类型描述发生了什么，不自动告诉你能否重试。输入错误需要修正输入，暂时网络失败可能可重试，而超时后的写入结果可能不确定。重试决策还需要幂等性、剩余预算和副作用状态，不能看到任何异常就重复执行。

## 捕获具体错误并保留原因
```python
def parse_quantity(text):
    try:
        value = int(text)
    except ValueError as cause:
        raise ValueError("数量必须是整数") from cause
    if value < 0:
        raise ValueError("数量不能为负")
    return value

try:
    print(parse_quantity("abc"))
except ValueError as error:
    print(error)
finally:
    print("finished")
```
from保留原始原因链，便于诊断。不要把整个业务函数都包进一个except Exception然后返回空列表，否则数据库故障可能被伪装成“没有订单”。日志同样要避免输出密钥、令牌与完整用户敏感输入。
## else 与 finally 的责任
try的else在主体正常完成时运行，可缩小需要捕获异常的范围；finally用于无论成功失败都要做的收尾。finally里return或再次抛错会影响原结果与原异常，因此清理代码应谨慎，不能轻易覆盖真正失败原因。
```flow
异常传播
操作失败｜创建并抛出具体异常
当前层匹配 except｜能处理才恢复或转换
finally 清理｜释放资源，不掩盖原始问题
向外传播｜上层决定重试、提示或终止
```
## 异步与批处理边界
异步任务异常需要被等待或明确收集，不能启动后遗忘。取消不是普通业务错误，清理后通常应继续传播。批处理可以按项记录错误并继续，但要把成功与失败分别返回，不能悄悄丢行。

测试无效格式、范围错误、资源获取失败和清理失败。重试只用于明确的暂时故障，校验错误通常不应重试；副作用失败可能处于结果不确定状态，要结合幂等与查询解决。
