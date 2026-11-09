---
{"id":"vue-computed-watch","title":"computed、watch 与 watchEffect：派生值和副作用如何分工","moduleId":"vue","prerequisites":["vue-reactivity"],"sources":["vue","vue-render"]}
---
## 先区分“算一个值”和“做一件事”
购物车总价由条目价格和数量算出，它是派生值；总价变化后把草稿保存到存储，是副作用。computed 表达派生值，watch/watchEffect 适合需要在变化后执行的动作。把所有东西都写成 watch，再用另一个 ref 保存总价，会制造额外状态与同步责任。

computed 会追踪 getter 使用的响应式依赖，依赖未变化时可以复用计算结果。它不是在每次任意组件更新时都重算，也不应在 getter 里发请求、写状态或操作 DOM，否则读取一个值会产生难预测的效果。
## 用购物车明确数据源与派生值

条目单价和数量是输入，总价是根据输入得出的结果。若同时保存quantity和total，并在多个事件里手动同步，漏掉一个更新路径就会不一致。computed把“总价如何计算”保存为关系，而不是保存另一份需要人工维护的事实。其getter应返回结果，读取它不应改变其它状态。

computed缓存依赖的是响应式读取。`computed(() => Date.now())`没有会触发失效的响应式来源，不会因为时间过去自动更新；需要计时器主动更新一个ref，再由computed推导显示。缓存也不是跨用户或跨请求的业务缓存，它只在当前响应式关系中复用计算结果。

## watch关注变化过程，watchEffect关注同步依赖

watch先指定来源，例如ref、getter或多个来源，再在变化时执行回调，可以清楚看见新旧值。是否立即执行由immediate等选项决定。watchEffect会先运行一次，在同步执行期间收集读到的依赖，适合依赖自然由代码表达的同步过程。异步等待之后才读取的值，不应假设能作为同一轮自动收集依赖。

旧值也不是自动深拷贝。深层对象原地修改时，回调两边可能指向同一个代理，无法仅靠两个参数恢复修改前完整内容。若业务确实需要差异历史，应按业务字段维护快照或操作记录，而不是给所有大对象开启deep期待免费追踪。

副作用可能创建请求、计时器或订阅，所以必须设计清理。监听来源变了，旧请求即使最后成功，也不一定仍属于当前界面；取消和有效性标记分别帮助停止等待与拒绝过期结果。需要观察更新后的DOM时再选择post时机，不把所有watch都设成同步以“解决延迟”。

## 派生值如何保持单一来源
```html
<script setup>
import { ref, computed } from 'vue';
const price = ref(20);
const quantity = ref(2);
const total = computed(() => price.value * quantity.value);
</script>
<template>
  <input v-model.number="quantity" type="number" min="0">
  <p>总价：{{ total }}</p>
</template>
```
quantity 是输入状态，total 不需要用户单独修改。若价格依赖币种或折扣，继续在纯计算中表达规则，并处理数值校验与金额单位。computed 缓存的是计算关系，不是服务端价格永远有效的保证。
## watch 的来源和清理
watch 明确指定监听来源，因此可以观察 getter、ref 或多个来源，并访问新旧值。侦听代理属性通常写 `watch(() => state.query, ...)`，直接传普通字符串已经丢失响应式访问。深度监听还会遍历对象，且嵌套修改时新旧参数可能仍是同一个对象，不能假设自动得到两份完整快照。
```javascript
import { ref, watch } from 'vue';
const query = ref('');
const results = ref([]);
watch(query, async (value, previous, onCleanup) => {
  const controller = new AbortController();
  let current = true;
  onCleanup(() => { current=false; controller.abort(); });
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (current) results.value = data.items;
  } catch (error) {
    if (!controller.signal.aborted && current) console.error(error);
  }
});
```
下一次回调开始或监听停止时清理旧工作，避免旧结果覆盖新搜索。例子需要真实 API，并应补充结果 schema、loading 与用户可见错误。异步函数不能因使用 watch 就自动免除竞态。
## watchEffect 与时机选择
watchEffect 在同步执行时自动收集读取的依赖，适合依赖不复杂的副作用；异步回调里第一个 await 之后才读取的状态，不能假设仍被自动收集。watch 的依赖显式，重构后较容易判断什么变化会触发请求。

默认侦听时机不等于 DOM 已完成本组件更新；需要读取更新后 DOM 时根据目标使用 post flush 或 nextTick。同步 flush 则可能在一连串修改里重复执行，适用于明确需要同步观察的少数场景。
```flow
选择 API
只需要由状态推导结果｜优先 computed
需要明确观察某些来源并执行动作｜使用 watch
副作用的同步读取自然就是依赖｜考虑 watchEffect
涉及请求、订阅或计时器｜同时设计清理、取消和过期结果处理
```
