---
{"id":"net-tls","moduleId":"network","title":"HTTPS、证书链与 TLS","prerequisites":["net-navigation","net-dns-tcp"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识HTTPS、证书链与 TLS

HTTPS是在HTTP通信中使用TLS保护传输。TLS同时涉及对端身份验证、密钥协商以及后续数据的机密性和完整性，不能简化成“用公钥加密整个网页”。浏览器需要确认连接的是证书所代表的主机，而非仅仅收到一个看起来合法的证书文件。

证书把公钥与名称等信息联系起来，由信任链支持验证。私钥不能放到前端，服务器证书公开则是协议正常组成。HTTPS不自动保证站点业务可信，也不消除XSS或越权。

## 握手与对称保护怎样衔接

连接双方协商协议与密码参数，通过握手建立会话密钥并验证必要身份。现代TLS使用的密钥交换与证书签名承担不同角色：证书用于证明身份相关公钥，密钥交换建立本次会话秘密，后续大量应用数据使用高效的对称认证加密。

浏览器验证证书链是否通向可信根、目标主机名是否匹配、有效期等条件是否满足。完整链配置、系统时间和域名变化都可能造成部署失败。自行忽略证书错误会绕过身份校验，不应作为正式故障修复。

会话恢复可以降低后续握手成本，但与直接复用已有连接不同。涉及早期数据的机制还要考虑重放风险，不能把所有状态改变请求都视为可安全提前重发。TLS版本和具体握手消息随协议不同，教学图应注明范围，不把旧版RSA密钥传输描述套给所有现代连接。

## 把机制放到一条完整路径中

```flow
建立受保护通信
连接目标并协商TLS｜明确协议参数
验证证书与主机名｜确认公钥与对端身份关系
完成密钥协商｜建立本次会话秘密
加密并认证应用数据｜传输保护不代替业务授权
```

## 配套代码：证书验证条件的逻辑模型

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

只模拟必需条件，不执行密码学、证书解析或证书链验证。

```javascript
function acceptable(certificate, host, now) {
  return certificate.trusted && certificate.host === host && now >= certificate.start && now < certificate.end;
}
const certificate = {trusted: true, host: 'example.com', start: 100, end: 200};
console.log(acceptable(certificate, 'example.com', 150));
console.log(acceptable(certificate, 'evil.com', 150));
console.log(acceptable(certificate, 'example.com', 200));
```

受信任、主机名匹配与有效期同时需要成立；到期点不再有效。真实验证还包含链、扩展和算法等约束，不能使用这个函数替代 TLS 库。

## 从示例走向实际使用

部署时验证浏览器、代理和源站各段TLS边界，关注证书续期、名称覆盖、混合内容与安全头。终止TLS的代理能够看到明文，因此仍属于需要保护和授权的系统边界。

排查时区分DNS错误、TCP失败、证书校验失败与HTTP业务错误。不要把全部网络异常归为“HTTPS没配好”，更不能为了连通而永久关闭校验。
