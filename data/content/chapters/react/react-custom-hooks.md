---
{"id":"react-custom-hooks","title":"React 自定义 Hook：复用状态逻辑与订阅契约","moduleId":"react","prerequisites":["react-hooks"],"sources":["react"],"new":true,"order":6,"logs":["0"],"runtime":"model","example":"const listeners=new Set();\nconst callback=()=>{};\nlisteners.add(callback);listeners.delete(callback);\nconsole.log(listeners.size);","exampleDescription":"独立验证注册与清理的对称性；Hook 本身须在 React 组件上下文运行。"}
---
## 自定义 Hook 复用的是逻辑，不是同一份状态
以use开头的函数可以组合其它Hook，抽取订阅、表单或请求逻辑。每次调用通常属于调用组件自己的Hook状态，两个组件调用useCounter不会天然共享同一个count。需要共享时应显式提升状态或提供外部存储，而不是误以为同名Hook等于单例。

Hook必须遵守相应调用规则，并把输入、返回值和副作用生命周期说清。一个返回五十个字段的useEverything可能只是把组件复杂度藏到另一个文件，并没有建立有效边界。
## 自定义Hook共享逻辑，不默认共享状态

useSearch可以封装query、请求状态和取消清理，每个组件调用时各自执行Hook中的useState等，因此通常得到独立状态。把两个组件都改为调用同一个Hook，并不会让它们自然共用同一份搜索结果；需要共享时仍应提升状态、使用Context或外部store。

Hook必须在组件或其它Hook的合适顶层位置稳定调用，不能把普通事件回调里的任意函数改名useX就开始调用useState。普通计算函数无需Hook，只有需要React管理的状态、引用或同步生命周期时才使用。

## API设计要把依赖与清理一起暴露清楚

Hook输入可以是URL、资源ID等稳定业务值，返回data、status、error与必要动作。不要返回大量内部setter让调用方随意组合出不合法状态，也不要隐藏输入变化是否重置草稿、是否重新请求等关键行为。异步请求要关联当前输入，旧响应不得覆盖新结果。

订阅型Hook需要说明何时建立、输入变化时怎样替换、卸载时怎样撤销。useEffect依赖应与真正使用的响应式输入一致；为了让调用方“感觉稳定”而遗漏依赖，会把过期闭包错误藏到复用层。

测试Hook最好通过一个小组件观察用户可见行为，同时把纯解析和转换抽成普通函数独立测试。验证成功、失败、输入快速切换和卸载，特别关注遗留监听与过期响应。封装的价值是让一个完整职责可理解，而不是把复杂性挪到一个看不见的文件。

## 从窗口宽度订阅开始
```jsx
import {useEffect,useState} from 'react';
export function useWindowWidth() {
  const [width,setWidth]=useState(null);
  useEffect(()=>{
    const update=()=>setWidth(window.innerWidth);
    update();
    window.addEventListener('resize',update);
    return ()=>window.removeEventListener('resize',update);
  },[]);
  return width;
}
export default function Example() {
  const width=useWindowWidth();
  return <p>{width===null?'等待测量':width}</p>;
}
```
初始值null避免服务端直接读取window，挂载后才订阅。每次Effect建立都对应清理，所以开发模式额外建立/清理也不会积累监听器。与外部store同步时，还应考虑useSyncExternalStore提供的并发与服务端快照契约，而不是任意拼接订阅。
## 请求 Hook 应暴露什么
数据请求通常需要data、error、status和重新获取入口，还要处理查询键、取消、过期结果及缓存失效。把fetch塞进useEffect只解决了触发，不能称为完整请求系统。库已有成熟缓存与订阅能力时，优先理解其契约再封装业务层。
```flow
Hook 的输入输出
输入参数｜决定订阅或请求的对象
内部状态｜属于当前调用实例
Effect 同步｜建立和清理外部工作
返回值与动作｜让组件清楚知道能读什么、做什么
依赖变化或卸载｜结束旧工作，避免过期结果
```
## 测试复用逻辑
用测试组件或Hook测试工具验证输入变化、重复挂载、卸载清理和失败恢复。纯计算函数单独测，生命周期逻辑在真实Hook上下文测。不要只检查返回对象字段齐全，还要验证时间顺序与资源数量。

返回函数是否需要稳定引用取决于使用者契约，不是每个函数都必须useCallback。依赖完整、状态拥有者清楚、清理对称，比隐藏所有细节更重要。
