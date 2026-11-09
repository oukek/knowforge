---
{"id":"crawl-project","moduleId":"crawler","title":"从采集到 API 与 RAG 的完整项目链路","prerequisites":["py-iterators","crawl-boundaries"],"sources":["scrapy","py-test","llm-evals"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识从采集到 API 与 RAG 的完整项目链路

一个采集到 API 再到 RAG 的项目，需要把来源内容转成可追踪、可更新的数据产品。抓到文本只是第一步；API 需要稳定字段与权限，RAG 需要可检索片段与来源证据，两者都依赖可靠的数据版本。

例如公开课程文档进入知识库后，每个片段应知道来自哪篇文档、哪个版本和哪个位置。否则回答引用出错时，无法判断是采集、切分、索引还是生成的问题。

## 主记录与派生索引如何保持一致

采集层保存来源标识、更新时间与解析版本，标准化层生成稳定文档记录，API 面向业务返回受控字段。RAG 索引是从文档派生的检索结构，不应成为唯一真相来源。重建索引时应能从规范文档重新生成，而不是只能从旧向量库猜回原文。

切分记录包含 documentId、版本、片段范围和内容摘要，embedding 模型与维度也要记录。文档更新后需要生成新片段并删除或失效旧片段，不能只不断追加，否则检索会同时召回互相矛盾的版本。切换索引版本应有验证与回退。

权限与删除沿整条链传播。来源允许公开访问不等于下游可以无限复制；私人数据进入检索前必须保留授权作用域。API 缓存、搜索索引与向量索引都需要响应删除，防止主表已删但 AI 仍引用旧内容。

## 运行配套本地项目

[下载 Python 配套项目](/api/export/python-demo)（Python 3.11+，仅标准库）。下载后执行 `python3 zhixing-python-workbench.py demo`，会启动本机临时样本站点，重复采集并校验 SQLite 去重、分页与带来源检索。执行 `python3 zhixing-python-workbench.py serve --port 8765` 可保持练习站点运行，另一终端执行 `python3 zhixing-python-workbench.py crawl --base http://127.0.0.1:8765`。浏览器示例不提供真实网络，配套项目也不会调用模型或消耗额度；默认数据库独立位于 runtime/python-demo.sqlite。

## 把机制放到一条完整路径中

```flow
采集到知识应用
来源采集｜记录授权范围与文档身份
标准化存储｜校验字段并保存版本
API与索引｜按契约发布并生成检索片段
追踪更新｜引用回源并传播变更删除
```

## 配套代码：从采集到 API 与 RAG 的完整项目链路：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

record={'id':'a1','source_url':'https://example.test/a1','parser_version':'2','text':'Python course'}
chunk={'id':record['id']+':0','document_id':record['id'],'source_url':record['source_url']}
show(chunk)
show(chunk['document_id']==record['id'])
```

示例验证文档到块的来源关系，没有训练或调用大模型。随附本地项目提供真实标准库采集、SQLite、HTTP API 和确定性检索端点，用于先练通工程链路，再接入需要密钥与费用管理的真实模型适配器。

## 从示例走向实际使用

从少量明确允许的文档完成端到端闭环：采集、质量检查、API 查询、检索与带来源回答。为每层保存版本，构造一次更新和删除，检查下游结果同步变化。

验收既看请求成功，也看证据可追溯、权限正确和旧数据不残留。不要用“能生成一段回答”代替整个数据链路正确。
