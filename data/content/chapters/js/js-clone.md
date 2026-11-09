---
{"id":"js-clone","moduleId":"js","title":"深浅拷贝、循环引用与 structuredClone","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识深浅拷贝、循环引用与 structuredClone

赋值对象变量通常只是复制引用，两个名字仍指向同一个对象。浅拷贝建立新的外层容器，但里面的对象引用仍可能共享；深拷贝希望复制更深的对象图。先明确哪些身份关系应保留，比直接写一个递归函数重要。

一份对象图可能包含循环引用、同一个对象被多个字段引用、访问器、原型和外部资源。所谓“深拷贝所有东西”没有统一正确含义：复制DOM节点、函数闭包或数据库连接与复制普通数据不是同一任务。

## 从树递归到对象图复制

简单JSON往返适合符合JSON数据模型的值，但会丢失或改变某些类型，遇循环也会失败；它不能保存任意JavaScript对象语义。展开语法和Object.assign同样是浅层操作，还会涉及属性读取，不是复制完整描述符与原型。

递归复制普通对象时，用WeakMap记录源节点到副本的映射，并在递归子节点前登记副本。这样再次遇到同一源对象时可复用副本，既终止循环，也保持别名关系。若a.left和a.right本来引用同一对象，复制后两者是否仍应共享，要成为契约的一部分，而不是算法偶然结果。

structuredClone支持一组平台规定的可结构化克隆类型，并能处理循环，但不是所有对象都能克隆。transfer会转移可转移资源的所有权，使原端相关资源失去使用能力，含义不同于复制。具体类型支持按目标运行环境确认，不能因名字含structured就当完整对象序列化。

## 把机制放到一条完整路径中

```flow
复制对象图
确定支持类型与身份规则｜数据对象和外部资源分开
查源节点映射｜已复制则复用对应副本
建立并登记新副本｜先登记再递归以处理循环
复制允许的成员｜保持约定的别名和类型语义
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

克隆带共享子对象和自循环的普通对象图。

```javascript
function cloneGraph(value) {
  const seen = new WeakMap();
  function copy(x) {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return seen.get(x);
    const out = Array.isArray(x) ? new Array(x.length) : {};
    seen.set(x,out);
    for (const key of Object.keys(x)) {
      Object.defineProperty(out,key,{value:copy(x[key]),enumerable:true,writable:true,configurable:true});
    }
    return out;
  }
  return copy(value);
}


const child = {value: 1};
const source = {left: child, right: child};
source.self = source;
const copy = cloneGraph(source);
console.log(copy !== source);
console.log(copy.left === copy.right);
console.log(copy.left !== child);
console.log(copy.self === copy);
```

WeakMap 同时解决循环和别名：同一源节点只复制一次，副本内部共享关系保留，但不再引用源图里的可变子对象。

## 从示例走向实际使用

业务状态更新通常沿修改路径复制即可，不必每次深拷贝整棵大树。接口数据使用明确序列化契约，缓存和跨Worker传输则根据支持类型选择复制或转移。

测试普通值、数组、嵌套共享对象、循环和不可支持类型，并说明是否保留Symbol键、描述符、原型和访问器。没有实现的语义应写在边界里；教学递归函数不应命名为无条件替代所有生产克隆需求。
