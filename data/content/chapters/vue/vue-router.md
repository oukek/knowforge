---
{"id":"vue-router","title":"Vue Router：URL、路由参数、嵌套页面和导航守卫","moduleId":"vue","prerequisites":["vue-components","net-navigation"],"sources":["vue","vue-render"],"new":true,"order":8,"logs":["42","recent"],"runtime":"model","example":"const url=new URL('https://example.test/courses/42?sort=recent');\nconsole.log(url.pathname.split('/').at(-1));\nconsole.log(url.searchParams.get('sort'));","exampleDescription":"解析 URL 的路径与查询；实际导航匹配和守卫由 Vue Router 完成。"}
---
## 路由决定如何把 URL 映射成界面
浏览器 URL 包含路径、查询和片段。前端路由读取它们，决定展示哪个组件以及传入什么页面状态。history 模式用浏览器历史 API 更新地址而不加载整份文档，但刷新深层路径时服务器仍会收到请求，需要把页面路由正确回退到入口文件；API 路径不能一起盲目回退成 HTML。

路径参数适合资源身份，如 /courses/:id；查询参数适合筛选、排序和分页。将可分享的筛选状态放 URL，别人打开链接才能看到同一条件。临时展开状态未必需要进入 URL，更不能把敏感凭据放在可记录、可分享的地址里。
## URL如何映射成页面状态

路由表把路径模式映射到组件，动态参数表示资源身份，query适合筛选、排序和分页等可分享状态。路径`/courses/:id`中的id和`?page=2`中的page含义不同，读取后仍需解析与校验，不能因为来自路由就当成合法业务值。

RouterLink表达应用内导航，RouterView提供当前匹配组件的显示位置。嵌套路由让父布局和子页面组合，history模式依赖服务器把应用路径回退到入口；前端路由跳转成功并不证明刷新深层URL也能成功，部署时必须验证。

## 导航、数据加载与权限分别完成什么

导航守卫可以在进入页面前检查登录状态或重定向，但服务端API仍必须执行认证和授权。攻击者可以不经过页面直接调用接口，因此隐藏菜单或前端拒绝进入只是交互层措施。异步守卫应有清楚失败路径，避免无限重定向或长期悬停。

同一路由组件在参数变化时可能被复用，mounted不一定再次执行。课程ID从A变为B时，应观察具体参数或使用适合的路由钩子重新加载，清理旧请求并拒绝过期响应。错误状态、空状态和loading状态都应与当前参数关联。

把可以分享或刷新恢复的筛选条件放入URL有利于用户返回，但临时密码、敏感token和巨大草稿不适合放query。浏览器历史、日志和外部引用可能记录URL，状态位置应根据持久性和敏感程度选择。

## 定义路由与使用参数
```javascript
import { createRouter, createWebHistory } from 'vue-router';
export const router = createRouter({
  history:createWebHistory(),
  routes:[
    {path:'/',component:()=>import('./Home.vue')},
    {path:'/courses/:id',component:()=>import('./Course.vue'),props:true}
  ]
});
```
在入口 app.use(router)，用 RouterView 展示匹配组件，RouterLink 创建站内导航。动态 import 按路由拆包，不代表接口数据也已加载。参数变化时可能复用同一个组件实例，不能只在 onMounted 请求一次便认为切换 id 一定重新执行。
## 参数变化与请求生命周期
在页面里 watch(() => route.params.id, ...) 或将 props 当明确来源，参数变化时取消旧请求并更新新数据。嵌套路由让父布局保持，只替换内部视图；这也意味着父组件状态生命周期更长。不要从“地址变了”推断所有组件都卸载。
```flow
一次客户端导航
触发链接或程序跳转｜解析目标路径和参数
匹配路由与执行守卫｜处理重定向、取消与异步检查
加载组件并确认导航｜旧视图与新视图按层级更新
页面加载数据｜处理取消、空状态、错误与滚动位置
```
## 守卫不是后端授权
守卫可以检查当前登录状态，未登录时跳登录页并保留安全的返回路径，改善使用体验。但攻击者可以直接请求 API，服务器仍必须校验身份和资源权限。返回地址只接受站内目标，避免开放重定向。

测试包括刷新深层路径、浏览器前进后退、同组件不同参数、无权限和找不到资源。部署到子路径时路由 base 与静态资源 base 要一致；错误页要区分服务端404、API失败和客户端没有匹配路由，不能全部显示“网络异常”。
