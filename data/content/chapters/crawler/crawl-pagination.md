---
{"id":"crawl-pagination","moduleId":"crawler","title":"分页、游标、终止条件与去重","prerequisites":["py-iterators","crawl-boundaries"],"sources":["py-url","scrapy"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识分页、游标、终止条件与去重

分页把一个较大结果集分成多次返回。页码分页通过 page 或 offset 定位，游标分页通过服务端给出的继续位置推进。采集程序除了请求下一页，还必须知道何时停止，以及数据变化时如何避免重复或遗漏。

例如第一页为 a、b，第二页为 b、c，重复 b 可能来自列表在两次请求之间变化。去重可以消除重复，但不能自动证明没有漏掉其他记录。

## 推进状态与稳定排序

终止条件应来自接口契约，例如 nextCursor 为空、hasMore 为 false 或明确到达末页。不能仅因为某页记录数小于预设值就假设结束，除非接口保证这一点。若同一个游标反复出现，应检测循环并停止，避免无限抓取。

稳定分页通常需要确定排序及唯一的并列键。只按更新时间分页，多个记录时间相同时可能跨页重复或遗漏；复合游标可包含时间与 ID。offset 分页在前方插入删除时会移动位置，适合的场景与游标不同。

采集结果用来源业务 ID 去重，分页进度则保存已确认的游标与运行标识。检查点应在当前页数据可靠保存后推进，否则崩溃可能跳过未保存记录。恢复时允许重读一页并幂等写入，通常比冒险提前推进更可靠。

## 把机制放到一条完整路径中

```flow
分页采集
读取一页｜携带当前页码或游标
验证响应｜检查排序标识与继续条件
可靠保存｜按业务ID幂等写入本页
推进检查点｜防循环并保存下一位置
```

## 配套代码：分页、游标、终止条件与去重：最小可验证示例

下面代码在课内Python运行区执行；浏览器环境与本机CPython的网络、文件和原生扩展能力不同。

使用 Python 标准库和固定样本验证关键机制。show() 把结果序列化成 JSON；可修改输入再运行。

```python
import json

def show(value):
    """按 JSON 打印结果，便于逐行预测和验证。"""
    print(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

pages={'start':(['a','b'],'next'),'next':(['b','c'],None)}
cursor='start'; visited=set(); items=[]
while cursor is not None:
    if cursor in visited: raise ValueError('cursor loop')
    visited.add(cursor)
    batch,cursor=pages[cursor]; items.extend(batch)
show(list(dict.fromkeys(items)))
```

固定样本模拟两页数据，集合防止游标循环，字典保持首次记录顺序。它没有解决真实接口的快照一致性、游标过期或持久化；生产实现必须在事务提交后保存检查点，并针对实际排序契约设计恢复。

## 从示例走向实际使用

构造重复游标、空中间页、数据新增与同时间记录等测试。分别验证是否终止、是否重复、是否能恢复，不能只测连续页码的理想情况。

课内 visited 检测游标循环，dict 去重保留首次顺序。真实项目需要根据更新语义决定重复记录取新版本还是旧版本。
