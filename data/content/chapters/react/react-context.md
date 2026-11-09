---
{"id":"react-context","title":"React 状态提升、Reducer 与 Context：共享而不混乱","moduleId":"react","prerequisites":["react-state"],"sources":["react"],"new":true,"order":5,"logs":["0"],"example":"const remove=n=>Math.max(0,n-1);\nconsole.log(remove(0));","exampleDescription":"验证 reducer 中的纯规则；Context 通知与组件状态在正文 React 项目中体验。"}
---
## 两个组件如何看到同一份数据
两个筛选控件要共同影响列表，最直接的方法是把状态移到它们最近的共同父组件，再用 props 与回调传递。称为状态提升，是因为数据的拥有者变成了更上层组件。不要让两个子组件各存一份再用 Effect 互相同步，这会产生循环、竞态和谁覆盖谁的问题。

Context 解决跨层传递通道，Reducer 解决状态如何按动作演进。二者可以组合，但不是一个功能，也不天然等于服务器缓存。一个简单计数器不必为了模式完整就建立全局 Provider。
## Context解决深层传递，Reducer描述状态转移

Context让后代组件读取某个祖先提供的值，减少中间组件只为传递而接收props。它本身不规定状态怎样存储或修改，提供者可以使用useState、useReducer或外部store。useReducer则把“当前状态+动作→下一状态”的规则集中到纯函数，适合多个动作共同维护一组状态。

动作应表达业务意图，例如itemAdded、submissionFailed，而不是让任意组件直接覆写整份状态。reducer不发网络请求、不读取不可控当前时间，也不修改旧状态；外部工作完成后再dispatch相应结果。这样状态转移可以独立测试，非法组合也更容易发现。

## 提供者范围决定谁共享状态

两个不同Provider拥有的值可以不同，同一组件读取最近的匹配Provider。把Provider放到应用最顶层会延长状态生命周期，也可能扩大更新范围；只属于一个编辑流程的状态可以把提供者放到该流程内。共享不是默认目标，应该由协作需求决定。

Provider的value引用变化会使相关消费者重新读取，普通memo不能把必要的Context更新当成无关props忽略。把状态和动作拆成合适上下文，稳定必要引用，或使用适合细粒度订阅的外部store，都是基于实际性能证据的选择。

服务器数据缓存与本地交互状态也不同：前者涉及请求去重、过期、失效和刷新。Context能传递缓存客户端，但不会自动实现这些能力。遇到页面切换显示旧数据时，先确认身份、缓存键和失效规则，而不是只调整Provider位置。

## 用 reducer 表达有约束的变化
```jsx
import { useReducer } from 'react';
function reducer(state,action) {
  switch(action.type) {
    case 'add': return {...state,count:state.count+1};
    case 'remove': return {...state,count:Math.max(0,state.count-1)};
    default: throw new Error('未知动作');
  }
}
export default function CartCount() {
  const [state,dispatch]=useReducer(reducer,{count:0});
  return <button onClick={()=>dispatch({type:'add'})}>{state.count}</button>;
}
```
Reducer 接收旧状态与动作，返回新状态，应保持纯净。请求、日志上报等副作用不要混进去。动作描述业务意图比“设置任意字段”更容易校验，例如提交、成功、失败应有明确允许的转移。
## Context 的消费者为何会更新
Provider 提供 value，后代读取对应 Context。当 value 的身份或内容按 React 的比较规则被判定变化时，相关消费者会受到通知。每次渲染都构造新的对象可能扩大更新范围；但过早加入一堆 memo 也会增加复杂度，先按状态变化频率和消费者范围拆分上下文。
```flow
共享状态的责任
共同拥有者或 Provider｜保存一份真实状态
子组件读取 props 或 Context｜得到本次渲染快照
交互 dispatch 或回调｜报告明确动作
Reducer 或拥有者｜验证并计算新状态
相关消费者重新渲染｜展示一致结果
```
## 服务端状态与本地交互状态分开
接口数据需要缓存键、有效期、重试、去重和失效，不等于放进 Context 就完成同步。切换用户时要清理旧缓存，筛选条件应进入查询键。表单草稿可能需要保留本地编辑，不能每次后台刷新就覆盖。

测试 reducer 的合法和非法动作，测试多个消费者观察一致状态，再测试身份切换与 Provider 卸载。共享范围越大，生命周期与授权范围越要清晰；浏览器上的共享状态仍不能代替服务端权限检查。
