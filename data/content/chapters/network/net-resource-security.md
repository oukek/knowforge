---
{"id":"net-resource-security","moduleId":"network","title":"点击劫持、SRI 与前端供应链","prerequisites":["net-navigation","net-dns-tcp"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识点击劫持、SRI 与前端供应链

页面安全不仅是接口参数。点击劫持通过把页面嵌入另一界面诱导用户点击，供应链风险则来自依赖或外部脚本被替换。第三方脚本一旦在页面运行，通常拥有很强的页面能力，因此“不是我们写的代码”并不会降低它对用户数据的影响。

需要分别保护页面能否被嵌入、资源内容是否符合预期，以及资源提供者和更新链路是否可信。一个安全头不能同时完成这三个目标。

## 嵌入策略、完整性与依赖更新

frame-ancestors通过CSP限制哪些祖先页面可以嵌入当前页面，不能仅靠前端脚本检测是否处于iframe，因为脚本可能被阻止或执行太晚。允许嵌入的业务应列出明确来源，并考虑被嵌入页面中敏感操作的交互确认。

SRI使用预先声明的内容摘要核对加载的脚本或样式是否符合预期。资源更新后摘要也要同步更新，它不判断资源逻辑本身是否安全，也不能保护已经被控制的HTML入口。跨源资源还要满足相应跨源加载要求，部署时应测试失败时的行为。

依赖治理包括锁定版本、审阅升级、限制安装脚本权限、构建产物可追溯及紧急回退。运行时从第三方域名动态加载的代码，即使主仓库没变也可能改变行为。缓存、CDN和签名配置应纳入发布链路，而不是只扫描package.json就认为供应链完成治理。

## 把机制放到一条完整路径中

```flow
页面资源信任链
确定嵌入与加载来源｜谁能包住页面，谁能提供脚本
核对内容完整性｜摘要验证固定资源
控制构建和依赖更新｜版本、权限与审阅
监测失败并回退｜不把安全失败静默降成无限放行
```

## 配套代码：验证资源内容而不是只信 URL

下面代码在课内JavaScript运行区执行；需要DOM、Node或平台SDK的真实集成，应按正文的运行边界另行验证。

使用标准 Web Crypto 计算摘要。真正的 SRI 由浏览器依据完整性元数据验证。

```javascript
const encode = value => new TextEncoder().encode(value);
async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
const expected = await digest('trusted resource');
console.log(await digest('trusted resource') === expected);
console.log(await digest('changed resource') === expected);
```

同样内容得到同样摘要，修改资源使摘要不同。这个片段说明内容完整性，不实现完整 SRI 编码/资源加载，也不能证明被信任的原始代码本身无恶意。

## 从示例走向实际使用

为每个外部脚本记录用途、数据访问、更新方式和失效影响，能移除的冗余脚本直接减少。敏感管理页面与支付页面对嵌入策略分别测试。

验证摘要不匹配、外部资源不可用和旧HTML引用新资源等故障。安全策略上线前可使用报告机制收集兼容问题，但最终执行策略与仅报告模式要明确区分。
