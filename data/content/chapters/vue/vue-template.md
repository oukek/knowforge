---
{"id":"vue-template","title":"Vue 模板：绑定、条件、列表与 key","moduleId":"vue","prerequisites":["vue-start"],"sources":["vue","vue-render"],"new":true,"order":-9,"logs":["b,c"],"runtime":"model","example":"const rows=[{id:'a'},{id:'b'},{id:'c'}];\nconsole.log(rows.filter(x=>x.id!=='a').map(x=>x.id).join(','));","exampleDescription":"只演示稳定数据 ID；模板复用行为需要在 Vue 页面中观察。"}
---
## 模板是界面规则，不是字符串拼接
模板表达的是当前状态下应该出现哪些元素、属性和文本。双花括号用于文本插值；v-bind（简写冒号）让属性取 JavaScript 表达式的值；v-on（简写 @）注册事件。模板可以调用简单表达式，但复杂规则应放进脚本或 computed，否则展示结构与业务推理混在一起。

插值默认按文本显示。不要为了显示用户输入而使用 v-html；后者把内容解释为 HTML，须按富文本安全策略清洗。把服务端返回值放进模板也不自动解决 URL 协议、权限和数据结构校验。
## 文本、属性与事件对应三条数据通道

插值把值转为文本显示，属性绑定把值交给具体DOM属性或组件prop，事件绑定接收用户动作。比如`<button :disabled="saving" @click="save">保存</button>`同时表达了“saving决定是否可点”和“点击触发save”。把saving字符串直接写进disabled属性，与绑定布尔值不是一回事。

v-model是表单值与更新事件的便捷契约，文本输入、复选框和选择控件各有对应规则；组件上的v-model则需要组件实现约定的prop与更新事件。它不是任意对象之间自动同步的通道。number、trim等修饰符也不能替代完整业务校验，例如数字输入仍要限制合法范围和处理空值。

## 模板表达式应该保持容易推导

模板可以访问本组件公开给模板的绑定并执行表达式，但不要把请求、修改状态或复杂循环放进插值。渲染可能重复发生，读取一个展示值不应顺便触发写入。复杂过滤、排序、金额规则可以在computed或独立函数中表达，并通过清楚名称被模板引用。

class绑定可以接字符串、数组或对象：对象键是类名，值决定是否加入。例如`:class="{ selected: active }"`把视觉状态明确关联到布尔状态。style绑定适合确实随数据计算的样式值，但主题和重复样式通常仍放CSS更易管理。

条件和列表还影响组件生命周期。v-if从无到有会创建子组件，从有到无会卸载；v-show通常只是隐藏现有DOM。列表key在同级兄弟中标识稳定身份，不需要全球唯一，但应在排序和筛选后仍跟随同一业务实体。界面正确不只是文字对，还包括焦点、输入草稿和内部状态关联到正确对象。

## 条件展示的生命周期不同
v-if 决定子树是否创建，条件为假时子树会卸载；v-show 通常保留元素，只切换 display。频繁切换且需要保留内容的区域可能适合 v-show，昂贵且很少出现的区域可能适合 v-if。隐藏元素不等于停止所有定时器，卸载也需要组件正确清理资源。
```html
<script setup>
import { ref, computed } from 'vue';
const query = ref('');
const rows = ref([{id:'a',name:'Vue'},{id:'b',name:'React'}]);
const visible = computed(() => rows.value.filter(x => x.name.includes(query.value)));
</script>
<template>
  <input v-model="query" aria-label="筛选课程">
  <p v-if="visible.length === 0">没有匹配课程</p>
  <ul v-else>
    <li v-for="item in visible" :key="item.id">{{ item.name }}</li>
  </ul>
</template>
```
列表过滤先在 computed 中完成，避免在同一个元素上混用 v-if 和 v-for 造成优先级与作用域误解。key 应来自稳定身份，而不是当前显示位置。
## key 为什么影响表单和组件状态
假设列表 A、B、C 的每行都有输入框。如果 key 是数组下标，删除 A 后，原先位置0可能被拿去展示 B，组件内部状态或 DOM 状态就容易关联错对象。稳定 key 告诉框架“这一项仍是 B，只是位置变了”。key 不是为了消除控制台警告而随便填的数字。
```flow
列表变更时的身份匹配
数据有稳定 id｜表示业务实体
新旧列表比较 key｜识别复用、移动、删除与创建
复用对应组件实例｜让局部状态跟随实体
更新属性与 DOM｜显示新内容与位置
```
## 指令的适用范围与工程使用
动态 class 适合表达状态，如 `{ active: selected }`；动态 style 适合计算所得的尺寸或颜色，重复样式优先放 CSS。组件上绑定 class、原生事件与属性透传有自己的边界，不能把它与普通 DOM 元素完全等同。

模板应该能清楚看出数据、空状态、错误状态与交互。练习删除列表第一项、倒序和插入一项，再观察输入框是否跟随正确数据。单测“列表长度等于3”不足以证明组件身份处理正确。
