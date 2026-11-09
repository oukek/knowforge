---
{"id":"react-hooks","title":"React Hooks 与 Effect：副作用、依赖、闭包与清理","moduleId":"react","prerequisites":["react-state","js-closure"],"sources":["react"]}
---
## Hook 为什么不能放进条件分支
Hook 让函数组件使用 React 管理的状态和生命周期能力。普通 useState、useEffect 等要求在组件或自定义 Hook 顶层稳定调用，不能随着 if/循环改变调用次序。React 需要把同一个组件的各次渲染与对应 Hook 状态关联，任意改变结构会破坏这种关系。特殊 API 的规则需按文档理解，不应凭名字一概推断。

useEffect 用于将组件与外部系统同步，例如事件监听、连接或计时器。它不是“所有状态变化都应该放在这里处理”的容器。由状态可以纯计算得到的值直接计算；用户点击触发的特定业务动作通常放事件处理器，避免重新挂载时意外重复发送。
## 把事件、派生计算与外部同步分开

用户点击购买是一次具体动作，通常在事件处理器发起；根据购物车计算总价是纯计算，直接计算或按需要memo；连接聊天频道则需要在频道变化时建立新连接、撤销旧连接，适合Effect。把三者都放进Effect会导致事件被重放、派生状态滞后和依赖难管理。

Effect在提交后参与与外部系统同步，而不是在render中执行。它读取的是建立这次Effect的渲染快照，依赖变化后React安排清理旧同步再建立新同步。空依赖数组表示该Effect没有依赖会随渲染变化的值，不是给代码贴上“永远只跑一次”的许可证，开发检查和重新挂载仍可发生。

## 闭包与依赖数组应表达同一份事实

若Effect读取roomId，却遗漏依赖，用户切到新房间时可能仍连接旧房间。若每次渲染创建options对象并作为依赖，即使字段相同，引用也不同，可能不断重连。应把对象构造移动到Effect内、提取稳定基本依赖，或重新划分职责，而不是删除依赖让检查器安静。

useRef保存跨渲染的可变容器，修改current不会触发重渲染。它适合DOM句柄和不用于显示的运行信息，不适合把界面状态全藏进去绕过更新。需要同步测量布局的少数场景可考虑useLayoutEffect，但它可能阻塞浏览器绘制，不应作为所有Effect的默认替代。

清理必须与建立对称：同一事件函数注册后用同一引用移除，旧请求失效后不再提交结果。异步回调内部再定义async函数，Effect本身返回清理函数；取消只是停止等待的一部分，写入远端的副作用仍需幂等协议。

## 正确表达订阅的建立与撤销
```jsx
import { useEffect,useState } from 'react';
export default function Width() {
  const [width,setWidth]=useState(null);
  useEffect(()=>{
    const update=()=>setWidth(window.innerWidth);
    update();
    window.addEventListener('resize',update);
    return ()=>window.removeEventListener('resize',update);
  },[]);
  return <p>{width===null?'等待测量':width}</p>;
}
```
Effect 返回的函数用于清理。依赖变化时，先清理上一份同步，再建立新同步；卸载时也要清理。开发 Strict Mode 的额外检查可能重复建立/清理，目的是暴露生命周期不对称，不应靠一个全局“只运行一次”变量掩盖泄漏。
## 依赖数组描述使用了哪些响应式输入
Effect 中读取组件的 props、state 或本次创建的函数对象，都要正确考虑依赖。遗漏依赖可能继续使用旧闭包；随意加对象又可能每次重新同步。正确做法是调整职责、把纯计算移出 Effect、在合适作用域创建对象，而不是关掉规则强行使用空数组。
```flow
Effect 的同步周期
组件提交｜本次 props/state 已确定
比较依赖｜判断是否需要重新同步
清理旧 Effect｜停止旧订阅、取消等待或忽略结果
建立新 Effect｜连接当前输入对应的外部系统
卸载｜执行最终清理
```
## 异步请求需要过期结果保护
Effect 回调本身不应直接声明 async，因为返回值应该是清理函数或无值，而 async 返回 Promise。内部定义异步函数，再设置 AbortController 和有效标记。输入从A改为B后，A的慢响应不能覆盖B；取消网络等待也不能撤回已执行的服务端写入。

useRef 可存不触发渲染的可变信息或 DOM 引用，但不要用它绕过正常依赖更新。每个 Effect 聚焦一个同步过程，状态推导、事件动作和外部同步分清之后，闭包与依赖问题才容易解释和测试。
