---
{"id":"node-middleware","moduleId":"node","title":"Koa 洋葱模型与 Express 中间件","prerequisites":["js-promise","js-async-await"],"sources":["koa"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Koa 洋葱模型与 Express 中间件

中间件是在请求到达业务处理器之前或之后执行的公共处理单元，例如记录耗时、识别用户和统一处理异常。它让不同接口共享流程，但中间件顺序本身就是程序逻辑，不能把注册顺序当成无关配置。

Koa 的“洋葱模型”来自 await next()：外层执行前半段，等待内层完成，再执行后半段。像函数调用返回一样，请求进入的顺序与返回处理的顺序相反。

## await next 如何形成包围关系

假设 A 在 B 外层，A 先记录开始时间，再 await next()；B 处理业务后返回，A 才计算总耗时。因此 A 可以观察整个内部链路的耗时和异常。若 A 忘记 await，也没有返回内部 Promise，自己的后半段会提前执行，响应和错误处理顺序就可能失真。

组合器需要防止同一中间件重复调用 next，因为这会让后续处理器重复执行。异常处理应放在能够包围相关步骤的位置，用 try/catch 捕获内部抛出的错误，并转成一致响应。已经发送的流式响应不能像普通 JSON 一样随意重写状态码，需要单独处理连接终止与日志。

Express 的 next 用于把控制权交给后续处理器，其机制不应直接等同于 Koa 的 Promise 包围链。错误处理方式与异步支持还依赖框架版本。无论使用哪种框架，认证应在受保护业务前执行，正文大小限制应在昂贵解析前生效，日志应记录失败而不泄露凭证。

## 把机制放到一条完整路径中

```flow
洋葱式中间件
外层进入｜建立日志和错误边界
内层进入｜认证校验并执行业务
内层返回｜形成结果或抛出异常
外层返回｜统一记录和结束请求
```

## 配套代码：洋葱模型的 await next

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

用普通 async 中间件组合展示进入和回退顺序。

```javascript
const middleware=[
  async next=>{ console.log('A 进入'); await next(); console.log('A 返回'); },
  async next=>{ console.log('B 进入'); await next(); console.log('B 返回'); }
];
function dispatch(index) { return Promise.resolve(middleware[index]?.(()=>dispatch(index+1))); }
await dispatch(0);
```

外层等待下游完成后再返回。真实 Koa 组合还防止重复 next、传递 ctx 并处理异常；删掉 await 可以观察返回顺序变动，但不应把此简版作为生产 compose。

## 从示例走向实际使用

先画出请求的公共步骤：追踪上下文、异常边界、请求限制、身份验证、业务路由和响应记录。确定每一步需要包围谁，再决定注册顺序。

修改课内示例，去掉一个 await 或在内部抛异常，观察进入与返回顺序。真实框架测试还应包含未调用 next、重复 next、响应后异常和客户端断连。
