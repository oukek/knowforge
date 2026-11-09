---
{"id":"net-storage","moduleId":"network","title":"Cookie、Web Storage 与 IndexedDB","prerequisites":["net-navigation","net-dns-tcp"],"sources":["mdn-http"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识Cookie、Web Storage 与 IndexedDB

浏览器存储保存不同形式的状态。Cookie主要参与HTTP会话传递，Web Storage提供同步字符串键值存取，IndexedDB提供异步、可事务化的结构化数据存储。它们不只是容量不同，也有发送方式、线程影响、数据模型和生命周期差别。

本地保存成功不等于服务器已经同步，也不保证用户清理站点数据后仍存在。选择存储时要先决定这份数据是缓存、草稿、凭据还是唯一业务记录。

## 同步键值与异步事务

localStorage在同源范围内持久保存字符串，sessionStorage通常与标签页会话相关，具体复制与恢复行为由浏览器机制影响。同步读写可能阻塞主线程，大量JSON解析和序列化也有成本。它们不适合用一个巨型值模拟数据库并频繁整份覆盖。

IndexedDB以对象仓库、键和索引组织数据，读写发生在事务中。事务范围和模式决定可访问哪些仓库以及是否可写；结构升级通过版本变更流程完成，旧页面持有连接可能阻挡升级，需要versionchange等协调。事务生命周期短，不能在其中随意等待无关网络请求后再假定事务仍活跃。

浏览器有配额、驱逐、隐私模式和持久存储策略，写入可能失败。跨标签页同步需额外通知或重新读取，不能只修改一个页面的内存状态。登录用户切换时，缓存键和清理规则要包含身份范围，避免上一账号草稿被下一账号看到。

## 把机制放到一条完整路径中

```flow
保存浏览器状态
分类数据用途｜缓存、草稿、凭据或业务记录
选择存储模型｜Cookie、同步字符串或异步事务
按身份与版本读写｜处理配额、冲突和升级
同步与恢复｜本地完成不等于远端完成
```

## 配套代码：按身份、版本隔离客户端缓存

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

用 Map 代表存储，演示缓存键和版本检查；这里不是浏览器 localStorage。

```javascript
const storage = new Map();
const key = user => 'draft:v2:' + user;
storage.set(key('A'), JSON.stringify({version:2, text:'草稿 A'}));
function read(user) {
  const raw = storage.get(key(user));
  if (!raw) return null;
  const data = JSON.parse(raw);
  return data.version === 2 ? data.text : null;
}
console.log(read('A'));
console.log(read('B'));
```

缓存键包含身份和格式版本，用户 B 不会读到 A 的草稿。真实存储还要处理配额、损坏与退出清理，客户端存储不能作为权限证明。

## 从示例走向实际使用

将可重建缓存与不可丢草稿分开，记录版本与同步状态，提供导出或服务端备份。凭据选择应结合XSS、CSRF与会话撤销设计，不因某种存储“方便”就认为安全。

测试配额失败、结构升级、多个标签页并发、退出登录及离线恢复。教学Map模型只能解释键与版本关系，不能证明真实IndexedDB事务或浏览器驱逐行为。
