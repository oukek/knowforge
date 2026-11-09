---
{"id":"vue-reactivity","title":"Vue 响应式原理：ref、reactive、依赖收集与触发更新","moduleId":"vue","prerequisites":["vue-start","js-prototype"],"sources":["vue","vue-render"]}
---
## 普通变量为什么不会自动更新界面
JavaScript 变量改变后，浏览器不会自动重新运行所有读过它的函数。Vue 需要知道哪个渲染或副作用读取了哪个状态，再在状态变化时重新执行相关工作。响应式系统因此包含两件事：读取时建立依赖关系，写入时通知依赖者。它不是每隔一段时间遍历全部变量找不同。

ref 适合包装一个值，通过 .value 访问；reactive 返回对象的代理，读取和写入经过 Proxy 拦截。Vue 3 对普通对象主要使用代理，而 ref 通过值容器管理追踪。概念上可以把它们理解为“可被观察的访问入口”，不是给原始变量永久附魔。
## 把依赖理解为一次读取建立的关系

“页面依赖count”不是框架根据变量名字猜出来的。响应式副作用执行时会设置当前消费者，读取count经过受控访问入口，系统才知道把这个消费者登记到count对应的依赖里。之后写入count，系统查找有关消费者，通知它们重新计算。没有在那次执行中读取的字段，不应无差别地触发全部工作。

依赖表在概念上需要同时区分对象和属性：两个对象都有name字段，修改用户的name不该自动通知只读取课程name的消费者。教学模型可以只用一个对象，但真实系统还要处理对象键、数组长度、集合增删等不同操作，并避免对象不可达后被依赖表永久保留。

## ref是值容器，代理不是原对象本身

ref把一个值包装成带value访问入口的对象，因此即使包的是数字，也能拦截读取与修改。普通局部变量`let count = 0`没有这样的入口，直接重赋值无法让Vue追踪。reactive适合对象结构，通过Proxy拦截操作；拿到原始对象后绕过代理去改值，不能期待同样的通知行为。

模板对ref有便利解包规则，脚本通常显式使用.value。解包不是所有嵌套位置都无条件发生，例如数组或集合中的ref需要按文档规则访问。先理解JavaScript实际保存的是什么对象，再使用便利语法，能减少“这里为什么要.value，那里为什么不用”的困惑。

响应式通知与DOM更新之间还有调度。连续修改同一状态多次，组件更新可能被去重合并；但普通同步模型的effect可能立即执行。区分这两层后，才能解释为何状态已改变但当前DOM仍旧，以及为什么nextTick等待的是更新队列而非网络请求完成。

## 从一个最小依赖表理解 track 与 trigger
```javascript
let activeEffect;
const dependencies = new Map();
const state = new Proxy({ count:0 }, {
  get(target, key) {
    if (activeEffect) {
      if (!dependencies.has(key)) dependencies.set(key, new Set());
      dependencies.get(key).add(activeEffect);
    }
    return Reflect.get(target, key);
  },
  set(target, key, value) {
    const changed = target[key] !== value;
    const ok = Reflect.set(target, key, value);
    if (changed) for (const fn of dependencies.get(key) ?? []) fn();
    return ok;
  }
});
function effect(fn) {
  const run = () => { activeEffect=run; try { fn(); } finally { activeEffect=undefined; } };
  run();
}
effect(() => console.log(state.count));
state.count = 1;
```
初次执行 effect 时读取 count，getter 将当前函数放入 count 的集合。设置 count 后，setter 找到这份集合并再次调用函数。这段模型输出0和1，展示“依赖在哪里建立”；它没有真实 Vue 的嵌套 effect 栈、分支依赖清理、数组集合处理、递归保护和调度，不应复制成生产响应式库。
## ref、reactive 与解构的区别
```javascript
// 在 Vue 项目中运行。
import { ref, reactive, toRefs } from 'vue';
const count = ref(0);
const state = reactive({ name:'Lin', score:1 });
const { score } = state;          // 普通数值快照
const { name } = toRefs(state);   // 保留属性的响应式访问关系
state.score = 2;
console.log(score);              // 仍为 1
name.value = 'Chen';
console.log(state.name);         // Chen
```
普通数字解构得到的是当时值，之后不会再经过原代理的 getter；toRefs 返回的 ref 则继续指向对象属性。若解构的是对象引用，内层代理可能仍有效，因此不能简单说“解构一律完全失去响应式”。替换整份 reactive 对象引用也需要重新考虑已有依赖，不要把变量重新赋值误当成修改同一个代理。
## 依赖变化与调度为什么比模型复杂
```flow
Vue 的响应式更新
执行渲染或副作用｜设置当前依赖收集上下文
读取代理属性或 ref｜把消费者与具体属性关联
写入状态｜识别变化并通知依赖
调度相关工作｜去重、排序，避免无意义重复更新
重新执行并清理依赖｜条件分支变化后，不再依赖的字段应退出
```
例如 `enabled ? a : b`，关闭 enabled 后不应继续让 a 的变化触发无意义工作。真实系统要在重新执行时维护依赖集合，处理函数抛错与嵌套调用。组件更新还有调度层，而不是像上面的模型一样每次 setter 立即修改 DOM。
## 选择合适的响应式边界
大型第三方对象、编辑器实例或外部状态系统不一定需要深度代理。可以根据用途使用 shallowRef、markRaw 等明确边界，但避免一半代理一半原始对象造成身份混淆。不要为了“性能优化”到处跳过响应式，应先知道哪些数据参与界面与更新。

学习时先能画出“消费者→对象属性”的依赖关系，再判断值变化会通知谁。生产排查则看是否经过代理入口、是否复制成快照、是否仍引用正确对象，以及组件是否已经卸载。
