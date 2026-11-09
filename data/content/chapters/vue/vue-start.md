---
{"id":"vue-start","title":"Vue 入门：应用、单文件组件与声明式界面","moduleId":"vue","prerequisites":[],"sources":["vue","vue-render"],"new":true,"order":-10,"logs":["已经点击 1 次"],"runtime":"model","example":"let count=0;\nconst render=()=>`已经点击 ${count} 次`;\ncount += 1;\nconsole.log(render());","exampleDescription":"用普通函数表达界面是状态的结果；不模拟 Vue 依赖追踪或 DOM 更新。"}
---
## 先理解 Vue 在页面里负责什么
不用框架时，计数器要手动查找按钮、监听点击、保存数字、再把数字写回 DOM。业务多起来后，一个数据变化可能影响多个地方，手写更新容易漏掉。Vue 让我们声明“界面如何由状态得到”，更新状态后由框架安排对应 DOM 更新。它没有替代 HTML、CSS 和 JavaScript，而是组织它们之间的关系。

组件是有边界的界面单元：它接收输入，保存需要的局部状态，输出一段界面，并通过事件与外界通信。不是每个 div 都要拆组件，也不是一个文件越短就越好。先从职责、复用和变化频率判断边界。
## 单文件组件的三个区域如何配合

script setup定义本组件使用的数据、函数与导入；template描述如何把这些值呈现为界面；style定义外观。它们不是互相独立的三份代码，模板会引用脚本中的绑定，事件又会调用脚本函数改变状态。组件每创建一个实例，setup中的局部状态一般也各自建立，因此页面上两个计数器可以互不影响。

模板里的`{{ count }}`是文本插值，`:disabled="count === 0"`绑定布尔属性，`@click="increment"`把函数注册为事件处理器。冒号后的值按表达式求值，不加冒号的`title="count"`则只是文字count。理解“字面量还是表达式”，能避免大量初学时的数据不更新问题。

## 挂载、更新与卸载建立资源范围

应用启动时createApp接收根组件，mount把组件树连接到宿主DOM。组件初次建立并提交DOM后进入挂载阶段，响应式状态变化触发后续更新，从树中移除则发生卸载。生命周期钩子提供参与这些时点的方式，不是每段业务都必须放进mounted。

如果只是根据输入算一个字符串，直接计算或computed即可；如果需要读取真实DOM尺寸，可在挂载后或更新完成后进行；如果注册了事件监听或计时器，卸载时要清理。把资源归属绑定到创建它的组件，能避免离开页面后仍不断回调。

Vue组件不是普通HTML文件，也不是后端接口。开发工具编译SFC并处理依赖，浏览器执行编译结果。课内JavaScript沙箱能演示函数与状态关系，但没有完整Vue挂载环境，正文的SFC应放入Vue项目验证真实交互。后续课程会分别展开响应式、组件契约和渲染流程。

## 建立能运行的项目
本教程使用 Vue 3 的单文件组件和 Composition API。安装受支持的 Node.js 后，用官方脚手架创建项目；命令会询问项目名和功能选项。先选 JavaScript 和最少功能，理解后再加 TypeScript、Router 与测试。
```bash
npm create vue@latest
# 进入刚创建的目录
npm install
npm run dev
```
开发服务器把 .vue 文件编译成浏览器模块；浏览器不能直接把任意 .vue 源文件当原生 HTML 执行。生产发布使用 npm run build 生成资源。开发环境的热更新是便利能力，不等于生产页面一直依赖开发服务器。
## 写出第一个完整组件
把下列内容放进 src/App.vue。script setup 中的顶层变量可在模板使用，ref 包装需要被追踪的值；脚本读取或修改通过 .value，模板里的顶层 ref 通常自动解包。
```html
<script setup>
import { ref } from 'vue';
const count = ref(0);
function increment() { count.value += 1; }
</script>
<template>
  <main>
    <h1>我的计数器</h1>
    <p>已经点击 {{ count }} 次</p>
    <button @click="increment">加一</button>
  </main>
</template>
<style scoped>
main { max-width: 32rem; margin: 2rem auto; }
</style>
```
模板中的双花括号显示文本，@click 绑定事件。点击后先改变 count，再由 Vue 更新相关 DOM；不需要自行 querySelector 修改段落。scoped 为当前组件的样式添加匹配约束，并不等于 Shadow DOM 的完全封装，仍要了解子组件根节点等规则。
## 从状态到 DOM 的工作过程
```flow
计数器一次更新
点击事件｜调用 increment
修改 ref｜Vue 知道 count 被修改
调度组件更新｜同一批变化可能被合并
执行渲染并比较｜确定需要变更的节点或文本
提交 DOM｜浏览器之后按自己的流程绘制
```
响应式负责知道“谁依赖了这个值”，渲染负责算出界面应该是什么，更新算法负责修改真实 DOM，浏览器负责布局与绘制。把这些阶段分开，后面学习 computed、nextTick 和性能时就有明确位置。
## 组件状态应该放在哪里
这个 count 只影响当前计数器，所以局部保存即可。两个组件需要共享时，先考虑共同父组件，再考虑共享状态库；不必从第一天就把所有值放全局。服务端数据还涉及请求状态、刷新与缓存，不能仅因存在一个 ref 就认为数据同步问题已经解决。

课内机制实验是普通 JavaScript，帮助理解“状态推导显示文本”；真正的组件代码应在上述 Vue 项目运行。练习时把 count 改成购物车数量，再补上最小值和禁用按钮，观察业务规则如何通过状态影响模板。
