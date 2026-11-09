---
{"id":"crawl-scrapy","moduleId":"crawler","title":"Scrapy 架构、Middleware 与 Pipeline","prerequisites":["py-iterators","crawl-boundaries"],"sources":["scrapy","scrapy-throttle","scrapy-selectors"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Scrapy 架构、Middleware 与 Pipeline

Scrapy 是组织采集流程的框架。Spider 描述如何解析响应与发现后续请求，调度器管理待抓取请求，下载器取得响应，Item Pipeline 处理提取后的数据。引擎协调这些部分，让业务代码不必自己写完整任务循环。

理解职责后，才能知道一段逻辑应该放在哪里：重试请求属于下载与调度链路，价格标准化属于数据处理，页面链接提取则属于解析。

## 请求与数据走两条相关路径

Spider 产生初始请求与后续请求，调度器排队，引擎把可执行请求交给下载器。响应返回后交给 Spider，Spider 可以产生新的请求或数据项。数据项进入 Pipeline 做清洗、校验与保存，新请求则继续进入调度路径。

Downloader Middleware 位于请求与响应的下载链路，适合处理相关头、代理或响应策略；Spider Middleware 影响 Spider 输入输出；Pipeline 面向已经提取的数据项。把所有逻辑塞进一个 parse 函数，会使重试、质量与存储相互缠绕。

框架使用异步运行机制，阻塞式网络或数据库调用若直接放在关键回调中，可能拖慢整个处理流程。持久队列、自动节流和去重等能力仍需正确配置，并不代表默认设置适合所有来源。扩展接口与异步支持随版本演进，应按安装版本阅读文档。

## 把机制放到一条完整路径中

```flow
Scrapy 数据流
Spider 请求｜提供种子与后续访问目标
调度下载｜排队限速并取得响应
Spider 解析｜提取数据项与新请求
Pipeline｜校验标准化并可靠保存
```

## 配套代码：Scrapy 架构、Middleware 与 Pipeline：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

flow=['scheduler','downloader middleware','downloader','spider','item pipeline']
show(flow)
show(flow.index('spider')<flow.index('item pipeline'))
```

列表是简化的数据流示意，真实框架有双向中间件调用、引擎协调和异常路径。这里不在浏览器运行 Scrapy；本地项目安装框架后应按当前官方文档配置，并分别测试纯解析器和框架集成。

## 从示例走向实际使用

先用固定 HTML 样本测试 Spider 解析，再单独测试 Pipeline 的字段与写入行为。最后联调下载与调度，方便区分失败属于哪层。

课内流程列表只帮助记住职责，不是实际 Scrapy 项目。真实项目应在本机 Python 环境安装相应依赖，并遵守来源范围与速率规则。
