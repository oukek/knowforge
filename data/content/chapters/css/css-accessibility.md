---
{"id":"css-accessibility","moduleId":"css","title":"语义、键盘与可访问交互","prerequisites":["css-box-bfc","css-flex-grid"],"sources":["mdn-css"],"reviewedRewrite":"2026-11-09-all"}
---
## 从具体问题认识语义、键盘与可访问交互

可访问交互让键盘、屏幕阅读器、触摸和不同视觉能力的用户都能完成任务。语义HTML提供角色、状态和默认交互，ARIA可以补充缺少的信息，但不会自动实现键盘行为。把div写成role=button后，它不会因此自动获得原生按钮的完整能力。

学习时从用户要完成的动作出发：能否找到控件、知道当前状态、激活它、理解结果并返回原位置。视觉上“像按钮”只是其中一个条件。

## 语义、焦点顺序与弹层边界

按钮用于执行动作，链接用于导航，表单字段需要可关联的label，错误信息应与字段建立关系。只有placeholder的输入在开始填写后失去提示，也不应作为完整标签替代。图标按钮需要可访问名称，装饰图标则避免重复朗读。

Tab顺序通常跟随DOM结构，正tabindex容易造成视觉和键盘顺序不一致。焦点样式必须可见，不应为美观直接outline:none而不提供替代。自定义列表需要根据角色选择方向键、Enter、Escape等交互，并区分当前焦点和已选值。

模态弹层打开时把焦点放到合适位置，限制背景交互，关闭后返回触发者；长表单还要确保标题和操作可到达。aria-modal只提供语义，不替你完成焦点约束和滚动锁定。错误、加载与成功提示可用适当live region，但过度播报每次字符变化会干扰使用。

## 浏览器实验：明确名称与状态

示例保留按钮自身的键盘能力，以aria-expanded表达展开状态，正文通过hidden控制显示。复杂弹窗仍需另外实现焦点与背景管理。

```html
<button id="toggle" aria-expanded="false" aria-controls="details">课程说明</button>
<div id="details" hidden>这里是展开后的内容。</div>
<script>
const button=document.querySelector("#toggle");
const panel=document.querySelector("#details");
button.onclick=()=>{ panel.hidden=!panel.hidden; button.setAttribute("aria-expanded",String(!panel.hidden)); };
</script>
```

## 把机制放到一条完整路径中

```flow
一次可访问交互
控件可被发现｜语义、名称和顺序清楚
焦点可到达并可见｜键盘与触摸路径合理
动作有明确结果｜状态、错误和进度可感知
结束后恢复位置｜弹层退出回到原上下文
```

## 配套代码：键盘操作也能进入相同命令

下面复用本课的确定性机制实验，只表达所讨论的局部关系，不等于真实宿主、数据库或模型服务。

模拟按钮键盘激活；真实页面优先用原生 button，它已提供语义与交互行为。

```javascript
let count = 0;
function activate(key) {
  if (key === 'Enter' || key === ' ') count++;
}
activate('Enter'); activate('ArrowDown'); activate(' ');
console.log(count);
console.log(['按钮', '输入框', '提交'].join(' → '));
```

Enter 和 Space 在模型里进入同一动作，方向键未触发。真实可访问性还需要焦点、禁用状态、label、读屏和顺序，不能靠这个函数替代原生控件。

## 从示例走向实际使用

用键盘从页面顶部走完整流程，再用屏幕阅读器检查名称、角色与状态。移动端也要验证触摸目标与阅读顺序，颜色不能作为唯一错误提示。

示例和课内模型可以说明状态关系，最终验收必须操作真实DOM。自动检查能发现部分问题，但无法替代用户能否完成任务的流程测试。
