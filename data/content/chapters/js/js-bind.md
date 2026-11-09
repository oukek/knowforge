---
{"id":"js-bind","moduleId":"js","title":"手写 bind：预置参数与构造调用","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识手写 bind

bind返回一个新函数，记住目标函数、指定接收者和预置参数，稍后调用时再执行目标。因此它常用于事件回调和偏函数应用：先固定一部分信息，把剩余参数留到真正交互发生时提供。绑定本身不发请求，也不执行目标函数体。

绑定函数仍是一个独立对象。每次调用bind得到不同引用，注册监听器后若重新bind再移除，通常移除不到原监听器；需要保存最初的绑定函数并在生命周期结束时使用同一引用。

## 普通调用与构造调用要分别实现

普通调用绑定函数时，目标使用已保存的接收者，参数顺序是预置参数在前、本次参数在后。对已绑定函数再次bind，不能用新的接收者简单覆盖第一次保存的绑定关系，但新的预置参数仍会继续参与调用。

若目标本身可构造，绑定后的函数也有相应构造行为。new调用时会建立新实例，不能继续把this固定为原绑定对象；预置参数仍有效。简单实现里用this instanceof wrapped判断构造容易受到原型变化与自定义Symbol.hasInstance影响，真正理解应区分内部调用与构造操作，现代教学可用new.target及Reflect.construct表达意图。

箭头函数和某些内建函数不能构造，包装器不应把它们伪装成合法构造器。name、length、prototype等可观察属性也有规范细节，普通闭包包装不自动等价于原生绑定函数。面试中先说明实现覆盖普通调用还是同时覆盖构造，比提交一个对所有情况作错承诺的短函数更专业。

## 把机制放到一条完整路径中

```flow
绑定函数生命周期
调用bind｜保存目标、接收者和预置参数
稍后收到调用｜组合本次参数
区分普通与构造调用｜构造时使用新实例语义
执行目标并返回｜保留结果与异常契约
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

预置参数用于普通调用与构造调用；构造调用忽略绑定接收者。

```javascript
function bindLike(target,context,...preset) {
  if(typeof target!=='function')throw new TypeError('target');
  function bound(...args){if(new.target)return Reflect.construct(target,[...preset,...args],new.target===bound?target:new.target);return Reflect.apply(target,context,[...preset,...args])}
  return bound;
}


function Person(name) { this.name = name; }
const context = {name: '旧值'};
const Bound = bindLike(Person, context, 'Ada');
Bound();
console.log(context.name);
context.name = '重置';
const instance = new Bound();
console.log(instance.name, instance instanceof Person);
console.log(context.name);
```

普通调用使用绑定 this；new 创建独立实例并沿目标原型构造，预置参数仍有效。教学版没有模拟原生 bound 的所有属性语义。

## 从示例走向实际使用

测试固定参数、动态参数、目标返回值、目标抛错和new时显式返回对象。还应验证绑定函数引用是否被正确释放，避免长期事件源持有已离开的组件对象。

业务中常用箭头闭包调用某对象方法来保持接收者，或直接bind并保存引用；选择取决于参数和构造需求，不以代码更短为唯一依据。
