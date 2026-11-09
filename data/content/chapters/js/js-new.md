---
{"id":"js-new","moduleId":"js","title":"手写 new：原型与返回值覆盖","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识手写 new

new让一个可构造函数参与建立新实例。理解它可以把构造函数、原型和返回值连接起来：先准备实例对象，将其原型关联到目标的prototype，再以构造语义执行目标初始化，最后按返回规则决定结果。它不是简单调用一个函数后把返回值称为对象。

class也是构造与原型机制的一种语法，但不能被普通函数调用替代；箭头函数没有构造能力。手写new的第一步应声明目标范围，普通函数教学模型不能冒充支持所有构造器。

## 初始化对象与显式返回对象的区别

构造函数给this.name赋值是在初始化准备好的实例。若函数显式返回另一个对象或函数，new的结果可能被该返回值覆盖；返回普通数值或undefined则通常仍得到新实例。null虽然typeof为object，却不属于应覆盖结果的非空对象，手写判断不能只写typeof result === 'object'。

目标prototype若不是合适对象，默认原型规则也要考虑。原型属性可被后来替换，已创建实例不会自动搬到新的原型上。继承、new.target、派生类以及内建对象的内部槽，使完整构造语义比Object.create加apply更复杂；Reflect.construct更适合表达标准构造操作。

构造器中修改外部全局对象、发请求或注册监听，会让创建失败后的收尾困难。对象初始化应尽量建立局部不变量，昂贵资源可用显式启动和关闭方法管理。构造成功也不代表异步初始化已经完成，需要另行定义就绪状态。

## 把机制放到一条完整路径中

```flow
构造一次实例
确认目标可构造｜普通调用能力不等于构造能力
准备实例与原型｜根据构造目标建立关联
执行初始化｜this指向待建立的实例
解释显式返回值｜对象返回可能覆盖默认实例
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

观察普通构造器返回 null 和对象时的区别。

```javascript
function newLike(Ctor,...args) {
  if(typeof Ctor!=='function')throw new TypeError('Ctor');
  const proto=Ctor.prototype;
  const valid=proto!==null&&(typeof proto==='object'||typeof proto==='function');
  const instance=Object.create(valid?proto:Object.prototype);
  const returned=Reflect.apply(Ctor,instance,args);
  return returned!==null&&(typeof returned==='object'||typeof returned==='function')?returned:instance;
}


function First() { this.value = 1; return null; }
function Second() { this.value = 1; return {value: 9}; }
console.log(newLike(First).value);
console.log(newLike(Second).value);
console.log(newLike(First) instanceof First);
```

null 和其他原始值不替代新实例；显式返回对象会覆盖默认实例。此实现只支持题目限定的普通构造函数，不适用于任意 class 或内置构造器。

## 从示例走向实际使用

验证普通初始化、返回原始值、返回对象、返回函数和返回null，检查实例原型是否符合预期。再用class和不可构造目标验证模型边界，不能为了让测试通过就忽略这些差别。

设计业务对象时，工厂函数与class都可以合适，选择依据是身份、状态和行为需求，而不是认为使用new天然更面向对象或更高性能。
