---
{"id":"crawl-html","moduleId":"crawler","title":"HTML、CSS/XPath 选择器与相对提取","prerequisites":["py-iterators","crawl-boundaries"],"sources":["scrapy-selectors"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识HTML、CSS/XPath 选择器与相对提取

HTML 解析把响应文本转成可遍历的节点结构，再从中提取字段。CSS 选择器与 XPath 描述如何定位节点，二者都应围绕页面结构使用。用正则直接解析任意 HTML，容易被嵌套、属性顺序和实体编码破坏。

例如列表里每张卡片都有标题与链接，应先选出卡片，再在每张卡片内部相对提取。分别抓全页标题数组和链接数组后按下标拼接，遇到缺字段就可能错配。

## 相对选择与结构变化

CSS 选择器适合标签、类、属性与层级定位；XPath 能表达更丰富的节点关系与文本条件。选择器应优先依赖稳定语义或明确结构，避免大量绝对层级与第几个 div。页面插入一个广告后，绝对位置可能全部偏移。

提取文本还需处理嵌套标签、空白与实体。价格可能包含货币符号，日期可能来自属性而非可见文本，链接可能是相对地址。解析阶段保留原值与来源位置，标准化阶段再做类型转换，便于定位是选择器失败还是转换失败。

缺字段不应悄悄变成空字符串然后进入正式数据。为必填项定义错误与隔离策略，统计字段覆盖率；当页面改版导致标题全部缺失时，应暂停或告警，而不是继续写入大量空记录。解析器测试使用保存的允许样本，减少对线上站点反复请求。

## 把机制放到一条完整路径中

```flow
HTML 到记录
解析结构｜将响应建立为节点关系
定位条目｜先选每个业务对象的容器
相对提取｜在容器内读取文本属性链接
校验隔离｜缺失或异常字段进入质量处理
```

## 配套代码：HTML、CSS/XPath 选择器与相对提取：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

from html.parser import HTMLParser
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if tag=='a' and 'href' in data: self.urls.append(data['href'])
p=Links(); p.feed('<a href="/a">A</a><span>B</span><a href="/b">B</a>')
show(p.urls)
```

标准库解析器识别 a 标签属性，不需要用正则猜引号位置。这里收集的是原始相对链接，下一步应通过 urljoin 解析并限制来源；从 href 存在不能推断链接一定可访问或应该进入抓取队列。

## 从示例走向实际使用

建立正常卡片、缺链接、嵌套标题和额外广告四个 HTML 样本，检查每条记录的字段仍对应同一对象。先验证选择器命中数量，再检查字段内容。

课内 HTMLParser 示例展示结构化读取 a 标签，不包含 CSS/XPath 引擎。真实项目可按需求选择解析库，并把选择器与标准化逻辑分开测试。
