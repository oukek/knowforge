---
{"id":"net-ajax","moduleId":"network","title":"Ajax 原理：页面怎样在不刷新时请求和更新数据","new":true,"order":5,"prerequisites":["js-promise","net-http"],"sources":["fetch","mdn-http"],"runtime":"model","logs":["loading","success"],"example":"let state = 'idle';\nstate = 'loading'; console.log(state);\nconst payload = await Promise.resolve({ name:'Lin' });\nstate = payload.name ? 'success' : 'empty'; console.log(state);","exampleDescription":"演示请求状态转换，Promise.resolve 返回本地数据；真实网络、XHR 和 Fetch 写法见正文。"}
---
## Ajax 是一种交互方式，不是一种新网络协议

传统表单提交后，浏览器导航到新文档，服务端返回整页 HTML。Ajax 让现有页面通过 JavaScript 发出 HTTP 请求，收到数据后只更新需要变化的区域。名字中的 XML 是历史背景，现在常用 JSON，也能传文本、二进制或表单数据。底层仍受 HTTP、Cookie、同源策略和缓存等规则约束。

例如点击“加载更多”，页面保留滚动位置和已有列表，只把新增条目插入 DOM。这至少有三个部分：发请求的浏览器 API、处理结果的 JavaScript、展示变化的 DOM 或框架状态。网络请求完成不会自动改变页面，JSON 解析后也不会自动变成 HTML。

## 从调用 API 到页面更新经过什么

JavaScript 在主线程调用 fetch 或 XMLHttpRequest，浏览器网络系统负责连接、发送和读取响应。当前 JavaScript 不必同步等待整个网络过程，所以页面还能处理其它工作。响应可用后，相关回调进入对应调度流程；fetch 的 Promise 处理器按微任务规则执行。

fetch 在响应头可用时可以先返回 Response，读取响应体还需要 `response.json()`、`text()` 或消费流。因此 `await fetch(url)` 成功并不说明 JSON 解析成功，也不说明整个响应体已经下载完成。网络错误、HTTP 业务失败、解码失败与界面更新失败，应分别处理。

```flow
一次 Ajax 交互
用户操作｜提交筛选或点击加载
页面代码｜构造 URL、方法、请求头和请求体
浏览器网络系统｜连接、缓存、Cookie、CORS 检查
收到 Response｜先判断 HTTP 状态，再读取响应体
更新状态与 DOM｜处理成功、空列表、失败和过期结果
```

## Fetch 的完整请求与取消

下面是浏览器页面代码，需要同源 `/api/items` 接口返回 `{items:[...]}`。不要将真实模型密钥放进页面；用户能看到发送的所有前端请求。

```javascript
let activeController;
let requestVersion = 0;
async function loadItems(query) {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const version = ++requestVersion;
  try {
    const url = new URL('/api/items', location.origin);
    url.searchParams.set('q', query);
    const response = await fetch(url, { signal:controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('响应结构错误');
    if (version !== requestVersion) return;
    document.querySelector('#result').textContent =
      data.items.map(item => item.name).join('、');
  } catch (error) {
    if (controller.signal.aborted || version !== requestVersion) return;
    document.querySelector('#result').textContent = `加载失败：${error.message}`;
  }
}
```

版本号检查防止旧结果覆盖新查询。abort 让客户端尝试终止等待和传输，但不能撤销已经被服务端执行的操作。`textContent` 将结果当文字显示，不会把用户输入中的标签当可执行 HTML。生产代码还需要校验每个 item 的字段、展示 loading 和空结果，并根据业务决定是否允许重试。

## XMLHttpRequest 与 readyState

XHR 是较早的请求接口，使用事件和可变对象状态。readyState 的0表示未初始化，1表示已经 open，2表示响应头已收到，3表示正在接收，4表示本次操作完成。4只意味着流程结束，不等于 HTTP 成功；仍要检查 status。它与 Promise 的 pending/fulfilled/rejected 完全不是一套状态。

```javascript
const xhr = new XMLHttpRequest();
xhr.open('GET', '/api/items');
xhr.responseType = 'json';
xhr.timeout = 8000;
xhr.onload = () => {
  if (xhr.status >= 200 && xhr.status < 300) console.log(xhr.response);
  else console.error('HTTP 错误', xhr.status);
};
xhr.onerror = () => console.error('网络或访问失败');
xhr.ontimeout = () => console.error('等待超过预算');
xhr.send();
```

XHR 的上传进度事件在一些场景很实用；fetch 的 Promise、Response 和流接口更便于组合。不能笼统说 Fetch 是 XMLHttpRequest 的“语法糖”，它们是不同 API，也不应把 Ajax 与某个库绑定。

## 跨域、Cookie 和重试的工程边界

不同 origin 的读取受同源策略限制，CORS 由服务端响应许可，前端把 mode 改为 no-cors 并不能获得可读的跨域 JSON。携带跨站 Cookie 还涉及 credentials、服务端响应头、Cookie 属性及浏览器策略。允许跨域读取不等于用户已被授权。

GET 搜索失败可以在预算内重试；扣费 POST 不能无脑重复发送，需要服务端幂等契约。请求取消后页面关闭 loading，也不能把服务端操作标为“肯定没执行”。把请求层、状态管理和业务语义分开，才能写出稳定的无刷新交互。
