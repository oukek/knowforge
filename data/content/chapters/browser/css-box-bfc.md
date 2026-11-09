---
{"id":"css-box-bfc","moduleId":"css","title":"盒模型与 BFC：普通流、浮动、外边距折叠从头讲","prerequisites":[],"sources":["mdn-css"]}
---
## 从一个矩形理解盒模型

浏览器布局的大部分对象都可以从盒子理解：content 放内容，padding 在内容与边框之间留空间，border 画边界，margin 把自己与外部隔开。设置 width 不等于设置“所有占用宽度”：content-box 控制内容盒，border-box 控制包含内边距和边框的盒子；外边距始终不在 border-box 里。

一个 width:200px、padding:20px、border:2px 的 content-box，边框盒宽度是244px。理解这一点后，才能解释两个各50%宽的元素为什么加上 padding 后可能放不下。百分比的参考尺寸与盒模型是两步计算，不能混为一个规则。

## 什么叫格式化上下文

格式化上下文可以看作一组盒子共同遵守的排版规则。块格式化上下文 BFC（Block Formatting Context）负责普通块盒和浮动在某个区域里的相互作用。它不是一个真实 HTML 标签，不是 JS 对象，也不是 z-index 层。建立 BFC 并不会把子元素整体变成一张独立合成图层。

普通块在纵向排列，而浮动会退出通常的块排列方式，让相邻行内内容围绕它。BFC 的意义是限定这类布局影响：内部浮动与外部普通流之间形成一定边界，某些外边距折叠不会跨越该边界，BFC 根的自动高度计算也会考虑内部浮动。这里的“独立”只针对规定的布局关系，不等于样式不继承或性能完全隔离。

```flow
先确定规则，再解释现象
盒模型｜内容、内边距、边框、外边距的尺寸
普通流｜块盒与行内内容如何排布
浮动｜脱离普通块排列，文本可环绕
BFC 边界｜限制浮动影响，并参与高度与外边距规则
```

## 浮动为什么会让容器看起来塌了

父容器里只有一个浮动元素时，常规自动高度计算不按普通流子块那样把它计入。父容器的背景和边框因此可能看起来只有很矮一条。不是子节点没了，也不是高度真的“泄漏”，而是父元素使用的高度计算规则不同。

```html
<style>
.card { border:2px solid #498; padding:8px; }
.photo { float:left; width:100px; height:80px; background:#cdf; }
.fixed { display:flow-root; }
</style>
<div class="card"><div class="photo">浮动图片</div></div>
<p style="clear:both">对照下面的 flow-root：</p>
<div class="card fixed"><div class="photo">浮动图片</div></div>
```

保存为 HTML 打开，对照父边框包围范围。flow-root 直接表达“建立新的块格式化上下文”，比为了触发 BFC 使用 overflow:hidden 更少附带裁剪副作用。后者可能隐藏阴影、菜单或滚动内容。clear 主要使元素避开前方浮动，与让父容器建立新 BFC 是不同手段。

## 外边距折叠究竟折叠了什么

普通块在某些垂直相邻关系里，margin 不按简单相加计算。例如两个正常流块的相邻正 margin 为20px和30px，间距通常是30px，而不是50px。存在负 margin 时还有更细的合并规则。折叠主要讨论块方向外边距，不是左右 margin 都会折叠，更不是 padding 会折叠。

父元素没有边框、padding 或其它阻隔时，首个正常流子块的顶部 margin 可能与父元素发生折叠，让人感觉“子元素把父元素推下来了”。给父元素建立 BFC，或使用合适的 padding/边框，可以阻断特定父子折叠。但**同一个 BFC 内的相邻普通块仍可能折叠**，因此“BFC 可以彻底消除 margin 折叠”不准确。

## BFC 在现代布局中怎样使用

`display:flow-root`、浮动、某些 overflow 值、绝对定位等可以触发相应格式化上下文，但要考虑附带语义。Flex 和 Grid 容器建立的是各自的格式化上下文；它们也有隔离浮动和外边距的规则，却不应被简单说成“都是 BFC”。

两列布局优先考虑 Flex/Grid；为历史图文环绕或浮动区域收口时，flow-root 更直观。修复问题前先确认是盒模型计算、普通流、浮动影响还是外边距折叠。只背“overflow:hidden 触发 BFC”会让一种布局问题变成裁剪或滚动问题。
