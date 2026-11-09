---
{"id":"react-suspense","title":"React Suspense、Transition 与异步界面","moduleId":"react","prerequisites":["react-fiber","react-hooks"],"sources":["react"]}
---
## 异步界面有两类等待
代码还没下载、数据还没准备好、用户输入触发了昂贵视图更新，都会让界面等待，但并不由同一 API 解决。Suspense 提供已支持挂起机制的子树等待边界，Transition 标记某些更新可以作为非紧急工作处理。它们不是给任意 Promise 自动附上 loading。

在普通 Effect 里 fetch 数据不会仅因为外面包了 Suspense 就自动挂起。需要框架或相应数据源支持的集成。学习时先知道数据从哪里来、谁负责缓存与错误，再选择等待边界，避免把加载状态隐藏在魔法里。
## Suspense边界描述等待时显示什么

Suspense允许支持该机制的子树在尚不能完成渲染时显示fallback，例如lazy加载组件代码或框架提供的可挂起数据读取。它不是包住任意useEffect请求就自动接管loading；普通Effect在提交后发起请求，本身不一定触发Suspense协议。具体数据接入方式应按所用框架文档选择。

边界放在哪里决定哪些内容一起等待。把整个应用包成一个大边界，可能因小区域加载让全部内容退回占位；把每个字都拆成边界则会割裂体验。按用户可理解的区域组织，例如保留页面布局，让课程详情与推荐区各自加载。

## Transition表达更新优先级，不提供额外线程

输入框文字属于紧急反馈，昂贵列表切换可以标记为非紧急更新，让React有机会优先响应输入。useTransition提供启动这类更新与pending状态的方式，useDeferredValue可延后采用某个值。它们不减少业务计算本身，也不把同步CPU工作自动移动到Worker。

Suspense等待与错误处理不同。加载失败应由合适错误边界或框架机制显示可恢复错误，不能让fallback永远转圈。重试需要清楚失败对象、缓存与恢复操作；一个已经拒绝的加载Promise未必因重渲染就自然变成功。

验证时使用可控慢加载观察已有内容是否保留、焦点是否稳定、用户是否知道仍在处理中。性能目标是交互及时且状态明确，不是让所有请求看起来都没有loading。

## 使用 lazy 加载组件
```jsx
import { lazy,Suspense,useState,useTransition } from 'react';
const Report = lazy(()=>import('./Report.jsx'));
export default function App() {
  const [show,setShow]=useState(false);
  const [pending,startTransition]=useTransition();
  return <>
    <button onClick={()=>startTransition(()=>setShow(true))}>查看报告</button>
    {pending && <p role="status">正在切换…</p>}
    <Suspense fallback={<p>报告加载中…</p>}>
      {show && <Report />}
    </Suspense>
  </>;
}
```
Report.jsx 必须导出组件。lazy 处理组件模块加载，错误仍需要错误边界。边界放在哪一层决定等待时替换哪个区域；把全站都包进一个 fallback 可能使一个小区域加载就让整页消失。
## 输入与非紧急视图分开
输入框的值应及时反映用户输入；过滤后的复杂视图可以采用合适的延后更新策略。Transition 不会让任意同步 JavaScript 算法在后台线程执行，也不是网络请求的速率限制。请求数量控制仍需要防抖、取消和服务端限制。
```flow
渐进交付一部分界面
用户交互｜紧急输入及时更新
非紧急更新｜允许安排不同优先级
等待边界｜保留合适内容或展示局部 fallback
内容准备好｜提交新视图
失败｜由错误处理与重试策略负责
```
## 失败与重试同样是产品状态
区分网络失败、模块加载失败、没有数据和权限不足。重试可能重新发请求，需要避免重复副作用；组件代码 chunk 更新后旧页面失效，也需要清晰恢复入口。等待动画不能掩盖永远不结束的任务，应有可诊断状态和取消能力。

测试快慢两种响应、连续切换、组件卸载和错误。只在本地缓存命中时看不到 fallback，不代表线上体验正常；真实边界设计应让用户知道哪一部分正在准备，以及已完成内容是否仍可使用。
