---
{"id":"js-modules","moduleId":"js","title":"ESM、CommonJS 与循环依赖","prerequisites":["js-scope","js-closure"],"sources":["mdn-js","ecma"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识ESM、CommonJS 与循环依赖

模块把一组定义放在独立作用域中，并通过导入导出表达依赖。它解决的是名字隔离、初始化顺序和复用关系，不只是把大文件拆小。ESM使用import/export声明依赖，CommonJS通过require和module.exports组织加载，二者的运行机制与宿主支持不同。

浏览器原生模块、Node模块和打包工具转换后的模块不是完全相同环境。分析问题时先确认文件被谁加载、属于哪种模块格式、是否经过编译，避免把打包后的表现当成语言本身的固定行为。

## 链接、求值与循环依赖

ESM的静态导入让依赖关系可以在执行主体前被分析与链接。导入的绑定关联导出端的绑定，常称live binding；它不是每次import都复制一个独立变量。导出let被模块内部更新后，读取方可观察新值，但读取方不能把导入绑定任意重新赋值。

CommonJS常在执行到require时加载并执行模块，导出对象进入缓存。同一路径解析到同一模块身份后，后续加载通常复用已初始化结果；重新赋给module.exports与修改旧导出对象的成员会影响不同持有者。ESM和CommonJS互操作还有宿主和版本规则，不能用一个教学模拟覆盖全部默认导出行为。

循环依赖时，A尚未执行完就需要B，而B又需要A。ESM可能遇到尚未初始化的绑定，CommonJS可能暴露部分初始化的导出对象。修复通常是调整依赖方向、提取共同接口、减少导入期副作用，而不是随机调整导入行顺序。模块顶层发请求或注册全局任务还会使测试和服务启动难以控制。

## 把机制放到一条完整路径中

```flow
模块从依赖到运行
识别格式与宿主｜ESM、CommonJS及工具转换
解析链接依赖｜建立导入导出关联
按规则求值与缓存｜循环可能看到未初始化状态
显式启动业务｜资源生命周期与模块定义分离
```

## 配套代码：live binding 与值快照的教学模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

用 getter 对照“读取当前绑定”与“保存当时值”；这不是实际模块加载器。

```javascript
let exported = 1;
const namespace = {get count() { return exported; }};
const snapshot = namespace.count;
exported = 2;
console.log(namespace.count);
console.log(snapshot);
```

getter 在读取时取当前值，snapshot 只保存了当时的原始值。这个模型帮助理解 live binding，但没有模拟 ESM 链接、只读导入和循环初始化规则。

## 从示例走向实际使用

让入口负责组装配置和启动资源，模块文件主要定义能力。业务初始化使用显式函数，避免导入即写数据库。动态import适合按需边界，但其返回Promise不意味着模块计算被移到后台线程。

测试从干净进程加载、循环路径、错误模块和同名不同路径解析；构建后也需检查产物，因为开发服务器的热更新可能隐藏初始化问题。
