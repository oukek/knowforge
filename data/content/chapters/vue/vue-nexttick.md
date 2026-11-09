---
{"id":"vue-nexttick","title":"Vue 更新调度与 nextTick：状态、DOM、绘制的三个时刻","moduleId":"vue","prerequisites":["vue-reactivity","js-event-loop"],"sources":["vue","vue-render"]}
---
## 为什么加了数字却读到旧 DOM
修改 ref 后，内存里的值可以立即变化，但 Vue 通常把相关 DOM 更新放进调度队列，同一轮多次变化可以合并处理。这样 `count++` 连续执行三次不必把同一段文本改三次。nextTick 等待的是这批 Vue DOM 更新，不是等待整个浏览器和所有网络工作完成。

因此至少要区分：数据已改变、Vue 已提交 DOM、浏览器已布局绘制。混成一个“更新了”会让滚动定位、测量尺寸和 loading 显示出现难理解的时序错误。
## 为什么状态和DOM可能暂时不是同一版本

修改ref会立即改变读取到的状态值，但Vue通常把组件更新放入调度队列。这样同一段同步代码中连续修改多个字段时，不必每改一次就重算整棵组件树。当前调用栈尚未结束时，读取状态可能是新值，读取DOM却仍是上一次提交的结果，这不是数据丢失，而是两个阶段尚未对齐。

nextTick让调用方等待Vue当前已安排的DOM更新完成。常见用途是显示输入框后聚焦、展开内容后测量、列表加入一项后滚动到目标。顺序应是先改变状态，再await nextTick，再读取相应DOM；在改变状态之前调用并不能预知未来所有更新。

## 更新完成、布局完成与屏幕显示不能混称

nextTick不等待图片下载、字体加载、CSS过渡结束或远端请求，也不保证用户已看见浏览器绘制的新帧。读取offsetHeight等几何值可能促使浏览器计算布局，但这又是浏览器阶段。需要等待过渡完成时应使用对应事件或框架过渡钩子，需要知道图片尺寸则等待图片相关状态。

post时机的watch适合当指定状态变化后需要读取所属组件更新后的DOM；nextTick适合在一段明确动作之后继续。不要为了“保险”连续await多次nextTick，也不要加固定setTimeout猜测页面准备好了，这会掩盖真正依赖。

如果聚焦失败，先检查条件分支是否真的渲染、引用是否指向当前实例、目标是否被禁用或位于尚未打开的弹层。理解具体依赖比增加等待时长更可靠。多层异步流程应分别等待其真实完成信号。

## 在实际组件里测量差异
```html
<script setup>
import { ref, nextTick } from 'vue';
const count = ref(0);
const label = ref(null);
async function increase() {
  count.value++;
  console.log('状态', count.value);
  console.log('更新前 DOM', label.value.textContent);
  await nextTick();
  console.log('更新后 DOM', label.value.textContent);
}
</script>
<template>
  <p ref="label">{{ count }}</p>
  <button @click="increase">观察更新</button>
</template>
```
模板 ref 在组件挂载后才指向真实元素。点击按钮时可以对照两次 textContent；如果在 setup 顶层直接读取 label.value，它可能仍为 null。nextTick 不能替一个尚未挂载的组件创建节点，条件渲染也会让引用出现和消失。
## 调度解决重复工作，不保证任何任务都会结束
```flow
一批组件更新
连续修改响应式状态｜内存值立即反映修改
相关组件任务进入队列｜同一组件更新可以去重
调度队列被处理｜按框架规则执行更新
nextTick 后续继续｜此次等待对应的 DOM 更新已完成
浏览器选择渲染机会｜布局、绘制和显示仍属于浏览器
```
nextTick 不等待图片下载、字体加载、接口返回或 CSS 动画结束。这些对象分别需要 load、字体 API、请求 Promise 或动画结束事件。把所有问题都改成 setTimeout 100ms 只是隐藏竞争，慢设备仍会失败。
## 用在滚动与测量时注意什么
向聊天列表追加消息后，可以先等待 nextTick，再测量新内容并按业务决定是否滚到底部。但用户正在阅读旧消息时，不应强制打断位置。图片稍后加载还可能再次改变高度，需要预留比例或观察尺寸变化。

如果刚写入尺寸就同步读取布局属性，nextTick 也不会消除浏览器强制布局成本；它解决的是 Vue 更新完成的时机。需要让动画的两种样式在不同帧生效时，还要理解 requestAnimationFrame 的作用，不能把二者互换。工程代码最好让等待条件对应真实完成信号，并在组件卸载时取消后续工作。
