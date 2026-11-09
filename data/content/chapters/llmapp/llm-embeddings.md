---
{"id":"llm-embeddings","moduleId":"llmapp","title":"Embedding、相似度与向量空间契约","prerequisites":["ai-llm-primer","ai-application-anatomy"],"sources":["rag-paper","llm-evals"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Embedding、相似度与向量空间契约

向量检索依赖一份空间契约：文档与查询怎样编码、使用哪个模型版本、向量维度与距离如何定义。只有这些条件相容，近邻结果才有可解释意义。把不同来源的同维度向量放进一个索引，并不会自动得到统一语义。

应用层还需要知道向量对应哪份原文、权限与版本，才能把检索结果转成可信证据。

## 相似度计算与输入契约

余弦相似度比较方向，点积同时受长度影响，欧氏距离比较空间距离。模型训练与索引通常对度量有约定，归一化也会改变它们的关系。函数应检查维度一致与有限数值，零向量的处理要明确，不能让 zip 静默截断不同长度输入。

某些 embedding 模型对查询与文档使用不同前缀或编码方式，输入模板必须按模型要求保持。文本清洗不能无条件删除标点、编号或代码符号，这些可能是任务关键内容。长文截断若丢掉答案段落，向量质量再好也无法检索那部分信息。

模型版本变化可能改变整个空间，通常需要重嵌入文档并建立新索引。灰度比较时查询也使用对应版本，不能新查询向量去查旧文档空间。元数据中的 modelVersion 与 documentVersion 让错误可追踪。

## 把机制放到一条完整路径中

```flow
向量空间契约
固定编码｜模型版本模板与清洗规则
验证向量｜维度数值归一化与空输入
一致检索｜使用匹配的度量和索引
关联原文｜保留文档权限与版本证据
```

## 配套代码：Embedding、相似度与向量空间契约：最小可验证示例

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

import math
def cosine(a,b):
    if len(a) != len(b):
        raise ValueError('dimension')
    if any(not math.isfinite(x) for x in [*a, *b]):
        raise ValueError('non-finite value')
    norm=math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
    return sum(x*y for x,y in zip(a,b))/norm if norm else 0.0
show(round(cosine([1,0],[1,1]),3))
show(cosine([0,0],[1,0]))
```

向量由人工固定样本提供，余弦计算是真实算法，但没有调用 embedding 模型。函数先校验维度与有限数值，避免 zip 静默截断或无效值传播；零向量返回零是本课契约，不是所有向量数据库的统一行为。此实现面向普通大小的数值，极端浮点数还需数值稳定化处理。

## 从示例走向实际使用

建立一组相似、反义、数字不同和精确编号的样本，观察检索排序与误匹配。用维度错误和零向量验证计算函数的边界，而不只测试两个正常向量。

课内 cosine 对不同维度及非有限数值明确报错，可以用 [1,2] 与 [1] 或包含 float('nan') 的向量试验；返回零只是对零向量的演示约定，不代表零向量具有正常语义。极端大数可进一步采用稳定范数与归一化计算。
