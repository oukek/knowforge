---
{"id":"vue-testing","title":"Vue 表单、可访问交互与组件测试","moduleId":"vue","prerequisites":["vue-components","vue-computed-watch"],"sources":["vue","vue-render"],"new":true,"order":10,"logs":["false","true"],"example":"const valid=name=>name.trim().length>=2;\nconsole.log(valid(' '));\nconsole.log(valid('小林'));","exampleDescription":"独立测试表单校验规则，组件内的交互与异步行为需要组件测试。"}
---
## 表单状态不只是一个字符串
用户编辑时可能有空值、无效值、输入中间态、服务端校验失败和重复提交。v-model 让 DOM 输入与状态保持约定关系，不会自动提供业务校验。把年龄直接转成数字时还要区分空字符串与0，金额则应明确最小单位与舍入规则。

组件表单通过 modelValue / update:modelValue 或相应宏建立契约。父组件拥有最终值，子组件报告编辑。状态合法不等于有权限提交，服务器必须再次验证数据与身份。
## 组件测试应该从用户可见行为开始

组件内部变量名和实现步骤可以重构，用户依赖的是输入后显示什么、点击后发生什么、失败时能否恢复。测试应通过公开props、事件和DOM交互观察契约。例如提交表单不只断言按钮存在，还要输入合法与非法值，检查提交事件负载、错误提示和重复点击行为。

单元测试适合纯计算，组件测试验证渲染与交互，端到端测试验证真实路由、接口和浏览器协作。不要让每个小分支都跑完整端到端流程，也不要只用mock组件测试就宣称真实登录和网络已经验证。

## 响应式更新与异步依赖要分别等待

触发事件后，Vue可能尚未提交DOM，应等待组件测试工具提供的更新完成方式或nextTick；请求Promise完成则是另一条等待关系。一次nextTick不会让尚未返回的网络自动成功，固定sleep也不能证明所有异步状态已稳定。替身接口应由测试明确控制完成、失败与取消时点。

组件使用Router、Store或provide上下文时，测试需要提供真实最小依赖或有契约的替身。测试之间重建状态，避免前一个测试留下的选择、登录信息或计时器影响后一个。定时行为可用可控时钟，但也要验证卸载会清理任务。

对于列表身份、弹层焦点和滚动，真实浏览器测试更能覆盖DOM细节。SSR则应补水合检查；代码能编译、组件能挂载、用户能正确完成任务，是不同强度的证据，报告时要区分。

## 一个能说明责任边界的表单
```html
<script setup>
import { ref, computed } from 'vue';
const name = ref('');
const saving = ref(false);
const error = ref('');
const valid = computed(()=>name.value.trim().length>=2);
async function submit() {
  if (!valid.value || saving.value) return;
  saving.value=true; error.value='';
  try {
    const response=await fetch('/api/profile',{method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name.value.trim()})});
    if (!response.ok) throw new Error('保存失败');
  } catch (e) { error.value=e.message; }
  finally { saving.value=false; }
}
</script>
<template>
  <form @submit.prevent="submit">
    <label for="name">姓名</label>
    <input id="name" v-model="name" autocomplete="name">
    <p v-if="error" role="alert">{{ error }}</p>
    <button :disabled="!valid || saving">{{ saving?'保存中':'保存' }}</button>
  </form>
</template>
```
示例假设认证与 CSRF 契约在请求层补齐。真实产品还应展示成功结果，并考虑卸载取消、服务器返回的规范化名称以及保存冲突。禁用按钮减少误触，不能替代后端幂等和数据校验。
## 测试用户可见行为
使用组件测试工具挂载组件，填写输入并提交，断言请求参数、loading、错误和成功结果。测试不应只检查 ref 叫不叫 name，重构内部变量不该破坏业务测试。异步更新需要等待框架 flush 与请求 Promise 完成，而不是硬编码 sleep 一秒。
```flow
表单测试场景
空值与无效值｜不能错误提交，说明应可感知
合法提交｜参数正确，状态进入保存中
重复点击或慢响应｜不创建意外重复操作
服务端失败｜保留用户输入，允许合理重试
键盘操作｜标签、焦点、Enter 提交和错误提示正常
```
## 分清测试层次
纯函数测试验证规则和转换，组件测试验证交互与状态，端到端测试验证真实路由、认证和服务。模拟网络响应应包含失败与延迟，不能只写永远成功的 mock。对弹窗表单还需检查焦点进入、关闭后归还及移动端滚动，截图正确不代表键盘可用。

性能优化前先确保这些契约稳定。组件测试通过也不能保证线上接口没变，因此前后端共享契约和必要集成测试仍然重要。
