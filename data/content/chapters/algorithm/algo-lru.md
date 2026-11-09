---
{"id":"algo-lru","moduleId":"algorithm","title":"LRU 缓存与有界数据结构","prerequisites":["algo-solving-basics"],"sources":["mdn-js"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识LRU 缓存与有界数据结构

LRU 表示最近最少使用淘汰策略。缓存容量不足时，删除距离上次访问最久的条目；读取也算使用，因此一次 get 会改变淘汰顺序。它假设最近访问过的内容更可能很快再次被访问，但这不是对所有业务都最优的规律。

容量为 2，依次写 A、B，再读取 A，此时 B 更久未使用；写 C 时应淘汰 B，而不是最早写入的 A。只按插入时间删除实现的是另一种策略。

## 快速定位与使用顺序需要两种能力

经典实现用哈希表按键定位节点，再用双向链表维护最近使用顺序。get 命中后把节点移动到最新端，put 更新已有键也移动；新增超过容量时，从最旧端删除并同步移除哈希表记录。双向链表使已知节点的删除与移动不需扫描前驱。

JavaScript Map 保留插入顺序，可以用删除后重新 set 模拟移动到最新端。示例利用这一性质表达 LRU 行为，但严格复杂度讨论应区分语言规范保证与具体引擎实现。返回 undefined 也可能与缓存中实际保存 undefined 混淆，生产接口可使用 has 或明确的命中结果。

条目容量不等于内存容量，TTL 过期也不等于 LRU 淘汰。真实缓存可能同时限制字节数与有效时间，并处理并发相同键加载，避免缓存未命中时所有请求一起击穿到后端。缓存内容属于不同用户时，键中还需包含权限作用域。

## 把机制放到一条完整路径中

```flow
LRU 操作
键查找｜判断是否命中已有条目
刷新顺序｜命中或写入移到最新端
容量检查｜超限时选择最旧条目
同步删除｜顺序结构与键索引一起更新
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

访问更新最近使用顺序，满容量淘汰最旧项。

```javascript
function createLRU(capacity) {
  if(!Number.isInteger(capacity)||capacity<0)throw new RangeError('capacity');
  const map=new Map();
  return {
    get(key){if(!map.has(key))return undefined;const value=map.get(key);map.delete(key);map.set(key,value);return value},
    put(key,value){if(!capacity)return;map.delete(key);map.set(key,value);if(map.size>capacity)map.delete(map.keys().next().value)},
    keys(){return [...map.keys()]}
  };
}


const cache=createLRU(2);
cache.put('A',1);cache.put('B',2);
console.log(cache.get('A'));
cache.put('C',3);
console.log(cache.keys());
console.log(cache.get('B'));
```

读取 A 后它变最新，插入 C 淘汰 B。keys 按最旧到最新；get 需用 has 区分未命中和存在但值为 undefined。

## 从示例走向实际使用

先写操作序列和每一步顺序，再实现数据结构。测试容量为零、重复写同一键、读取不存在键和读取后淘汰方向。

课内 keys 从旧到新展示顺序，便于检查 get 是否真的刷新了使用时间。把这一不变量迁移到双向链表实现，比背一段指针代码更可靠。
