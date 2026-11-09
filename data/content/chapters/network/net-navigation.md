---
{"id":"net-navigation","moduleId":"network","title":"从 URL 输入到页面可交互","prerequisites":[],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识从 URL 输入到页面可交互

输入网址后看到页面，实际跨越了地址解释、网络、文档加载、脚本执行与浏览器渲染多个系统。URL包含协议、主机、端口、路径、查询与片段等部分，浏览器先确定要导航到哪里，再决定是否可复用缓存或已有连接。片段通常由客户端用于定位，不作为普通HTTP请求目标的一部分发送。

这道经典问题不是要求死背一条永远发生的流水线。缓存命中、Service Worker、重定向、连接复用与不同HTTP版本都会改变实际路径，应先描述常见首次HTTPS访问，再说明哪些阶段可能跳过或重复。

## 从地址到可交互内容的阶段职责

域名解析提供可连接地址，传输连接和TLS建立通信与对端认证基础，HTTP请求表达要获取的资源。响应可能是重定向，需要重新按目标地址继续；也可能从浏览器、代理或CDN缓存取得。TTFB只描述首字节到达前的等待，不能代表完整页面已经下载或可用。

HTML解析建立DOM，遇资源引用会安排后续加载，预加载扫描等机制可能提前发现资源。CSS影响样式与渲染，普通同步脚本可能暂停文档解析以执行并修改DOM；async、defer和模块脚本各有调度规则。资源下载可以重叠，但脚本的依赖和执行顺序仍需正确表达。

DOM和样式进入布局、绘制、栅格化与合成，用户逐渐看到内容。DOMContentLoaded、load与应用自己的可交互状态不是同一个事件：图片可能仍在加载，脚本也可能在load后继续发请求。单页应用路由切换还可能复用当前文档，只加载数据与部分代码，不能每次都按完整导航解释。

## 把机制放到一条完整路径中

```flow
一次常见文档导航
解释URL与查缓存｜确定目标和可复用资源
准备连接并请求｜DNS、传输、TLS与HTTP按实际协议发生
解析文档与加载依赖｜HTML、CSS和脚本相互影响
布局绘制并接管交互｜可见、加载结束和业务就绪分别验证
```

## 配套代码：关键资源的依赖图模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

通过依赖时间计算首屏关键路径；不会真的打开网络连接或渲染页面。

```javascript
const tasks = {
  html: {duration: 80, dependencies: []},
  css: {duration: 30, dependencies: ['html']},
  js: {duration: 50, dependencies: ['html']},
  render: {duration: 10, dependencies: ['css', 'js']}
};
function finish(name) {
  const task = tasks[name];
  return task.duration + Math.max(0, ...task.dependencies.map(finish));
}
console.log(finish('render'));
tasks.js.duration = 20;
console.log(finish('render'));
```

模型中 CSS 与 JS 在 HTML 后并行，关键路径取较慢依赖而不是总和。JS 优化到 20 后，CSS 成为关键依赖；真实浏览器还有流式发现和主线程调度。

## 从示例走向实际使用

排查慢页面时用Network与Performance把阶段串起来：连接准备、服务器等待、资源瀑布、长任务、布局与绘制分别看证据。给首屏关键内容定义可观察指标，而不是只记录window.onload。

练习分别测试冷缓存、热缓存、慢网络、重定向与脚本失败，解释路径为何不同。页面出现内容只是一个完成点，登录态恢复、错误反馈和输入响应仍需应用自行设计。
