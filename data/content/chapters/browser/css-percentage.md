---
{"id":"css-percentage","moduleId":"css","title":"百分比布局：参考谁、何时能算出来、为什么高度不生效","new":true,"order":2,"prerequisites":["css-box-bfc"],"sources":["mdn-css"],"logs":["200","32"],"example":"const containingWidth = 400;\nconsole.log(containingWidth * 0.5);\nconsole.log(containingWidth * 0.08);","exampleDescription":"计算宽度和内边距的数值。实际 CSS 是否有确定的包含块尺寸，需要结合正文页面实验判断。","runtime":"model"}
---
## 百分比不是相对于屏幕的统一单位

`50%` 必须先知道“谁的 50%”。CSS 不同属性规定的参考对象不同：普通流元素的 width 通常参考包含块的宽度；transform 中的 translate 百分比通常参考元素自身的参考盒；font-size 百分比参考父元素字体大小。相同的数字放在不同属性里，含义可能完全不同。

包含块不是永远等于 DOM 父元素。普通块布局、绝对定位、固定定位有不同规则，某些 transform、contain 等属性还可能建立特定定位元素的包含块。因此排查百分比先确认布局模式，再找包含块，最后看尺寸是否确定，不能只在父节点上反复加 height。

## 宽度如何计算，盒模型又加了什么

父容器内容宽度为 400px，子元素 `width:50%`，声明宽度通常为 200px。若默认 content-box，再加左右 padding 各 20px 和边框各 2px，子盒实际边框宽度为 244px。`box-sizing:border-box` 改变 width 所控制的范围，让边框盒总宽度保持 200px。margin 仍在盒子外，不包含在 border-box 内。

```html
<style>
.parent { width:400px; border:2px solid #386; }
.child { width:50%; padding:20px; border:2px solid #c85;
         box-sizing:border-box; background:#f6e7ca; }
</style>
<div class="parent"><div class="child">边框盒为父内容宽度的一半</div></div>
```

在浏览器检查元素的盒模型面板，将 box-sizing 切换为 content-box，比较两种宽度。再把父宽度改成 `min(90vw, 600px)`，子元素随包含块变化，而不是自己去读取屏幕宽度。

## 为什么 height:100% 看起来没有效果

普通非绝对定位场景里，如果包含块高度由内容撑开，百分比高度可能无法从一个确定的高度计算，通常按 auto 处理。父亲说“我的高度由孩子决定”，孩子又说“我是父亲的一半”，这会形成循环依赖，不能拿一个尚不存在的数直接乘 50%。Flex、Grid 和定位布局有专门的确定尺寸规则，不能把这句入门解释机械套给所有情况。

```html
<style>
.panel { height:240px; border:1px solid; }
.half { height:50%; background:#dceade; }
</style>
<div class="panel"><div class="half">这里高 120px</div></div>
```

删除 panel 的 height 再观察；然后尝试 `min-height:240px`。min-height 表示下限，不能在所有场景里直接当成确定的 height。做整屏布局时，可以明确页面根部尺寸链，或用 `min-height:100dvh`、Flex 的剩余空间分配，而不是给所有祖先盲目写 `height:100%`。

## 内边距与平移是容易混淆的两类

在常见水平书写模式下，普通块的百分比 padding（包括上下方向）按包含块的内联尺寸，即通常的宽度计算。这就是传统 padding 比例盒能表示固定宽高比的原因：宽 400px，padding-top 为 56.25%，得到 225px。现在表达媒体比例优先用 `aspect-ratio:16/9`，意图更明确。

```css
.centered {
  position:absolute;
  left:50%;              /* 位置相对包含块宽度 */
  transform:translateX(-50%); /* 平移相对自身参考盒宽度 */
}
```

left 的一半和 translate 的一半参考对象不同，正是这个差异把元素中心对齐，而不是两个百分比“相互抵消”。父宽 800、子宽 200 时，先左移到400的位置，再回退100，最终左边缘300。

```flow
排查百分比的顺序
确认属性｜width、height、padding、font-size、translate 的规则不同
确定布局与包含块｜普通流、Flex/Grid、绝对或固定定位
检查参考尺寸是否确定｜避免 auto 内容高度与百分比高度循环依赖
计算使用值与盒模型｜再加边框、内边距，考虑 min/max 约束
```

工程里用百分比表达比例，用 Flex/Grid 表达空间分配，用容器查询表达组件在不同可用空间中的布局变化。它们可以组合，但不要把所有自适应都写成固定百分比；长文本、语言切换、最小内容尺寸都会改变最终表现。
