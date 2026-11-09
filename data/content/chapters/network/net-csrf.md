---
{"id":"net-csrf","moduleId":"network","title":"CSRF、Cookie 与会话安全","prerequisites":["net-navigation","net-dns-tcp"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识CSRF、Cookie 与会话安全

Cookie登录时，浏览器可能自动为符合条件的请求携带会话凭据。CSRF利用这种自动携带，让用户从其它站点触发非本人意图的状态改变。攻击者不一定能读取响应，也不需要先在目标站点植入脚本，所以它与XSS属于不同入口。

认证证明请求带着谁的凭据，CSRF防护帮助确认修改请求满足本应用的来源与令牌契约，资源授权再判断这个身份能改什么。三个检查不能相互替代。

## Cookie范围、SameSite与令牌绑定

Cookie的Domain与Path影响发送范围，Secure约束安全传输，HttpOnly限制脚本读取，SameSite控制一定跨站情形下的发送。站点与源的定义不同，同站子域也可能跨源；CORS设置正确并不自动建立CSRF防护。

常见防护组合包括与会话绑定的CSRF token、Origin校验和合适SameSite策略。服务器不能只检查请求里有个名为token的字段，还需验证它与当前会话关系及有效性。跨域部署、单点登录和第三方嵌入可能改变Cookie需要的策略，应按真实流程验证。

GET应避免产生状态改变，否则图片加载、链接预取或导航也可能意外触发操作。使用JSON和自定义请求头可以改变浏览器请求路径，但不是无需考虑CSRF的普遍证明；异常兼容接口和宽松CORS都可能破坏假设。XSS一旦存在也可能读取页面token，因此两类防护需同时做好。

## 把机制放到一条完整路径中

```flow
验证一次修改请求
认证会话｜确认有效身份
校验来源和CSRF令牌｜令牌必须与会话契约匹配
检查资源权限｜用户只能操作获授权对象
执行业务并记录结果｜防重复与审计仍需独立设计
```

## 配套代码：请求意图校验的模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

模拟会话 token 与精确来源同时匹配。真实策略需结合 Cookie、SameSite 和威胁模型。

```javascript
function authorizedRequest(request, session) {
  return request.origin === 'https://app.example.com' && request.csrf === session.csrf;
}
const session = {csrf: 'token-A'};
console.log(authorizedRequest({origin:'https://app.example.com', csrf:'token-A'}, session));
console.log(authorizedRequest({origin:'https://evil.com', csrf:'token-A'}, session));
console.log(authorizedRequest({origin:'https://app.example.com', csrf:'bad'}, session));
```

两个条件在模型里同时成立才接受；来源相同但 token 错误也失败。这不是完整认证/CSRF 中间件，真实服务端还需会话、权限和适合的头部校验。

## 从示例走向实际使用

注册、登录、退出、改密码和支付等接口分别验证来源与会话边界，登录本身也可能需要考虑登录CSRF。拒绝时返回稳定错误并清理过期界面状态，而不是让客户端无限重试。

测试缺令牌、错误令牌、其它会话令牌、允许与不允许来源，以及跨子域部署。不要通过把Cookie转存到前端可读位置来“解决”问题，这会改变威胁面而非自动消除风险。
