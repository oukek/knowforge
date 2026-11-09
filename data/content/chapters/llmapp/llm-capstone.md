---
{"id":"llm-capstone","moduleId":"llmapp","title":"知识助手实战：采集、API、检索、回答与验收","prerequisites":["ai-llm-primer","ai-application-anatomy"],"sources":["py-test","openapi","llm-evals"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识知识助手实战

综合项目把文档接入、检索、生成、验证和运维连成一条可验收链路。目标不是堆齐技术名词，而是回答一个明确业务问题，并说明每个失败点怎样被识别与处理。一个可运行的知识助手可以从很小的授权语料开始。

先规定谁能问什么、答案必须依据哪些资料、没有证据怎么办，以及怎样判断结果正确。这些决定数据结构、工具权限和评估方式。

## 分层交付与验收证据

第一阶段完成不依赖真实模型的应用骨架：账号与权限、文档版本、任务状态、事件流和账本。使用确定性替身让失败路径可重复，验证断线、重试与重启。替身只证明工程控制流，不能证明自然语言效果。

第二阶段建立检索基线，用标注问题检查答案在语料中是否存在、候选是否覆盖、最终上下文是否完整。保留每个阶段的输入输出，遇到低质量结果先定位最早丢失证据的位置，再选择分块、召回或重排调整。

第三阶段接真实模型，比较事实正确、引用支持、无答案处理、成本和延迟。验收报告分开列已验证与待验证能力，说明样本范围与局限。不要把模拟模型返回成功、固定代码测试通过写成“模型准确率达标”。

## 运行配套本地项目

[下载 Python 配套项目](/api/export/python-demo)（Python 3.11+，仅标准库）。下载后执行 `python3 zhixing-python-workbench.py demo`，会启动本机临时样本站点，重复采集并校验 SQLite 去重、分页与带来源检索。执行 `python3 zhixing-python-workbench.py serve --port 8765` 可保持练习站点运行，另一终端执行 `python3 zhixing-python-workbench.py crawl --base http://127.0.0.1:8765`。浏览器示例不提供真实网络，配套项目也不会调用模型或消耗额度；默认数据库独立位于 runtime/python-demo.sqlite。

## 把机制放到一条完整路径中

```flow
综合项目交付
明确验收｜用户范围资料边界与成功标准
搭建骨架｜用替身验证状态权限与计费
测量质量｜逐层评估检索和真实生成
形成证据｜记录样本限制运行指标与回退
```

## 配套代码：知识助手实战：采集、API、检索、回答与验收：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

checks={'ingest_idempotent':True,'api_contract':True,'retrieval_sources':True,'real_model_evaluated':False}
show(checks)
show(all(v for k,v in checks.items() if k!='real_model_evaluated'))
```

显式列出真实模型尚未评估，防止把离线样本成功等同于模型效果。配套项目可在本机运行采集、SQLite、HTTP API 和确定性查询；它是可扩展的工程练习起点，不会自动请求外部服务或消耗模型额度。

## 从示例走向实际使用

交付内容至少包含可运行应用、配置说明、代表性测试集、失败样本、运行追踪和回滚步骤。面试介绍按问题、约束、方案、证据和取舍展开，比单列框架名称更有说服力。

课内 real_model_evaluated 为 false 是刻意保留的验收缺口。完成真实评估前保持它为 false，体现证据边界而非追求全绿。
