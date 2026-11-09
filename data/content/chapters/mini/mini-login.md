---
{"id":"mini-login","moduleId":"mini","title":"wx.login、code2Session 与自定义登录态","prerequisites":["mini-runtime","mini-setdata"],"sources":["wx-login"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识wx.login、code2Session 与自定义登录态

wx.login 让小程序获取一个临时登录凭证 code。它不是业务系统最终使用的登录令牌，也不意味着用户已经允许获取手机号。业务登录要由自己的服务端把平台身份映射到业务账号，再建立可控制过期和注销的会话。

例如用户打开学习网站的小程序版，平台能帮助识别某个应用范围内的用户；学习进度属于哪个账号、账号是否被禁用、会话多久过期，则由业务系统决定。

## 平台凭证怎样变成业务会话

客户端先调用 wx.login 得到 code，再把 code 通过 HTTPS 交给自己的服务端。服务端使用受保护的应用凭据调用平台的 code2Session，获得平台返回的身份信息与相关会话材料。AppSecret 必须留在服务端；把它放进小程序包中，任何下载包的人都有机会取得它。

服务端根据平台身份查找或创建业务用户，然后签发自己的会话凭证。客户端后续请求携带业务凭证，服务端验证会话与用户权限。平台身份标识的作用域要明确：不能未经确认就把不同应用中的标识当成同一个用户，也不能让客户端直接提交一个 openid 来证明自己拥有该身份。

临时 code 有使用和有效期约束，失败后应重新获取，不能把它长期缓存当密码反复重放。业务令牌也需要失效、注销和轮换策略。登录失败、网络失败和账号被禁用应返回不同业务状态，前端据此决定重试、重新登录或显示说明。

## 把机制放到一条完整路径中

```flow
平台登录到业务登录
客户端｜获取短期 code
业务服务端｜向平台校验并换取身份
账号映射｜查找创建或绑定业务用户
业务会话｜签发并验证自己的登录凭证
```

## 配套代码：一次性 code 与业务会话分离

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

用服务端 Map 模拟 code 被消费后不能再次交换；不生成真实微信凭证。

```javascript
const unusedCodes = new Set(['code-A']);
function serverExchange(code) {
  if (!unusedCodes.delete(code)) throw new Error('code 已使用');
  return {businessSession:'session-demo', userId:'user-A'};
}
console.log(serverExchange('code-A').userId);
try { serverExchange('code-A'); } catch (error) { console.log(error.message); }
```

code 的使用与自定义业务会话是不同层；平台交换和密钥保留在真实服务端。这个内存模型没有鉴权、签名、过期或安全随机性，不能作为登录实现。

## 从示例走向实际使用

把登录接口设计为输入平台凭证、输出业务会话与必要用户信息；日志仅记录请求 ID 和失败类别，不输出 AppSecret 或敏感会话材料。创建用户与绑定身份要有唯一性约束，避免并发首次登录创建两个账号。

手机号授权若用于补充联系方式，应是独立流程。用户能够登录但拒绝提供手机号，是正常的产品状态，不应被错误地判为平台登录失败。
