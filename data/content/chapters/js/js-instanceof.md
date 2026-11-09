---
{"id":"js-instanceof","moduleId":"js","title":"手写 instanceof：原型身份与自定义行为","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识手写 instanceof

instanceof用于判断某种原型身份关系，不是判断两个对象字段是否相同。默认机制沿左侧对象的原型链查找右侧构造器的prototype；找到同一对象才满足关系。具有相同name和age字段的两个普通对象，不会因此成为某个类的实例。

这个判断描述当前关系，原型可变意味着结果也可能受后续修改影响。它适合特定代码环境下的对象身份检查，不是可靠的外部数据验证或安全授权机制。

## 原型遍历与Symbol.hasInstance

教学实现可以先排除不是对象的左值，取得目标prototype，再不断Object.getPrototypeOf向上查找直到null。这里比较的是对象身份，不能比较序列化结果。若右侧不符合相应要求，应按契约报错，而不是无条件返回false掩盖调用错误。

标准instanceof还会检查右侧的Symbol.hasInstance，自定义类型可以据此改变判断逻辑。绑定函数、跨realm对象及特殊目标也有规则，所以简单原型链循环只解释默认核心路径。浏览器不同iframe有各自内建构造器，一个数组可能不满足当前窗口Array的instanceof，但Array.isArray仍能识别它的数组品牌。

不要把obj.constructor当可靠类型真相，它可能被遮蔽、重写或缺失。网络JSON也没有因为字段叫type就自动成为可信实例，必须验证结构与业务约束。对象来自代理或不可信环境时，读取和原型操作还可能触发可观察行为，应避免把任意对象反射当无副作用步骤。

## 把机制放到一条完整路径中

```flow
默认instanceof模型
取得右侧约定｜可能先有自定义hasInstance
检查左侧对象与目标原型｜字段相似不是身份相同
逐层遍历内部原型｜与目标prototype按身份比较
找到或到达null｜输出符合限定范围的判断
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

沿原型链比较引用，不通过 constructor 名称猜类型。

```javascript
function instanceOfSimple(value,Ctor) {
  if(typeof Ctor!=='function'||Ctor.prototype===null||!['object','function'].includes(typeof Ctor.prototype))throw new TypeError('Ctor');
  if(value===null||!['object','function'].includes(typeof value))return false;
  let proto=Object.getPrototypeOf(value);
  while(proto){if(proto===Ctor.prototype)return true;proto=Object.getPrototypeOf(proto)}
  return false;
}


function Parent() {}
function Child() {}
Child.prototype = Object.create(Parent.prototype);
const value = new Child();
console.log(instanceOfSimple(value, Parent));
console.log(instanceOfSimple(1, Number));
console.log(instanceOfSimple(Object.create(null), Object));
```

子实例沿链找到 Parent.prototype，所以为 true；原始数值没有本题要求的对象链，null 原型对象也不会经过 Object.prototype。

## 从示例走向实际使用

测试直接实例、多级继承、无原型对象、普通原始值、跨realm数组及自定义hasInstance。明确你的检查是要数组品牌、可调用能力、字段结构，还是某个构造器身份，选择对应工具。

接口输入更适合schema验证，权限更适合可信身份与资源归属检查。instanceof成立只能提供其约定的类型关系证据，不能证明数据已经校验、对象可信或当前用户有操作权。
