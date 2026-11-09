---
{"id":"vue-composables","title":"Vue Composable：复用有状态逻辑与副作用清理","moduleId":"vue","prerequisites":["vue-keepalive"],"sources":["vue","vue-render"],"new":true,"order":7,"logs":["1","0"],"runtime":"model","example":"const subscriptions=new Set();\nconst stop=()=>subscriptions.delete('resize');\nsubscriptions.add('resize'); console.log(subscriptions.size);\nstop(); console.log(subscriptions.size);","exampleDescription":"用集合演示订阅的注册与清理；真实 Vue 生命周期和浏览器事件见正文。"}
---
## 为什么抽函数还不够
普通工具函数接收参数并返回结果，通常没有自己的持续生命周期。鼠标位置、请求加载状态或订阅连接却会持续变化，还需要在组件结束时清理。Composable 是按约定组织这种响应式逻辑的函数，通常命名为 useX；它复用的是状态与行为，不是一段模板。

每次调用函数是否创建新状态非常关键。把 ref 写在函数里面，通常各调用者获得独立状态；放在模块顶层则可能共享。共享可能是有意的，但 SSR 与多实例测试中必须明确隔离，不能只是为了少写一行代码。
## 组合式函数复用的是带状态的逻辑

普通工具函数通常接收输入并返回计算值；组合式函数可以建立ref、computed、watch和生命周期钩子，把一组相关状态与行为封装给组件使用。例如搜索逻辑同时涉及query、loading、results、error与取消函数，放在一个useSearch里能使这些生命周期一起管理。

函数名useX是约定，不是编译魔法。每次调用若在函数体里创建ref，通常得到独立状态；若把ref放在模块顶层，所有调用者就会共享同一份状态。两者都可能有用途，但必须有意识选择，尤其SSR时模块级用户数据可能跨请求泄漏。

## 输入响应式与返回结构应保持契约稳定

组合式函数接受ref或getter时，需要在受追踪的执行上下文中读取，才能对变化作出反应。只在函数开始取一次.value保存成普通值，就得到快照，后续不会自动重新读取。输入究竟接受普通值、ref还是getter，应在函数契约里明确，不让调用方猜测。

返回对象常包含多个ref，调用方解构后仍能使用各自响应式值；若直接返回reactive对象又让调用方普通解构其中原始值，就可能丢失访问关系。状态、动作和资源清理应一并考虑，例如订阅建立后由作用域退出清理，显式开始的独立任务还可提供stop接口。

测试可以把纯转换规则拆成普通函数，独立验证输入输出；涉及onMounted、watch清理或组件作用域的部分，则需要真实组件挂载测试。组合式函数不是为了减少文件行数，而是让某一职责的依赖与生命周期能被完整理解。

## 一个可用的事件订阅封装
```javascript
// useWindowWidth.js，在 Vue 组件 setup 中调用。
import { ref, onMounted, onUnmounted } from 'vue';
export function useWindowWidth() {
  const width = ref(null);
  const update = () => { width.value=window.innerWidth; };
  onMounted(() => { update(); window.addEventListener('resize',update); });
  onUnmounted(() => { window.removeEventListener('resize',update); });
  return { width };
}
```
把 window 的访问放在挂载阶段，服务端渲染时不会直接访问不存在的浏览器对象。返回 ref 让使用者解构后仍能跟踪变化。宽度为 null 表示尚未在客户端测量，模板应该设计初始显示，而不是假装服务端知道真实视口。
## 参数、返回值和资源责任
接受响应式输入时，应约定参数是普通值、ref 还是 getter，避免调用者传入当时快照。返回只读值还是可写 ref 也要明确：有业务约束的状态最好通过操作函数修改。请求 composable 需要暴露 loading、error、data、refresh/cancel 等合理接口，而不是只返回一份可能永久为空的数据。
```flow
Composable 的生命周期
组件 setup 调用｜创建本实例状态
挂载或输入变化｜开始订阅或请求
事件或响应到达｜更新响应式结果
输入变化或卸载｜清理旧工作，拒绝过期结果
```
## 测试和复用边界
先测试输入变化是否引发正确结果，再验证卸载后监听器被移除、重复调用不会共享意外状态。涉及生命周期的封装需要在挂载组件或合适测试上下文中验证，直接调用函数不一定覆盖钩子的实际行为。

Composable 不应成为“整个业务塞进一个 useEverything”的隐藏组件。按稳定职责拆分，把纯计算留成普通函数，让副作用入口少且明确。它与混入的差别之一是依赖与返回值在调用位置可见，仍然需要良好命名和清楚的状态所有权。
