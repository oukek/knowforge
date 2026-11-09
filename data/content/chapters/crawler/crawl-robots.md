---
{"id":"crawl-robots","moduleId":"crawler","title":"robots.txt、缓存与访问策略","prerequisites":["py-iterators","crawl-boundaries"],"sources":["robots-rfc","py-robots"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识robots.txt、缓存与访问策略

robots.txt 是站点向自动客户端表达路径访问规则的文件。爬虫根据自己的 User-Agent 选择适用规则，再判断目标路径是否允许访问。它是协作协议，不是服务器强制执行的身份认证，也不是允许复制和再发布内容的完整授权。

因此 robots 允许、账号有权限和数据用途被允许，需要分别判断。服务端真正需要保护的私密内容，应使用认证与访问控制，而不能只把路径写进 robots.txt。

## 规则匹配、获取失败与缓存

规则通常围绕 User-agent、Allow 和 Disallow 组织，匹配存在优先级与路径细节。不要自己用简单 startsWith 拼出一个声称完整兼容的解析器；标准定义了匹配与错误处理，具体库也可能有支持差异，应使用测试样例验证。

robots 文件获取失败时，不能把所有情况都当“没有限制”。HTTP 不可用状态、服务器错误与网络不可达在协议中有不同处理含义，任务应记录原因并采用明确策略。重定向与缓存也需要按标准处理，避免每个页面请求都重新下载 robots，或永久使用已经过期的规则。

Crawl-delay 等扩展并非所有客户端或标准实现都支持，不能把它当成唯一限速依据。爬虫仍需自己的按域速率、并发与退避策略，并响应站点的限制信号。规则变化后要能更新调度中的访问决策，而不只在程序启动时读取一次。

## 把机制放到一条完整路径中

```flow
robots 访问决策
获取规则｜按主机读取并处理状态
选择分组｜匹配客户端 User-Agent
判断路径｜应用规则优先级与允许范围
缓存刷新｜结合有效期变化与访问策略
```

## 配套代码：robots.txt、缓存与访问策略：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

from urllib.robotparser import RobotFileParser
r=RobotFileParser()
r.parse(['User-agent: *','Disallow: /private/'])
show(r.can_fetch('StudyBot','https://example.test/articles/1'))
show(r.can_fetch('StudyBot','https://example.test/private/1'))
```

样本在内存中解析两条规则，没有请求真实站点。结果只反映路径规则匹配，不表示其他访问条件、身份权限和数据使用许可已满足；生产任务还需要缓存、错误处理和每次发放前的范围校验。

## 从示例走向实际使用

先用固定文本测试允许、禁止、不同 User-Agent 和更具体路径，再验证所选库与需求是否匹配。对授权测试站点检查缓存刷新与获取失败路径。

课内 urllib.robotparser 展示最基本使用，不宣称覆盖所有 RFC 细节。正式项目应核对库版本行为，并把 robots 判断与业务授权分别记录。
