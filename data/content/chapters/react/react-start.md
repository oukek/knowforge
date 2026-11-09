---
{"id":"react-start","title":"React 入门：函数组件、JSX、props 与事件","moduleId":"react","prerequisites":[],"sources":["react"],"new":true,"order":-10,"logs":["课程：React"],"runtime":"model","example":"const label=({title})=>`课程：${title}`;\nconsole.log(label({title:'React'}));","exampleDescription":"展示组件输入与输出的关系，不执行 JSX，也不模拟 React 调度。"}
---
## React 的组件是一段描述界面的计算
React 组件通常是 JavaScript 函数，接收 props，返回对界面的描述。组件可以嵌套，组合成页面。它并不是调用一次就创建一个永不变化的 DOM 对象；状态变化后 React 可能重新调用函数，计算新的界面。组件名用大写，让 JSX 区分自定义组件与原生 HTML 标签。

JSX 是 JavaScript 的语法扩展，需要工具编译。花括号里写表达式，className 表达 CSS class，事件属性接收函数。不要把 JSX 当模板字符串，也不要在浏览器控制台直接粘贴未编译 JSX 期待原生执行。下面示例可放到使用 React 的 Vite 项目 src/App.jsx。
## JSX中哪些是JavaScript，哪些是界面描述

JSX中的小写标签如div表示宿主元素，大写Counter表示组件。花括号内放表达式，例如`{count + 1}`；它不是任意语句块，不能直接塞一个for声明。列表通常先用map生成元素数组，条件可以用条件表达式或在返回前分支。组件返回多个同级节点时，可以用Fragment组织而不增加多余DOM。

props是传给组件的输入对象，字符串属性可以直接写，动态值放花括号。`onClick={handleClick}`传入函数，`onClick={handleClick()}`立即调用并把返回值作为属性，语义完全不同。渲染期间应计算描述，用户触发动作后才执行对应业务。

## 组件身份与状态保存在哪里

函数组件每次执行会重新建立普通局部变量，React保存的state则按组件在树中的身份关联。页面放两个相同Counter组件，通常各有自己的状态；它们不是因为使用同一个函数定义就共享一份count。组件被移除或key改变时，状态可能重置。

useState返回当前渲染的状态快照与更新函数。更新函数请求下一次渲染，不会把已经运行中的局部count变量改成新值。先理解这个机制，再学习事件里的连续更新与闭包，能避免把React状态当成任意可变对象。

React并不要求所有逻辑都写Hook。纯格式化、校验与计算可以是普通函数；只有依赖组件状态和生命周期的复用逻辑才需要自定义Hook。界面结构、业务规则和外部同步各自保持清楚边界，组件才容易阅读。

## 建立最小页面
```bash
npm create vite@latest react-course -- --template react
cd react-course
npm install
npm run dev
```
```jsx
import { useState } from 'react';
function Counter({ title }) {
  const [count,setCount]=useState(0);
  return <section>
    <h2>{title}</h2>
    <p>点击 {count} 次</p>
    <button onClick={()=>setCount(n=>n+1)}>加一</button>
  </section>;
}
export default function App() {
  return <main><Counter title="第一个组件" /></main>;
}
```
props 是父组件输入，子组件不要修改它。useState 提供当前这次渲染的状态和提交更新的函数。onClick 传的是函数，若写成 onClick={setCount(...)}，就会在渲染过程中调用，可能引发连续更新。事件处理与渲染计算要分开。
## 声明式与直接操作 DOM 的关系
点击时提交状态更新，React 重新计算应显示的文字，再在提交阶段改动 DOM。不要在渲染函数中手动 document.querySelector 改同一个区域，否则两套状态可能互相覆盖。需要聚焦输入或集成第三方控件时可使用 ref，在合适阶段操作，但这不应该成为普通数据展示的默认方式。
```flow
一次组件交互
父组件传入 props｜提供本次输入
组件读取 props 和 state｜返回 JSX 描述
用户触发事件｜调用事件处理函数
提交状态更新｜请求 React 再次计算
提交 DOM 变更｜浏览器随后处理视觉更新
```
## 如何拆组件与继续学习
按独立职责拆分，例如课程卡片、筛选栏和分页器。组件不是越碎越好；需要共同变化的数据放到共同拥有者，纯展示组件通过 props 接收。先能写清从输入到界面的关系，再学习 Effect、Context 与性能优化，否则容易用全局状态修补本可直接表达的数据流。

课内普通 JS 实验只展示函数根据输入构造文字；完整 JSX 请在 React 项目里运行。改变初始值、传入不同 title、渲染两个 Counter，观察每个实例的状态独立性。
