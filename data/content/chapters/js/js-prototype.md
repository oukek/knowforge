---
{"id":"js-prototype","moduleId":"js","title":"原型链、new 与 instanceof","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识原型链、new 与 instanceof

对象读取属性时，先找自己的属性，找不到再沿内部原型链接继续查找，这条链称为原型链。原型是一个对象关系，不是把父对象字段复制进每个实例。把公共方法放到原型上，可以让许多实例共享函数，而各自保存不同的数据字段。

构造函数的prototype属性与实例的内部原型是相关但不同的概念：正常new某函数时，新对象的内部原型通常来自该函数的prototype。函数本身也是对象，也有自己的内部原型，不能把所有出现的prototype和__proto__都混成同一个属性。

## 属性查找、写入与构造的具体规则

若实例自己有name，读取时不会再去原型找name，这叫遮蔽。删除自有属性后，原型上的同名值又可能可见。in会沿原型查找，Object.hasOwn检查自有属性，因此解析外部字典时两者有不同用途。读取还可能遇到getter，结果并不总是某个静态存储值。

赋值也不等于“沿链找到哪里就修改哪里”。普通可写数据属性常使实例形成自有属性；继承的setter可能被调用，不可写属性在相应模式下可能阻止写入。对象是否可扩展、属性描述符以及代理拦截都影响最终结果，学习模型应说明假设。

instanceof默认检查目标构造器的prototype是否出现在对象原型链上，反映原型身份关系，不是对象字段结构是否相似。跨realm的数组可能不满足当前realm的Array instanceof判断，Array.isArray更适合数组品牌判断。Symbol.hasInstance还能定制行为，所以手写链查找只是默认机制的一部分。

## 把机制放到一条完整路径中

```flow
读取obj.key
检查自有属性｜包括数据属性与访问器
没有则查看内部原型｜沿链继续属性查找
链结束仍未找到｜普通读取返回undefined
存在getter时调用｜接收者与描述符决定可观察行为
```

## 配套代码：属性查找与原型身份

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

自己的属性会遮蔽原型属性；删除自身属性后继续向原型查找。

```javascript
function Item(name) { this.name = name; }
Item.prototype.kind = '原型值';
const item = new Item('A');
item.kind = '自身值';
console.log(item.kind);
delete item.kind;
console.log(item.kind);
console.log(Object.getPrototypeOf(item) === Item.prototype);
console.log(item instanceof Item);
```

属性查找先自身后原型，删除自身属性不会删原型属性。new 默认把实例的内部原型连接到构造器 prototype，instanceof 根据这一关系判断。

## 从示例走向实际使用

日常用Object.getPrototypeOf观察原型，使用class或清楚的工厂组织行为；不要通过修改内建原型给全站隐式增加方法。处理不可信键时防止危险的动态赋值路径，使用明确字段白名单或适当的Map，避免原型污染影响其它对象。

验证一个类型时分别测试自有字段、继承字段、方法共享和原型身份。业务授权必须看可信数据与规则，不能因为对象看起来像某个类或instanceof成立就自动授予权限。
