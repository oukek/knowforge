---
{"id":"crawl-url","moduleId":"crawler","title":"URL 解析、规范化与抓取范围","prerequisites":["py-iterators","crawl-boundaries"],"sources":["py-url"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识URL 解析、规范化与抓取范围

URL 包含协议、主机、端口、路径、查询和片段等部分。页面中的相对链接需要结合当前基准地址解析，不能简单用字符串拼接。../item/1 会改变目录层级，完整外部地址则可能直接切换主机。

规范化帮助把等价地址识别为同一抓取目标，但过度规范化也可能把不同资源误合并，例如随意删除查询参数或改变路径大小写。

## 解析、去重与访问范围

使用标准 URL 解析器拆分组成部分，再按明确规则处理。片段通常不发送给 HTTP 服务器，因此普通文档抓取可在去重时去掉 fragment；但单页应用可能用片段表达客户端状态，是否可忽略仍取决于采集目标。查询参数排序或删除也要确认服务语义。

抓取范围应基于解析后的 hostname、协议与端口判断，而不是字符串包含 example.com。example.com.evil.test 并不是目标主机，用户名部分也可能误导简单判断。跟随重定向后再次校验，避免初始地址合法但最终跳到范围外。

若系统允许用户提交采集地址，服务端还需考虑 SSRF：限制访问内部与保留地址、控制 DNS 与重定向行为，并限制响应大小和协议。浏览器里可见的链接不自动代表服务器有权访问的网络资源。URL 规范化、授权与网络出口限制是不同层次。

## 把机制放到一条完整路径中

```flow
安全 URL 处理
基准解析｜把相对引用转换成完整地址
规范去重｜只应用已确认等价的转换
范围检查｜验证协议主机端口与路径
请求复核｜重定向和解析后继续执行限制
```

## 配套代码：URL 解析、规范化与抓取范围：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

from urllib.parse import urljoin,urlsplit,urldefrag
base='https://example.test/list/'
url=urljoin(base,'../item/1#reviews')
show(urldefrag(url)[0])
show(urlsplit(urljoin(base,'https://other.test/x')).hostname)
```

相对链接在给定基址下解析，片段从请求 URL 中移除；绝对链接可以覆盖主机。示例没有发起网络访问，真实服务还应校验地址解析、重定向和目标范围，不能只根据输入字符串包含 example.test 来判断安全。

## 从示例走向实际使用

准备相对路径、绝对外链、片段、默认端口、重复查询和带用户名的地址做测试。记录原始链接与规范键，便于解释为什么去重或拒绝。

课内 urljoin 与 urlsplit 展示标准解析。真实调度器应在入队和实际请求时都遵守范围策略，不能只在最初种子链接检查一次。
