---
{"id":"vue-state","title":"Vue 共享状态与 Pinia：状态归属、派生值和异步操作","moduleId":"vue","prerequisites":["vue-components","vue-computed-watch"],"sources":["pinia","vue"]}
---
## 从局部状态到共享状态
一个弹窗的是否展开通常由附近组件管理；当前登录用户可能被许多路由使用；服务器列表则还涉及筛选、分页和缓存有效性。它们不应因为都叫“状态”就全部放在同一个全局对象里。首先区分生命周期、拥有者以及谁可以修改。

共同父组件加 props/emit 能解决不少共享需求。跨多层组件的上下文可以 provide/inject；跨路由并有稳定业务操作的状态可以进入 store。状态库的作用是提供可组织、可观察的共享边界，不是替代数据库或自动解决并发请求。
## 状态按所有者与生命周期分类

输入框草稿只属于当前组件，可使用局部ref；多个兄弟组件都需要的数据可以提升到共同父组件；跨路由共享的会话或设置适合专门状态容器；服务器返回的课程数据还涉及缓存、刷新和失效。把这些都放进一个全局对象，会让生命周期、权限和更新责任混在一起。

状态所有者负责接受修改意图并维持规则。例如用户修改名字，草稿可以立即变化，但已保存的用户资料应在接口成功后按策略更新；失败时需要保留错误或恢复。loading、error与data共同描述请求状态，不应只靠data是否为空推断“还没请求”还是“结果为空”。

## Store不是数据库，也不会自动解决异步竞态

Pinia等状态库提供集中状态、派生值和操作入口，便于多个组件协作，但刷新页面后是否保留取决于持久化策略。localStorage中的旧用户数据必须在登出与身份切换时正确处理，不能因为store仍有值就跳过服务端身份核验。

搜索A后立即搜索B，A较慢返回时仍可能覆盖B；无论请求放在组件还是store都需要取消或版本标识。多个写入还涉及乐观更新、回滚与服务器版本冲突，不能把action返回Promise当成一致性保证。

SSR中应为每个请求建立独立状态实例，避免模块单例保存某位用户数据后被下一请求读取。序列化给浏览器的初始状态也要经过安全处理，并只包含客户端需要的字段。状态管理的价值在于清楚的数据流和边界，而不是把变量都搬到另一个文件。

## 一个有明确操作的 Store
下面代码需要在 Vue 项目安装 Pinia 并将实例注册到应用。组件通过 storeToRefs 保留状态和 getter 的响应式关联，操作函数则直接调用。
```javascript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
export const useCart = defineStore('cart', () => {
  const lines = ref([]);
  const total = computed(() => lines.value.reduce((sum,x) => sum+x.price*x.quantity,0));
  function add(product) {
    const existing = lines.value.find(x=>x.id===product.id);
    if (existing) existing.quantity++;
    else lines.value.push({...product,quantity:1});
  }
  function clear() { lines.value=[]; }
  return { lines, total, add, clear };
});
```
这里 total 可从 lines 推导，因此不额外保存并手动同步。真实购物车价格应由服务端结算校验，浏览器 total 只是展示；不能因为操作集中到 store，就信任客户端价格。
## 请求状态与持久化要另外设计
异步 action 需要区分 idle、loading、success、error，并处理取消和旧请求结果。保存到 localStorage 只提供当前浏览器持久化，不等于跨设备同步；记录要有版本、失效和退出登录清理策略。密钥和敏感身份凭据不能为方便调试随意写进可读存储。
```flow
一条共享业务数据的生命周期
登录或进入页面｜确定当前用户和数据范围
发起读取｜记录 loading、请求版本与取消信号
接受有效响应｜只让当前请求更新当前身份的数据
用户操作｜通过明确 action 修改或提交
退出或切换身份｜清理旧数据与未完成请求
```
## SSR 与测试中的隔离
服务端渲染进程会处理不同用户请求。若在模块顶层复用一个包含用户数据的 store，可能让请求之间共享状态。应按每个应用/请求创建合适实例，序列化时只传可公开的必要数据，并正确转义。浏览器每个标签页的局部状态与服务端长寿命进程的状态，生命周期完全不同。

测试 store 时用隔离实例，验证操作、派生值和失败路径；再用组件测试验证用户交互。不要把“action 被调用了”当成业务成功，真正的断言应对应数据是否更新、重复提交是否控制及错误是否展示。
