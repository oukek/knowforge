---
{"id":"vue-components","title":"Vue 组件通信：props、emit、插槽与依赖注入","moduleId":"vue","prerequisites":["vue-template"],"sources":["vue","vue-render"],"new":true,"order":-8,"logs":["true"],"runtime":"model","example":"let selected=false;\nconst onChoose=()=>{selected=!selected;};\nonChoose();\nconsole.log(selected);","exampleDescription":"演示状态所有者处理选择事件，实际 props/emit 在正文组件中使用。"}
---
## 先定义数据由谁负责
组件通信不是找一种 API 把数据传过去，而是明确谁拥有数据、谁有权修改、怎样通知变化。props 是父组件给子组件的输入，emit 是子组件发出的事件。子组件直接修改父亲传来的对象内部字段虽然在某些情况下可见，却会隐藏修改来源，让多个地方的更新难以追踪。

例如父组件保存选中的课程 ID，子组件只展示按钮。子组件通知“用户选择了哪项”，由父组件决定是否接受、是否保存到后端。这个方向让校验、权限和业务规则有明确归属。
## props是输入，emit是意图，状态有唯一拥有者

父组件把selected作为prop传入，表示当前事实；子组件发choose事件，表示用户希望做什么。父组件可以接受、拒绝或异步确认这个意图，再把新的事实向下传。这个方向适合需要校验和后端保存的编辑场景，也避免子组件直接改共享对象让调用方不知道变化从哪里发生。

props校验帮助开发时发现类型问题，但不是安全验证。对象和数组prop内部仍可能是共享引用，子组件能改到内部字段不代表应这么做。编辑草稿可在子组件建立明确局部副本，确认后emit新的值；同时要定义父数据在编辑期间更新时如何处理冲突。

## 插槽和组件v-model各解决哪种可定制需求

调用方只需要传一个标题字符串，用prop最直接；需要传标题区的一段自定义结构，用具名slot。作用域插槽由子组件提供数据，调用方在自己的模板作用域决定显示方式，不意味着获得修改子组件内部状态的权限。插槽内容引用哪些变量，要根据它定义的位置理解作用域。

组件v-model可以看成一个值prop加对应更新事件的约定。父组件仍拥有源状态，子组件报告新值；它不是两边直接共用任意变量。多个编辑字段可以有不同的model名称，但公开接口越多，越要避免把内部实现细节全部暴露出去。

跨层provide/inject适合主题、表单上下文或明确服务能力，提供只读状态与命名操作有助于限定修改入口。大量无规则注入也会让依赖难发现，因此公共组件应文档化所需上下文，测试在缺失提供者时的行为。

## 写一个完整的受控组件
```html
<!-- CourseChoice.vue -->
<script setup>
defineProps({ title:String, selected:Boolean });
const emit = defineEmits(['choose']);
</script>
<template>
  <button :aria-pressed="selected" @click="emit('choose')">
    <slot>{{ title }}</slot>
  </button>
</template>
```
```html
<!-- 父组件 -->
<script setup>
import { ref } from 'vue';
import CourseChoice from './CourseChoice.vue';
const selected = ref(false);
</script>
<template>
  <CourseChoice title="响应式系统" :selected="selected"
                @choose="selected = !selected" />
</template>
```
按钮事件不能自动穿透所有组件层级。每层需要定义清楚哪些事件是公开契约；事件名和负载也应可预测，而不是让调用者猜组件内部结构。
## 插槽把内容结构交给调用方
props 适合数据参数，slot 适合可定制的界面片段。默认插槽可以替换上例按钮文字；具名插槽可分开标题、主体和操作；作用域插槽让子组件提供数据，父组件决定如何显示。插槽不是任意跨层修改子组件状态的入口。
```flow
组件契约的方向
父组件拥有状态｜给子组件传 props
子组件显示与交互｜不直接接管父状态
子组件 emit｜报告选择或编辑意图
父组件处理事件｜校验、更新，新的 props 再向下传
```
## provide/inject 与共享状态何时适合
层级很深时，逐层传递主题、表单上下文或稳定服务接口会繁琐，可以由祖先 provide，再由后代 inject。建议用 Symbol key 避免冲突，并明确默认值和缺失时的行为。若提供的是响应式对象，修改权限仍需设计，可暴露只读状态与操作函数。

业务状态被许多互不相邻页面共同使用时，再考虑 Pinia 等状态容器。全局不意味着更高级：全局生命周期更长，测试与 SSR 隔离要求也更高。组件的公开输入、输出与插槽越明确，内部重构就越不容易破坏调用方。
