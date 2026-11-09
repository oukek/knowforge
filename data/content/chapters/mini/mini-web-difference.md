---
{"id":"mini-web-difference","moduleId":"mini","title":"WXML / WXSS、WXS 与 H5 边界","prerequisites":["mini-runtime","mini-setdata"],"sources":["wx-api","wx-runtime"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识WXML / WXSS、WXS 与 H5 边界

H5 页面依赖浏览器的 HTML、CSS、DOM 和 Web API；小程序使用平台自己的结构、样式、组件和接口体系。WXML 看起来像标签，WXSS 看起来像 CSS，但相似的语法并不保证相同的运行能力。

迁移一个网页时，真正需要转换的是运行依赖：组件如何渲染、事件怎样传递、网络怎样请求、页面如何导航，以及宿主允许访问哪些能力。仅把文件后缀改掉无法完成迁移。

## 从结构、逻辑和平台能力逐层对照

WXML 描述界面结构与数据绑定，逻辑层通过平台提供的页面和组件机制处理业务。普通网页里通过 document 创建节点、直接读取 DOM 的代码，不能原样放到小程序逻辑层。需要使用组件、选择器查询和数据更新等相应机制，并理解这些机制可能是异步的。

WXSS 提供小程序样式能力，但布局支持与默认行为应按当前渲染模式核对。WXS 是与模板处理相关的受限脚本能力，不是完整业务 JavaScript 的替身；不要把网络请求、登录状态和复杂领域逻辑迁入它。不同执行环境之间共享变量也不能凭语法相似就假定可行。

网页通过 fetch、History、Cookie 等能力处理请求与导航，小程序常使用 wx.request、页面栈和平台存储。网络域名配置、包体、审核和授权都是部署模型的一部分。跨平台框架可以转换一部分代码，但仍需要开发者理解底层语义差异，否则抽象泄漏时无法定位问题。

## 把机制放到一条完整路径中

```flow
网页到小程序
盘点依赖｜识别 DOM网络导航与存储使用
提取逻辑｜保留纯业务计算和数据契约
宿主适配｜替换平台相关能力
行为验证｜覆盖输入滚动返回与授权
```

## 配套代码：平台适配通过显式接口注入

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

业务逻辑使用统一接口，宿主层决定具体网络/存储实现。

```javascript
function createProfileService(storage) {
  return { save(name) { storage.set('profile', {name}); } };
}
const memory = new Map();
const service = createProfileService({set:(key,value)=>memory.set(key,value)});
service.save('Ada');
console.log(memory.get('profile'));
console.log(typeof document);
```

Worker 也没有 document，依赖 DOM 的库不能直接用；接口注入可隔离业务与宿主。Worker 不是小程序逻辑层，这里只演示缺少 DOM 时的适配原则。

## 从示例走向实际使用

做迁移清单时，按能力分类而不是按文件数量：纯计算工具函数通常较容易复用；DOM 操作、浏览器编辑器、拖拽库和第三方登录需要单独评估。为可复用的业务逻辑定义接口，让宿主适配层处理平台差异。

同一个组件名称在不同端能显示，并不证明交互一致。输入法、滚动、焦点、返回行为和屏幕安全区应使用真实操作用例核对。
