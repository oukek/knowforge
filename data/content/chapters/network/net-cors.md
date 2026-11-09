---
{"id":"net-cors","moduleId":"network","title":"同源策略、CORS 与预检","prerequisites":["net-navigation","net-dns-tcp"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识同源策略、CORS 与预检

源由协议、主机和端口组成，同一个域名换端口也可能跨源。浏览器同源策略限制脚本读取另一源的某些资源和数据，CORS由目标服务器通过响应头声明哪些跨源读取被允许。它不是把两台服务器变成同一台，也不是用户登录协议。

必须区分“请求发出”“服务器执行”和“脚本能读响应”。部分跨源请求可能已到服务器，却因响应缺少许可而不能被页面读取，因此CORS错误不能被当成请求必定没有副作用。

## 预检、凭据和响应暴露

某些方法、请求头和内容类型会触发浏览器先发送OPTIONS预检，询问目标是否允许相应来源、方法与头。预检成功后才发送实际请求；预检结果可按规则缓存。不能仅为减少预检而把JSON语义伪装成另一种格式，正确契约与服务安全优先。

跨源携带Cookie需要客户端与服务器的凭据设置配合，还受到Cookie的SameSite、Secure及浏览器策略影响。带凭据的响应不能用通配来源代替明确允许来源。若按Origin动态返回允许值，需要严格白名单校验并考虑Vary: Origin，避免共享缓存混用不同来源的许可。

Access-Control-Allow-Headers决定请求允许携带哪些非简单头，Expose-Headers影响脚本能读到哪些响应头，两者方向不同。Origin可以有特殊形式，不能直接反射任意值并允许凭据。服务端仍要认证、授权和防CSRF，非浏览器客户端不受浏览器CORS读取限制。

## 把机制放到一条完整路径中

```flow
跨源读取流程
判断源与请求形态｜方法、内容类型和请求头
必要时预检｜目标声明允许范围
发送实际请求｜凭据规则与Cookie策略共同作用
校验响应许可｜通过后才向页面脚本暴露相应数据
```

## 配套代码：同源比较与允许源列表

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

URL.origin 同时包含协议、主机和端口。CORS 决策由真实服务端响应和浏览器执行。

```javascript
const page = new URL('https://app.example.com');
for (const url of ['https://app.example.com/a', 'https://app.example.com:8443/a', 'http://app.example.com/a']) {
  console.log(new URL(url).origin === page.origin);
}
const allowed = new Set(['https://app.example.com']);
console.log(allowed.has('https://evil.example.com'));
```

路径不同仍可能同源，端口或协议不同则不同源。允许源列表只是服务端决策的一部分，不能替代浏览器 CORS、预检和凭证规则。

## 从示例走向实际使用

排查时先看是否出现OPTIONS、状态码及允许头，再检查实际响应是否也带正确CORS头。代理错误页和异常响应常漏头，导致真正的服务故障在前端表现成跨域错误。

前端开发代理通过同源入口转发可以简化本地开发，但不是生产授权方案。用可信域名、匿名与带凭据请求分别测试，避免把“浏览器能读”当作“所有访问都合法”。
