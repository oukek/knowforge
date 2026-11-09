---
{"id":"net-web-attacks","moduleId":"network","title":"Web 攻击与防护：XSS、CSRF、注入、SSRF 和越权","new":true,"order":9,"prerequisites":["net-http","net-cors"],"sources":["owasp","mdn-http"],"logs":["false","true"],"example":"const canRead = (user, row) => row.tenantId === user.tenantId;\nconsole.log(canRead({tenantId:'A'}, {tenantId:'B'}));\nconsole.log(canRead({tenantId:'A'}, {tenantId:'A'}));","exampleDescription":"用本地数据演示租户授权条件。生产授权必须在后端对可信身份执行，不能依靠前端判断。"}
---
## 攻击的共同根源：把不可信输入放进更高权限的上下文

用户输入、URL 参数、第三方响应、上传文件和模型输出都可能由他人控制。风险往往发生在这些数据被解释为代码、SQL、网络目的地址，或被当成可信用户身份的时候。防护的第一步不是统一删掉某几个字符，而是确定数据到达哪里、被什么解释器处理、以谁的权限执行。

浏览器安全与服务端安全相互补充。前端按钮隐藏只是交互，不能阻止人直接请求 API；CORS 主要约束浏览器对跨源响应的读取，不是身份认证，也不限制普通 HTTP 客户端；HTTPS 保护传输，不会自动消除页面脚本注入。

## XSS：数据被页面当成了可执行内容

XSS 可来自直接拼接响应 HTML、数据库保存的恶意文本，或前端将 URL/接口字段写进危险 DOM 接口。区别是进入路径与持续性不同，核心都在于不可信内容获得页面脚本能力。它可能读取页面可访问的数据、代表用户发请求或伪造界面。HttpOnly 能限制 JavaScript 读取 Cookie，却不能阻止已在页面中运行的脚本滥用当前登录状态。

```javascript
// 页面中显示普通文本时，使用文本接口。
const message = new URLSearchParams(location.search).get('message') ?? '';
document.querySelector('#message').textContent = message;
// 不要改成 innerHTML = message。
```

需要富文本时使用维护中的 HTML 清洗器，并限制允许的标签、属性和 URL 协议。HTML 文本、HTML 属性、JavaScript 字符串和 URL 是不同上下文，不能用同一种简单转义包打天下。CSP 可以限制脚本来源和执行方式，是额外防线，不能替代正确的数据输出与依赖管理。

## CSRF：浏览器自动带上凭据，但操作不是用户主动发起

当站点用 Cookie 作为登录凭据，浏览器在符合条件的请求里可能自动携带它。攻击者诱导用户从其它站点发出请求，如果服务端只检查“有登录 Cookie”，就可能执行非用户本意的状态改变。这与 XSS 不同：CSRF 不必先把脚本植入目标站点。

常用组合是 SameSite Cookie、服务端校验 CSRF token、检查 Origin，并避免 GET 执行修改操作。token 应与会话绑定，不能只要求存在任意字符串。SameSite 的具体行为与站点关系、导航方式有关；跨站场景还需要明确产品交互，不能只抄一条 Cookie 配置。

```flow
带 Cookie 的修改请求如何建立信任
认证会话｜是谁，凭据是否有效
校验请求来源与 CSRF token｜是否满足本应用的修改请求契约
校验对象权限｜是否能修改这一条资源
校验数据并执行业务事务｜输入合法不代表操作已获授权
```

## SQL 注入与命令注入：参数不能当语法

拼接 SQL 的问题是用户内容与查询语法混在一起。使用参数绑定，让数据库驱动按参数值处理内容；列名、排序方向等不能任意绑定成标识符时，应从固定白名单映射。

```javascript
// mysql2 示例：需要在服务端已有连接与已认证用户上下文。
const [rows] = await connection.execute(
  'SELECT id,title FROM notes WHERE tenantId=? AND id=?',
  [session.tenantId, noteId]
);
```

参数绑定解决值的注入，不自动解决租户隔离。上例仍明确约束 tenantId。类似地，执行系统命令优先使用程序与参数数组，避免将输入拼成 shell 字符串；即使没有 shell，程序参数本身也可能触发危险功能，仍要校验允许操作。

## SSRF 与对象级越权

SSRF 是服务端替请求者访问了不该访问的网络目标，例如用户提交一个“图片地址”，后端去下载时触达内部服务。只检查字符串以 https 开头远远不够，还要限制目的主机、解析后的地址范围、重定向目标、网络出口和响应大小；检查和真正连接之间的 DNS 变化也要考虑。授权代理的允许清单通常比任意 URL 下载更可靠。

对象级越权则可能完全不涉及注入。用户把 `/orders/123` 换成其它 ID，后端若只验证已登录，就可能泄露别人的订单。不可猜测 ID 能降低枚举便利，但不是授权。每次访问都要基于可信身份校验资源所有者、租户、角色或共享规则。

## 让防护成为交付流程

写测试时覆盖匿名、本人、同租户不同角色、其它租户和已撤销权限；对富文本和文件准备安全的恶意形状样本，在授权测试环境验证，不对公共站点探测。日志记录拒绝类型与请求 ID，避免记录 Cookie、token 和完整敏感正文。

一个真实系统需要输入约束、输出处理、认证、授权、资源限制、依赖更新和审计多层配合。学习时把每种攻击沿着“输入→解释位置→权限→影响”画出来，再选择对应防护；背诵攻击缩写不能代替识别信任边界。
