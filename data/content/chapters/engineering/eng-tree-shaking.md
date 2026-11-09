---
{"id":"eng-tree-shaking","moduleId":"engineering","title":"Tree Shaking、代码分割与加载时机","prerequisites":["js-modules","net-cache"],"sources":["vite","webpack"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Tree Shaking、代码分割与加载时机

Tree Shaking 尝试删除不会被使用、且删除后不改变程序行为的代码。代码分割则把程序拆成可以在不同时间加载的文件。前者关心哪些代码可以不要，后者关心需要的代码何时获取，两者可以配合但不能互相替代。

例如编辑器只有进入写作页才需要，动态导入可以延后加载；编辑器工具库里从未使用的函数，才可能由静态分析移除。

## 可分析的依赖与必须保留的副作用

ES 模块的静态导入导出让工具较容易追踪使用关系，但动态属性访问、间接调用与模块副作用会限制删除。副作用是模块执行对外部可观察状态的影响，例如注册插件、修改全局变量或导入样式。即使没有导出被使用，这些执行也可能必须保留。

sideEffects 等声明帮助工具判断哪些模块执行可以省略，但错误声明会把必要样式或初始化删除。它不是“压缩更强”的无风险开关。应先理解包的副作用，再针对构建产物检查相关功能，而不是只看体积下降。

分割边界应匹配用户访问路径。拆得过细会增加请求与调度成本，拆得过粗又让首屏承担低频功能。预加载能缩短未来等待，但也消耗带宽和竞争关键资源。公共 chunk 的划分还会影响缓存命中和版本更新时的下载范围。

## 把机制放到一条完整路径中

```flow
减少并延后代码
使用分析｜追踪导出与实际引用
副作用判断｜保留执行会影响行为的模块
分割边界｜按页面和功能组织加载单元
网络验证｜检查首屏成本与后续等待
```

## 配套代码：可达导出与副作用的保留模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

根据使用集合演示为什么副作用声明影响删除安全，不是真实打包器分析。

```javascript
const modules=[
  {name:'used',used:true,sideEffect:false},
  {name:'unused',used:false,sideEffect:false},
  {name:'styles',used:false,sideEffect:true}
];
console.log(modules.filter(item=>item.used||item.sideEffect).map(item=>item.name));
modules[2].sideEffect=false;
console.log(modules.filter(item=>item.used||item.sideEffect).map(item=>item.name));
```

必要样式有副作用时需要保留，误标无副作用后可能丢失。真实 Tree Shaking 还需静态模块结构、语句分析与工具配置，不是这个布尔过滤器。

## 从示例走向实际使用

先列出首屏必需、交互后必需和低频功能，再检查构建报告中的真实依赖。用生产网络时间线确认延迟模块没有被其他静态引用提前拉回主包。

当某次优化导致样式丢失或插件失效时，检查副作用声明与导入路径。体积预算必须与行为测试共同使用，不能把更小文件直接等同于更好构建。
