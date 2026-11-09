---
{"id":"vue-ssr","title":"Vue SSR 与 Hydration：服务端 HTML 如何接上交互","moduleId":"vue","prerequisites":["vue-render","vue-state"],"sources":["vue","vue-render"],"new":true,"order":9,"logs":["课程目录"],"runtime":"model","example":"const initialState={title:'课程目录'};\nconsole.log(JSON.parse(JSON.stringify(initialState)).title);","exampleDescription":"仅演示共享可序列化初始数据；真正 SSR 和 hydration 必须在 Vue 服务端与浏览器项目中验证。"}
---
## 为什么服务端要先生成 HTML
纯客户端页面可能先下载脚本、执行框架、请求数据，之后才出现主要内容。SSR 在服务端根据请求生成 HTML，使浏览器较早得到有结构的内容。它可以改善某些首屏与索引需求，但服务端渲染、数据获取、序列化和客户端激活同样有成本，并非任何应用都需要 SSR。

Hydration 是客户端利用已存在的 HTML 建立组件关系和事件处理。它不是简单再 append 一套 DOM；客户端首次渲染应与服务端输出相匹配，否则可能发生警告、修复和额外工作。静态生成适合构建时已知且可复用内容，动态 SSR 处理每次请求数据，二者需要不同缓存策略。
## SSR、预渲染与客户端渲染的区别

客户端渲染通常先下载脚本，再由浏览器建立主要界面；SSR在请求时在服务器生成HTML，使浏览器更早收到内容；预渲染则在构建时为已知页面生成HTML。三者解决的成本位置不同，SSR仍需要服务器计算和缓存，不能简单保证所有页面更快。

浏览器接到SSR HTML后，客户端运行对应应用，通过hydration把现有DOM与组件状态、事件关联。服务器与客户端必须基于兼容的初始数据生成一致结构，否则会发生不匹配和修复。随机数、当前时间、时区或直接读取window都可能让两端结果不同。

## 服务端执行代码时没有普通浏览器环境

服务端没有window、document等浏览器对象，涉及DOM的逻辑应放在客户端生命周期或明确条件边界。组合式函数若导入时就访问localStorage，即使组件还没挂载，也可能导致SSR失败。把纯数据逻辑与浏览器能力分离，才能在两种环境中复用。

每个请求应有独立应用与状态容器。模块级单例若保存用户信息或请求缓存，可能将甲用户数据泄漏给乙用户；缓存键还要包含必要身份和权限维度，不能只按URL路径缓存所有响应。初始状态注入HTML时也需安全序列化，避免内容突破脚本或HTML边界。

上线验证要覆盖直接访问、客户端导航、慢数据、错误页面和水合后的真实交互。仅检查HTML里有标题不够，还要确认按钮能用、初始数据不重复乱请求、客户端状态与服务器一致。

## 认识最小服务端入口
```javascript
// Node 环境示意，需要 vue 与 @vue/server-renderer。
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
const app = createSSRApp({
  data:()=>({title:'课程目录'}),
  template:'<h1>{{ title }}</h1>'
});
const html = await renderToString(app);
console.log(html);
```
实际工程还需要客户端入口、构建产物清单、路由、数据注入和错误处理，通常选择成熟 SSR 框架组织。不要把最小 renderToString 示例误当可直接部署的完整服务器。
## 哪些差异会造成 hydration mismatch
服务端和客户端直接使用 Date.now、Math.random 或不同的时区格式化，可能产生不一致文本；根据 window.innerWidth 决定首次 DOM 结构时，服务端又不知道浏览器宽度。解决方法是共享必要初始数据、固定格式或将纯浏览器内容延迟到挂载后，且保留合理初始占位。
```flow
SSR 页面的一次到达
请求到服务端｜认证、路由与数据获取
创建本请求应用实例｜隔离用户状态
生成 HTML 与必要初始数据｜正确转义，禁止泄露密钥
浏览器接收 HTML｜先解析和展示
加载客户端入口并激活｜用匹配数据接管交互
```
## 状态隔离与缓存边界
不要在服务端模块顶层保存当前用户的 store，否则同一进程处理不同请求时可能串数据。每次请求创建自己的应用和状态，公开数据与私人数据分开缓存。将 JSON 注入 script 时必须安全序列化，单纯 JSON.stringify 不等于在任意 HTML 上下文都安全。

验收要检查禁用 JavaScript 时的基础内容、慢脚本时的可见状态、激活后的交互、不同用户并发请求和首屏错误。SSR 可以提前展示，但界面看起来能点而尚未完成激活也会影响体验；需要测量整个交付过程，不能只报 HTML 更快返回。
