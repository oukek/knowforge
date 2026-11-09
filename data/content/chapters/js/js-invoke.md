---
{"id":"js-invoke","moduleId":"js","title":"手写 call / apply：调用与对象约束","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识手写 call / apply

call和apply调用同一个函数，并为这一次调用提供this与参数。它们不是复制函数，也不会永久改变函数以后怎样调用。call逐项接收参数，apply接收参数集合；Reflect.apply则明确接收目标、接收者和参数列表，更适合作为通用调用工具。

手写题常通过临时把函数挂到对象上再调用来解释方法接收者，但这个技巧只模拟有限场景。理解标准行为与模型差距，比给Object.prototype随意增加一个myCall更重要。

## 临时属性模型缺少哪些真实语义

临时属性名应避免覆盖现有字段，调用后无论成功还是抛错都需要清理，所以要用唯一Symbol与try/finally。然而不可扩展对象、代理、访问器和原始值仍会使这个实现产生标准call不必产生的副作用；目标对象不应该仅为一次调用就被强制修改。

严格函数接收null、undefined或基本值时，不应一律替换成globalThis或装箱。是否执行替换取决于目标函数的this规则，而不是外层myCall想当然处理。箭头函数使用词法this，传入接收者也不能改变它；不可调用目标应报错，不应静默返回undefined。

apply参数集合与展开语法也有不同要求，前者按相应类数组规则读取，后者需要可迭代对象。超大参数列表受实现资源限制，不宜把百万数组一次展开成函数参数。教学实现应列出支持普通可扩展对象和普通函数等假设，不能声称完全复刻规范。

## 把机制放到一条完整路径中

```flow
一次显式调用
检查目标可调用｜区分函数与普通值
准备接收者和参数｜不擅自改变严格模式语义
执行目标｜箭头和普通函数有不同this规则
返回或传播异常｜教学临时属性必须清理
```

## 配套代码：把机制变成可运行函数

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

验证冻结对象和严格函数的原始 this；不需要临时给对象加属性。

```javascript
function invoke(fn,context,args=[]) {
  if(typeof fn!=='function')throw new TypeError('fn');
  return Reflect.apply(fn,context,args);
}


console.log(invoke(function(a) { return this.value + a; }, Object.freeze({value: 2}), [3]));
console.log(invoke(function() { return this === null; }, null));
console.log(invoke(function() { return typeof this; }, 7));
```

Reflect.apply 保留目标函数自身的 this 规则，并且不要求接收对象可扩展。临时属性法会额外引入冻结对象和原始值装箱的限制。

## 从示例走向实际使用

生产中优先使用标准call、apply或Reflect.apply，手写用于理解调用关系。测试返回值、异常透传、this身份、零参数、null接收者、箭头函数和冻结对象；副作用清理与功能输出同样重要。

写包装器时保持原函数成功、失败和返回契约，尤其不要把目标异常吞掉，再用一个看似正常的默认值掩盖调用失败。
